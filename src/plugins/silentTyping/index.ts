import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";

const settings = definePluginSettings({
  active: {
    type: "boolean",
    description: "Hide your typing indicator. Takes effect immediately.",
    default: true,
  },
});

export default definePlugin({
  name: "SilentTyping",
  description: "Stops Fluxer from telling others that you're typing.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: "Failed to send typing indicator to channel",
      replacement: {
        match: /postTyping\(\i\)\{/,
        replace: "$&if($self.shouldSuppress())return;",
      },
    },
  ],

  shouldSuppress(): boolean {
    return settings.store.active;
  },
});
