import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Stores } from "@webpack/common";

const settings = definePluginSettings({
  forceStaff: {
    type: "boolean",
    description:
      "Also treat you as Fluxer staff, showing staff-only settings and menus. Fluxer's server still refuses staff actions.",
    default: false,
  },
});

export default definePlugin({
  name: "ForceDeveloperMode",
  description: "Turns on Fluxer's developer mode without tapping the build number 7 times.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: "get isDeveloper(){",
      replacement: {
        match: /get isDeveloper\(\)\{/,
        replace: "$&return!0;",
      },
    },
    {
      find: "isStaff(){var",
      replacement: {
        match: /isStaff\(\)\{/,
        replace: "$&if($self.isForcedStaff(this))return!0;",
      },
    },
  ],

  isForcedStaff(user: { id: string }) {
    return settings.store.forceStaff && user.id === Stores.Users()?.currentUserId;
  },
});
