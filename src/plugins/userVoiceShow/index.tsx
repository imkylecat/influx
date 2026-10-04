import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import {
  channelIcon,
  Components,
  findIcon,
  nativeClasses,
  NicknameLookup,
  React,
  showToast,
  Stores,
} from "@webpack/common";
import type { FluxerChannel, FluxerUser, VoiceStateWire } from "@webpack/fluxer";
import type { ComponentType, MouseEvent, ReactNode } from "react";

import { STYLES } from "./styles";

const settings = definePluginSettings({
  showInUserProfileModal: {
    type: "boolean",
    description: "Show a user's voice channel indicator in their profile next to the name.",
    default: true,
  },
  showInMemberList: {
    type: "boolean",
    description: "Show a user's voice channel indicator in the member and direct message lists.",
    default: true,
  },
  showInMessages: {
    type: "boolean",
    description: "Show a user's voice channel indicator in messages.",
    default: true,
  },
});

const STYLE_ID = "influx-user-voice-show";
const VIEW_CHANNEL = 1n << 10n;
const CONNECT = 1n << 20n;
const DOUBLE_CLICK_MILLISECONDS = 250;

type AllVoiceStates = ReturnType<
  NonNullable<ReturnType<typeof Stores.MediaEngine>>["getAllVoiceStates"]
>;
const voiceStatesByUser = new WeakMap<AllVoiceStates, Map<string, VoiceStateWire>>();

const subscribe = (onChange: () => void) => Stores.MediaEngine()?.subscribe(onChange) ?? (() => {});

function voiceStateOf(userId: string | undefined): VoiceStateWire | undefined {
  const all = Stores.MediaEngine()?.getAllVoiceStates();
  if (!all || !userId) return undefined;
  let byUser = voiceStatesByUser.get(all);
  if (!byUser) {
    byUser = new Map();
    for (const channels of Object.values(all)) {
      for (const connections of Object.values(channels)) {
        for (const voiceState of Object.values(connections)) {
          if (voiceState.channel_id && !byUser.has(voiceState.user_id)) {
            byUser.set(voiceState.user_id, voiceState);
          }
        }
      }
    }
    voiceStatesByUser.set(all, byUser);
  }
  return byUser.get(userId);
}

function channelUsers(channel: FluxerChannel): FluxerUser[] {
  const all = Stores.MediaEngine()?.getAllVoiceStates() ?? {};
  const connections = all[channel.guildId ?? "@me"]?.[channel.id] ?? {};
  const userIds = new Set(Object.values(connections).map((voiceState) => voiceState.user_id));
  return [...userIds]
    .map((userId) => Stores.Users()?.getUser(userId))
    .filter((user) => user !== undefined);
}

function directMessageName(channel: FluxerChannel): string {
  return (
    channel.name ||
    channel.recipientIds
      .map((userId) => Stores.Users()?.getUser(userId))
      .filter((user) => user !== undefined)
      .map((user) => NicknameLookup()?.(user, undefined, channel.id) ?? user.username)
      .join(", ")
  );
}

function VoiceChannelTooltip({ channel, icon }: { channel: FluxerChannel; icon: ReactNode }) {
  const users = React.useSyncExternalStore(subscribe, () =>
    JSON.stringify(channelUsers(channel).map((user) => user.id)),
  );
  const AvatarStack = Components.AvatarStack();
  return (
    <div className={nativeClasses("GuildsLayout.module__guildTooltipContainer___")}>
      <span className={nativeClasses("GuildsLayout.module__guildTooltipName___")}>
        In voice chat
      </span>
      <div className={nativeClasses("GuildsLayout.module__guildTooltipHeader___")}>
        {!channel.isPrivate() && channelIcon()?.(channel, { size: "1rem" })}
        <span className={nativeClasses("GuildsLayout.module__guildTooltipName___")}>
          {channel.isPrivate() ? directMessageName(channel) : channel.name}
        </span>
      </div>
      <div className={nativeClasses("GuildsLayout.module__guildVoiceInfo___")}>
        {icon}
        {AvatarStack && (
          <AvatarStack
            key={users}
            users={channelUsers(channel)}
            size={18}
            maxVisible={13}
            guildId={channel.guildId}
            channelId={channel.id}
            enableProfileModal={false}
            showTooltips={false}
          />
        )}
      </div>
    </div>
  );
}

interface VoiceChannelIndicatorProps {
  userId?: string;
  isProfile?: boolean;
  isMessage?: boolean;
  ActionButton?: ComponentType<{
    tooltip: () => ReactNode;
    onClick: (event: MouseEvent) => void;
    children: ReactNode;
  }>;
}

const clickTimers = new Map<string, ReturnType<typeof setTimeout>>();

function VoiceChannelIndicator({
  userId,
  isProfile,
  isMessage,
  ActionButton,
}: VoiceChannelIndicatorProps) {
  useSettings();
  const voiceState = React.useSyncExternalStore(subscribe, () => voiceStateOf(userId));
  const shown = isProfile
    ? settings.store.showInUserProfileModal
    : isMessage
      ? settings.store.showInMessages
      : settings.store.showInMemberList;
  const channel = voiceState && Stores.Channels()?.getChannel(voiceState.channel_id);
  if (!shown || !channel) return null;

  const permission = Stores.Permission();
  const isDirectMessage = channel.isPrivate();
  if (!isDirectMessage && !permission?.can(VIEW_CHANNEL, channel)) return null;
  const isLocked = !isDirectMessage && !permission?.can(CONNECT, channel);
  const isMuted = voiceState.mute || voiceState.self_mute;
  const isDeaf = voiceState.deaf || voiceState.self_deaf;

  function onClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!channel) return;

    clearTimeout(clickTimers.get(channel.id));
    clickTimers.delete(channel.id);

    if (event.detail > 1) {
      if (isLocked) {
        showToast("error", "You can't join this user's voice channel.");
        return;
      }
      void Stores.MediaEngine()?.connectToVoiceChannel(channel.guildId ?? null, channel.id);
    } else {
      clickTimers.set(
        channel.id,
        setTimeout(() => {
          const navigation = Stores.Navigation();
          if (channel.guildId) navigation?.navigateToGuild(channel.guildId, channel.id);
          else navigation?.navigateToDM(channel.id);
          clickTimers.delete(channel.id);
        }, DOUBLE_CLICK_MILLISECONDS),
      );
    }
  }

  const SpeakerIcon = findIcon("SpeakerHighIcon");
  const StateIcon = findIcon(isDeaf ? "SpeakerSlashIcon" : "MicrophoneSlashIcon");
  const Icon = isDeaf || isMuted ? StateIcon : SpeakerIcon;
  const getLockedIcon = channelIcon();
  const Tooltip = Components.Tooltip();
  if (!Icon || !SpeakerIcon || !getLockedIcon) return null;

  const speaker = (size: string) =>
    isLocked ? (
      getLockedIcon(channel, { size }, { locked: true })
    ) : (
      <SpeakerIcon size={size} weight="fill" />
    );
  const size = ActionButton ? "1.25rem" : "1rem";
  const icon = isLocked ? speaker(size) : <Icon size={size} weight="fill" />;
  const tooltip = () => <VoiceChannelTooltip channel={channel} icon={speaker("1.125rem")} />;
  if (ActionButton) {
    return (
      <ActionButton tooltip={tooltip} onClick={onClick}>
        {icon}
      </ActionButton>
    );
  }

  const button = (
    <button
      type="button"
      className={`influx-voice-indicator ${nativeClasses(
        isMessage ? "Message.module__userTagOffset___" : "MemberListItem.module__ownerIcon___",
      )}`}
      aria-label="In voice chat"
      onClick={onClick}
    >
      {icon}
    </button>
  );
  return Tooltip ? <Tooltip text={tooltip}>{button}</Tooltip> : button;
}

export default definePlugin({
  name: "UserVoiceShow",
  description: "Shows an indicator when a user is in a voice channel.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"user.profile.profile-card.profile-card-user-info.badge-container"',
      replacement: {
        match:
          /("data-flx":"user\.profile\.profile-card\.profile-card-user-info\.badge-container",children:)(\(\i\.bot\|\|\i\)&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:(\i)\.system,"data-flx":"user\.profile\.profile-card\.profile-card-user-info\.user-tag-wrapper"\}\))/,
        replace: "$1[(0,$3.jsx)($self.VoiceChannelIndicator,{userId:$4.id,isProfile:!0}),$2]",
      },
    },
    {
      find: '"user.user-profile-modal.user-info.user-tag"',
      replacement: {
        match:
          /(\i)\.bot&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:\1\.system,size:"lg","data-flx":"user\.user-profile-modal\.user-info\.user-tag"\}\)/,
        replace: "(0,$2.jsx)($self.VoiceChannelIndicator,{userId:$1.id,isProfile:!0}),$&",
      },
    },
    {
      find: '"channel.member-list-item.user-tag"',
      replacement: {
        match:
          /(\i)\.bot&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:\1\.system,"data-flx":"channel\.member-list-item\.user-tag"\}\)/,
        replace: "(0,$2.jsx)($self.VoiceChannelIndicator,{userId:$1.id}),$&",
      },
    },
    {
      find: '"channel.direct-message.dm-list-item.dm-item-user-tag"',
      replacement: {
        match:
          /!\i&&\i&&\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,system:null==(\i)\?void 0:\2\.system,"data-flx":"channel\.direct-message\.dm-list-item\.dm-item-user-tag(?:--2)?"\}\)/g,
        replace: "(0,$1.jsx)($self.VoiceChannelIndicator,{userId:$2?.id}),$&",
      },
    },
    {
      find: '"channel.friends.friend-list-item.action-button.click"',
      replacement: {
        match:
          /children:(\i\.map\(\(\i,\i\)=>\(0,(\i)\.jsx\)\((\i),\{tooltip:\i\.tooltip,[^}]*"data-flx":"channel\.friends\.friend-list-item\.action-button\.click",children:\i\.icon\},\i\)\))/,
        replace: (
          _,
          actions: string,
          jsx: string,
          button: string,
          offset: number,
          code: string,
        ) => {
          const props = code.lastIndexOf(",relationshipType:", offset);
          const userId = /\{userId:([\w$]+)$/.exec(code.slice(props - 40, props))?.[1];
          return `children:[(0,${jsx}.jsx)($self.VoiceChannelIndicator,{userId:${userId},ActionButton:${button}}),${actions}]`;
        },
      },
    },
    {
      find: '"channel.user-message.message-username--2"',
      replacement: {
        match:
          /\(0,(\i)\.jsx\)\(\i,\{user:(\i),message:\i,guild:\i,member:[^}]{0,300}?"data-flx":"channel\.(?:user-message|compact-message-layout\.compact-author-prefix)\.message-username(?:--\d)?"\}\)(?:,Influx\.plugins\["ShowMeYourName"\]\.renderUsername\(\i,\i\))?(?:,\(0,\i\.jsx\)\(Influx\.plugins\["PlatformIndicators"\]\.PlatformIndicator,\{[^}]*\}\))?/g,
        replace: "$&,(0,$1.jsx)($self.VoiceChannelIndicator,{userId:$2?.id,isMessage:!0})",
      },
    },
  ],

  VoiceChannelIndicator,

  start() {
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    disableStyle(STYLE_ID);
    for (const timer of clickTimers.values()) clearTimeout(timer);
    clickTimers.clear();
  },
});
