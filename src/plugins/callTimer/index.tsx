import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { findIcon, formatDuration, nativeClasses, React, Stores } from "@webpack/common";

const settings = definePluginSettings({
  channelList: {
    type: "boolean",
    description: "Show the call length next to your voice channel in the channel list.",
    default: true,
  },
});

const subscribe = (onChange: () => void) => Stores.MediaEngine()?.subscribe(onChange) ?? (() => {});

function useCallSeconds(channelId?: string): number | undefined {
  return React.useSyncExternalStore(subscribe, () => {
    const engine = Stores.MediaEngine();
    return engine?.connected && (channelId === undefined || engine.channelId === channelId)
      ? engine.voiceStats.duration
      : undefined;
  });
}

function CallTimer() {
  const seconds = useCallSeconds();
  const format = formatDuration();
  const ClockIcon = findIcon("ClockIcon");
  if (seconds === undefined || !format) return null;
  return (
    <div className={nativeClasses("VoiceConnectionStatus.module__connectionIdRow___")}>
      {ClockIcon && (
        <ClockIcon
          weight="regular"
          className={nativeClasses("VoiceConnectionStatus.module__connectionIdIcon___")}
        />
      )}
      <span className={nativeClasses("VoiceConnectionStatus.module__connectionIdValueText___")}>
        {format(seconds)}
      </span>
    </div>
  );
}

function ChannelTimer({ channelId }: { channelId: string }) {
  useSettings();
  const seconds = useCallSeconds(channelId);
  const format = formatDuration();
  if (!settings.store.channelList || seconds === undefined || !format) return null;
  return (
    <div className={nativeClasses("ChannelItem.module__voiceUserCount___")}>
      <div className={nativeClasses("VoiceChannelUserCount.module__wrapper___")}>
        <span
          className={nativeClasses("VoiceChannelUserCount.module__users___")}
          style={{ width: "auto" }}
        >
          {format(seconds)}
        </span>
      </div>
    </div>
  );
}

export default definePlugin({
  name: "CallTimer",
  description: "Shows how long you've been in a call, in the voice panel and the channel list.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"voice.voice-connection-status.voice-connection-status-inner.connection-id-row"',
      replacement: {
        match:
          /\i&&\i&&\(0,(\i)\.jsxs\)\("div",\{className:\i\.\i,"data-flx":"voice\.voice-connection-status\.voice-connection-status-inner\.connection-id-row"/,
        replace: "(0,$1.jsx)($self.CallTimer,{}),$&",
      },
    },
    {
      find: '"app.channel-item.voice-user-count"',
      replacement: {
        match:
          /(?<=,)[^,]{0,60}null!=(\i)\.userLimit&&\(0,(\i)\.jsx\)\("div",\{className:\i\.\i,"data-flx":"app\.channel-item\.voice-user-count"/,
        replace: "(0,$2.jsx)($self.ChannelTimer,{channelId:$1.id}),$&",
      },
    },
  ],

  CallTimer,
  ChannelTimer,
});
