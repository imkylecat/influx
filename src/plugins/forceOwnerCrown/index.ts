import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";

const HIDES_CROWN = /\i\.features\.has\(\i\.\i\.HIDE_OWNER_CROWN\)/;

export default definePlugin({
  name: "ForceOwnerCrown",
  description: "Shows the server owner's crown even in servers that have hidden it.",
  authors: [Contributor.Kairu],

  patches: [
    {
      find: '"channel.member-list-item.crown-icon"',
      replacement: { match: HIDES_CROWN, replace: "!1" },
    },
    {
      find: '"channel.channel-details-bottom-sheet-member-list.mobile-member-list-item.member-name"',
      replacement: { match: HIDES_CROWN, replace: "!1" },
    },
    {
      find: "hideOwnerCrown:",
      replacement: {
        match: /hideOwnerCrown:\i\.features\.has\(\i\.\i\.HIDE_OWNER_CROWN\)/,
        replace: "hideOwnerCrown:!1",
      },
    },
  ],
});
