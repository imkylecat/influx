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

// The seconds spent in the current call. With a channel, only while the call is in that channel.
function useCallSeconds(channelId?: string): number | undefined {
  return React.useSyncExternalStore(subscribe, () => {
    const engine = Stores.MediaEngine();
    return engine?.connected && (channelId === undefined || engine.channelId === channelId)
      ? engine.voiceStats.duration
      : undefined;
  });
}

// A row styled like the connection ID row that Fluxer can show in the same panel.
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

// A badge styled like the user count of voice channels with a user limit.
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
        // Before the user count and everything that decides whether it shows.
        match:
          /(?<=,)[^,]{0,60}null!=(\i)\.userLimit&&\(0,(\i)\.jsx\)\("div",\{className:\i\.\i,"data-flx":"app\.channel-item\.voice-user-count"/,
        replace: "(0,$2.jsx)($self.ChannelTimer,{channelId:$1.id}),$&",
      },
    },
  ],

  CallTimer,
  ChannelTimer,
});
