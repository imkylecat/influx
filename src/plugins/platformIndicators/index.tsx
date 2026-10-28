import definePlugin from "@api/Plugins";
import { definePluginSettings, onSettingsChange, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import {
  Components,
  findIcon,
  nativeClasses,
  observable,
  observer,
  React,
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

const WRAPPER_CLASSES: Record<Place, string> = {
  memberList: "MemberListItem.module__ownerIcon___",
  messages: "Message.module__userTagOffset___",
};

interface Platform {
  status: string;
  mobile: boolean;
}

let settingsVersion: { get(): number; set(value: number): void } | undefined;
const settingsChanges = () => (settingsVersion ??= observable()?.box(0));

function listedPlatform(guildId: string, userId: string): Platform | undefined {
  for (const list of Object.values(Stores.MemberList()?.lists[guildId] ?? {})) {
    const status = list.presences.get(userId);
    if (status) return { status, mobile: list.mobileUserIds.has(userId) };
  }
  return undefined;
}

function platformOf(
  userId: string,
  guildId?: string | null,
  status?: string | null,
): Platform | undefined {
  const presence = Stores.Presence();
  const live = presence?.getStatus(userId);
  const platform =
    live !== undefined && live !== "offline"
      ? { status: live, mobile: presence!.isMobile(userId) }
      : guildId
        ? listedPlatform(guildId, userId)
        : undefined;
  status ??= platform?.status;
  return status ? { status, mobile: platform?.mobile ?? false } : undefined;
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

function watch(guildId: string, userId: string): void {
  const subscriptions = Stores.MemberPresenceSubscription();
  const touched = subscriptions?.subscriptions.get(guildId)?.get(userId) ?? 0;
  if (Date.now() - touched >= WATCH_MILLISECONDS) subscriptions?.touchMember(guildId, userId);
}

const PlatformIndicator = observer(function PlatformIndicator({
  user,
  place,
  status,
  guildId: listGuildId,
  message,
}: {
  user?: FluxerUser;
  place: Place;
  status?: string | null;
  guildId?: string | null;
  message?: FluxerMessage;
}) {
  useSettings();
  const userId = user?.id;
  const guildId = listGuildId ?? message?.guildId;
  const platform = userId ? platformOf(userId, guildId, status) : undefined;
  const person = userId !== undefined && !user?.bot && message?.webhookId == null;
  const watching =
    person && message && guildId && (settings.store.messages || settings.store.messageAvatars);
  React.useEffect(() => {
    if (!watching) return;
    watch(guildId, userId);
    const timer = setInterval(() => watch(guildId, userId), WATCH_MILLISECONDS);
    return () => clearInterval(timer);
  }, [watching, guildId, userId]);

  const shown = person && platform ? render(platform, "0.875rem") : undefined;
  if (!settings.store[place] || !shown) return null;
  const icon = <span className={nativeClasses(WRAPPER_CLASSES[place])}>{shown.icon}</span>;
  return <Components.Tooltip text={shown.label}>{icon}</Components.Tooltip>;
});

function badge(user: FluxerUser, guildId?: string | null, status?: string | null) {
  const shown = user.bot ? undefined : render(platformOf(user.id, guildId, status), "100%");
  return (
    shown && {
      customStatusBadge: shown.icon,
      customStatusBadgeColor: "transparent",
      customStatusBadgeLabel: shown.label,
    }
  );
}

let stopWatchingSettings: (() => void) | undefined;

export default definePlugin({
  name: "PlatformIndicators",
  description:
    "Shows whether people are on mobile or on desktop or web, with an icon colored by their status.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"channel.member-list-item.user-tag"',
      replacement: {
        match:
          /(\i)\.bot&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:\1\.system,"data-flx":"channel\.member-list-item\.user-tag"\}\)/,
        replace: (match: string, user: string, jsx: string, offset: number, code: string) => {
          const [, guildId, status] =
            /guildId:([\w$]+),status:([\w$]+),[^{}]*"data-flx":"channel\.member-list-item\.status-aware-avatar"/.exec(
              code.slice(0, offset),
            ) ?? [];
          return `(0,${jsx}.jsx)($self.PlatformIndicator,{user:${user},guildId:${guildId},status:${status},place:"memberList"}),${match}`;
        },
      },
    },
    {
      find: '"channel.user-message.message-username--2"',
      replacement: {
        match:
          /\(0,(\i)\.jsx\)\(\i(?:\.\i)?,\{user:(\i),message:(\i),guild:\i,member:[^}]{0,300}?"data-flx":"channel\.(?:user-message|compact-message-layout\.compact-author-prefix)\.message-username(?:--\d)?"\}\)(?:,Influx\.plugins\["ShowMeYourName"\]\.renderUsername\(\i,\i\))?/g,
        replace: '$&,(0,$1.jsx)($self.PlatformIndicator,{user:$2,message:$3,place:"messages"})',
      },
    },
    {
      find: '"ui.status-aware-avatar.avatar"',
      replacement: {
        match:
          /user:(\i),size:\i,status:(\i),isMobileStatus:\i,[^}]{0,300}?guildId:(\i),[^}]{0,100}?"data-flx":"ui\.status-aware-avatar\.avatar"/,
        replace: "$&,...$self.avatarBadge($1,$3,$2)",
      },
    },
    {
      find: '"channel.message-avatar.avatar"',
      replacement: {
        match:
          /user:(\i),size:\i,className:\i,forceAnimate:\i,guildId:(\i),[^}]{0,120}?"data-flx":"channel\.message-avatar\.avatar"/,
        replace: "$&,...$self.messageAvatarBadge($1,$2)",
      },
    },
  ],

  PlatformIndicator,

  avatarBadge(user: FluxerUser, guildId: string | null | undefined, status?: string | null) {
    settingsChanges()?.get();
    return settings.store.avatars && status ? badge(user, guildId, status) : undefined;
  },

  messageAvatarBadge(user: FluxerUser, guildId?: string) {
    settingsChanges()?.get();
    return settings.store.messageAvatars ? badge(user, guildId) : undefined;
  },

  start() {
    stopWatchingSettings = onSettingsChange(() => {
      const changes = settingsChanges();
      changes?.set(changes.get() + 1);
    });
  },

  stop() {
    stopWatchingSettings?.();
  },
});
