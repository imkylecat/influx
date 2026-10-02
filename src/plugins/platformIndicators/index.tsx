import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, findIcon, nativeClasses, React, Stores } from "@webpack/common";
import type { FluxerUser } from "@webpack/fluxer";

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

function platform(status: string | null | undefined, mobile: boolean, size: string) {
  const statusLabel = status && STATUS_LABELS[status];
  const Icon = findIcon(mobile ? "DeviceMobileIcon" : "DesktopIcon");
  if (!statusLabel || !Icon) return undefined;
  return {
    icon: <Icon size={size} weight="fill" color={`var(--status-${status})`} />,
    label: `${statusLabel} on ${mobile ? "mobile" : "desktop or web"}`,
  };
}

function PlatformIndicator({ userId, place }: { userId?: string; place: Place }) {
  useSettings();
  const presence = Stores.Presence();
  const subscribe = React.useCallback(
    (onChange: () => void) =>
      (userId && presence?.subscribeToUserStatus(userId, onChange)) || (() => {}),
    [presence, userId],
  );
  const status = React.useSyncExternalStore(subscribe, () => userId && presence?.getStatus(userId));
  const mobile = React.useSyncExternalStore(subscribe, () => userId && presence?.isMobile(userId));
  const shown = platform(status, mobile || false, "0.875rem");
  const Tooltip = Components.Tooltip();
  if (!settings.store[place] || !shown) return null;
  // Bots are online without using an app.
  if (Stores.Users()?.getUser(userId!)?.bot) return null;
  const icon = <span className={nativeClasses(WRAPPER_CLASSES[place])}>{shown.icon}</span>;
  return Tooltip ? <Tooltip text={shown.label}>{icon}</Tooltip> : icon;
}

// Props for the badge Fluxer draws over an avatar's status, as it does for muted people in voice.
function badge(user: FluxerUser, status: string | null | undefined, mobile: boolean) {
  const shown = user.bot ? undefined : platform(status, mobile, "100%");
  return (
    shown && {
      customStatusBadge: shown.icon,
      customStatusBadgeColor: "transparent",
      customStatusBadgeLabel: shown.label,
    }
  );
}

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
        replace: '(0,$2.jsx)($self.PlatformIndicator,{userId:$1.id,place:"memberList"}),$&',
      },
    },
    {
      find: '"channel.user-message.message-username--2"',
      replacement: {
        // The same author names as ShowMeYourName, after its username when that patch ran first.
        match:
          /\(0,(\i)\.jsx\)\(\i,\{user:(\i),message:\i,guild:\i,member:[^}]{0,300}?"data-flx":"channel\.(?:user-message|compact-message-layout\.compact-author-prefix)\.message-username(?:--\d)?"\}\)(?:,Influx\.plugins\["ShowMeYourName"\]\.renderUsername\(\i,\i\))?/g,
        replace: '$&,(0,$1.jsx)($self.PlatformIndicator,{userId:$2?.id,place:"messages"})',
      },
    },
    {
      find: '"ui.status-aware-avatar.avatar"',
      replacement: {
        match:
          /user:(\i),size:\i,status:(\i),isMobileStatus:(\i),[^}]{0,400}?"data-flx":"ui\.status-aware-avatar\.avatar"/,
        replace: "$&,...$self.avatarBadge($1,$2,$3)",
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

  avatarBadge(user: FluxerUser, status: string | null | undefined, mobile: boolean) {
    return settings.store.avatars ? badge(user, status, mobile) : undefined;
  },

  messageAvatarBadge(user: FluxerUser) {
    const presence = Stores.Presence();
    return settings.store.messageAvatars && presence
      ? badge(user, presence.getStatus(user.id), presence.isMobile(user.id))
      : undefined;
  },
});
