import { onGatewayEvents } from "@api/Gateway";
import definePlugin from "@api/Plugins";
import { definePluginSettings, onSettingsChange, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import {
  Components,
  findIcon,
  nativeClasses,
  observable,
  React,
  reaction,
  Stores,
} from "@webpack/common";
import type { FluxerMessage, FluxerUser } from "@webpack/fluxer";

const settings = definePluginSettings({
  memberList: {
    type: "boolean",
    description: "Show the platform icon in the member list.",
    default: true,
  },
  messages: {
    type: "boolean",
    description: "Show the platform icon next to names in chat.",
    default: true,
  },
  avatars: {
    type: "boolean",
    description: "Replace the status dot on avatars with the platform icon.",
    default: false,
  },
  messageAvatars: {
    type: "boolean",
    description: "Show the platform icon on avatars in chat.",
    default: false,
  },
});

type Place = "memberList" | "messages";

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
};

// The spacing of the owner crown and of the bot tag.
const WRAPPER_CLASSES: Record<Place, string> = {
  memberList: "MemberListItem.module__ownerIcon___",
  messages: "Message.module__userTagOffset___",
};

interface Platform {
  status: string;
  mobile: boolean;
}

interface WirePresence {
  user?: { id?: string };
  status?: string;
  mobile?: boolean;
}

// Fluxer forgets which members are on mobile, and its own store only knows friends and people
// it has subscribed to. These are observable, so Fluxer's components redraw when they change.
let seen: Map<string, Platform> | undefined;
let settingsVersion: { get(): number; set(value: number): void } | undefined;

const seenPlatforms = () => (seen ??= observable()?.map(undefined, { deep: false }));
const settingsChanges = () => (settingsVersion ??= observable()?.box(0));

function capture(presence: WirePresence | null | undefined, userId = presence?.user?.id): void {
  if (!userId || !presence?.status) return;
  seenPlatforms()?.set(userId, { status: presence.status, mobile: presence.mobile === true });
}

const LISTENERS = {
  READY(data: { presences?: WirePresence[] }) {
    seen?.clear();
    data.presences?.forEach((presence) => capture(presence));
  },
  PRESENCE_UPDATE: (data: WirePresence) => capture(data),
  PRESENCE_UPDATE_BULK(data: { presences?: WirePresence[] }) {
    data.presences?.forEach((presence) => capture(presence));
  },
  GUILD_MEMBERS_CHUNK(data: { presences?: WirePresence[] }) {
    data.presences?.forEach((presence) => capture(presence));
  },
  GUILD_MEMBER_LIST_UPDATE(data: {
    ops?: { items?: { member?: { user?: { id?: string }; presence?: WirePresence | null } }[] }[];
  }) {
    for (const operation of data.ops ?? []) {
      for (const { member } of operation.items ?? []) capture(member?.presence, member?.user?.id);
    }
  },
};

// Fluxer's own status when it has one. The member list and avatars pass the status they show.
function platformOf(userId: string, status?: string | null): Platform | undefined {
  const presence = Stores.Presence();
  const live = presence?.getStatus(userId);
  const known = live !== undefined && live !== "offline";
  const captured = seenPlatforms()?.get(userId);
  const mobile = known ? presence!.isMobile(userId) : captured?.mobile;
  status ??= known ? live : captured?.status;
  return status ? { status, mobile: mobile ?? false } : undefined;
}

function render(platform: Platform | undefined, size: string) {
  const statusLabel = platform && STATUS_LABELS[platform.status];
  const Icon = findIcon(platform?.mobile ? "DeviceMobileIcon" : "DesktopIcon");
  if (!statusLabel || !Icon) return undefined;
  return {
    icon: <Icon size={size} weight="fill" color={`var(--status-${platform.status})`} />,
    label: `${statusLabel} on ${platform.mobile ? "mobile" : "desktop or web"}`,
  };
}

const WATCH_MILLISECONDS = 4 * 60_000;
const watched = new Map<string, number>();

// Asks Fluxer for a member's status, as opening their profile does. Fluxer drops it after 5 minutes.
function watch(guildId: string, userId: string): void {
  const key = `${guildId}:${userId}`;
  if (Date.now() - (watched.get(key) ?? 0) < WATCH_MILLISECONDS) return;
  watched.set(key, Date.now());
  Stores.MemberPresenceSubscription()?.touchMember(guildId, userId);
}

function PlatformIndicator({
  user,
  place,
  status,
  message,
}: {
  user?: FluxerUser;
  place: Place;
  status?: string | null;
  message?: FluxerMessage;
}) {
  useSettings();
  const userId = user?.id;
  const subscribe = React.useCallback(
    (onChange: () => void) =>
      reaction()?.(() => JSON.stringify(userId && platformOf(userId, status)), onChange) ??
      (() => {}),
    [userId, status],
  );
  const platform = React.useSyncExternalStore(subscribe, () =>
    JSON.stringify(userId && platformOf(userId, status)),
  );
  // Bots are online without using an app.
  const person = userId !== undefined && !user?.bot && message?.webhookId == null;
  const guildId = message?.guildId;
  const watching = person && guildId && (settings.store.messages || settings.store.messageAvatars);
  React.useEffect(() => {
    if (!watching) return;
    watch(guildId, userId);
    const timer = setInterval(() => watch(guildId, userId), WATCH_MILLISECONDS);
    return () => clearInterval(timer);
  }, [watching, guildId, userId]);

  const shown = person && platform ? render(JSON.parse(platform), "0.875rem") : undefined;
  const Tooltip = Components.Tooltip();
  if (!settings.store[place] || !shown) return null;
  const icon = <span className={nativeClasses(WRAPPER_CLASSES[place])}>{shown.icon}</span>;
  return Tooltip ? <Tooltip text={shown.label}>{icon}</Tooltip> : icon;
}

// Props for the badge Fluxer draws over an avatar's status, as it does for muted people in voice.
function badge(user: FluxerUser, status?: string | null) {
  const shown = user.bot ? undefined : render(platformOf(user.id, status), "100%");
  return (
    shown && {
      customStatusBadge: shown.icon,
      customStatusBadgeColor: "transparent",
      customStatusBadgeLabel: shown.label,
    }
  );
}

let stopListening: (() => void) | undefined;
let stopWatchingSettings: (() => void) | undefined;

export default definePlugin({
  name: "PlatformIndicators",
  description:
    "Shows whether people are on mobile or on desktop or web, with an icon colored by their status. Fluxer doesn't share which of desktop and web it is.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"channel.member-list-item.user-tag"',
      replacement: {
        match:
          /(\i)\.bot&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:\1\.system,"data-flx":"channel\.member-list-item\.user-tag"\}\)/,
        replace: (match: string, user: string, jsx: string, offset: number, code: string) => {
          // The status the member list shows, passed to the avatar a little earlier.
          const status =
            /status:([\w$]+),[^{}]*"data-flx":"channel\.member-list-item\.status-aware-avatar"/.exec(
              code.slice(0, offset),
            )?.[1];
          return `(0,${jsx}.jsx)($self.PlatformIndicator,{user:${user},status:${status},place:"memberList"}),${match}`;
        },
      },
    },
    {
      find: '"channel.user-message.message-username--2"',
      replacement: {
        // The same author names as ShowMeYourName, after its username when that patch ran first.
        match:
          /\(0,(\i)\.jsx\)\(\i,\{user:(\i),message:(\i),guild:\i,member:[^}]{0,300}?"data-flx":"channel\.(?:user-message|compact-message-layout\.compact-author-prefix)\.message-username(?:--\d)?"\}\)(?:,Influx\.plugins\["ShowMeYourName"\]\.renderUsername\(\i,\i\))?/g,
        replace: '$&,(0,$1.jsx)($self.PlatformIndicator,{user:$2,message:$3,place:"messages"})',
      },
    },
    {
      find: '"ui.status-aware-avatar.avatar"',
      replacement: {
        match:
          /user:(\i),size:\i,status:(\i),isMobileStatus:\i,[^}]{0,400}?"data-flx":"ui\.status-aware-avatar\.avatar"/,
        replace: "$&,...$self.avatarBadge($1,$2)",
      },
    },
    {
      find: '"channel.message-avatar.avatar"',
      replacement: {
        match:
          /user:(\i),size:\i,className:\i,forceAnimate:\i,[^}]{0,120}?"data-flx":"channel\.message-avatar\.avatar"/,
        replace: "$&,...$self.messageAvatarBadge($1)",
      },
    },
  ],

  PlatformIndicator,

  // Reading the settings version redraws Fluxer's avatars when a setting changes.
  avatarBadge(user: FluxerUser, status: string | null | undefined) {
    settingsChanges()?.get();
    return settings.store.avatars && status ? badge(user, status) : undefined;
  },

  messageAvatarBadge(user: FluxerUser) {
    settingsChanges()?.get();
    return settings.store.messageAvatars ? badge(user) : undefined;
  },

  start() {
    stopListening = onGatewayEvents(this.name, LISTENERS);
    stopWatchingSettings = onSettingsChange(() => {
      const changes = settingsChanges();
      changes?.set(changes.get() + 1);
    });
  },

  stop() {
    stopListening?.();
    stopWatchingSettings?.();
    seen?.clear();
    watched.clear();
  },
});
