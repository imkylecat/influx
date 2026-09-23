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
  description:
    "Turns on Fluxer's developer mode without tapping the build number 7 times. Staff-only tools stay hidden unless you turn them on below, and Fluxer's server checks those itself.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      // DeveloperMode.isDeveloper: true for staff or after the 7-tap unlock.
      find: "get isDeveloper(){",
      replacement: {
        match: /get isDeveloper\(\)\{/,
        replace: "$&return!0;",
      },
    },
    {
      // UserRecord.isStaff: the is_staff field or the STAFF flag, for any user.
      find: "isStaff(){var",
      replacement: {
        match: /isStaff\(\)\{/,
        replace: "$&if($self.isForcedStaff(this))return!0;",
      },
    },
  ],

  isForcedStaff(user: { id?: string } | undefined) {
    try {
      return (
        settings.store.forceStaff && user?.id != null && user.id === Stores.Users()?.currentUserId
      );
    } catch {
      return false;
    }
  },
});
