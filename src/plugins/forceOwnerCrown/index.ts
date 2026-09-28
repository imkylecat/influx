import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";

export default definePlugin({
  name: "ForceOwnerCrown",
  description: "Shows the server owner's crown even in servers that have hidden it.",
  authors: [Contributor.Kairu],

  patches: [
    '"channel.member-list-item.crown-icon"',
    '"channel.channel-details-bottom-sheet-member-list.mobile-member-list-item.member-name"',
    "hideOwnerCrown:",
  ].map((find) => ({
    find,
    replacement: { match: /\i\.features\.has\(\i\.\i\.HIDE_OWNER_CROWN\)/, replace: "!1" },
  })),
});
