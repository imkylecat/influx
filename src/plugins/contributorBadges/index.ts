import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";
import { INFLUX_REPO } from "../../shared/version";

const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b7bff"/><stop offset="1" stop-color="#5b3ee6"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="7" fill="url(#g)"/><path d="M6 9.5c2-2 4-2 6 0s4 2 6 0M6 14.5c2-2 4-2 6 0s4 2 6 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
const BADGE_ICON_URL = `data:image/svg+xml,${encodeURIComponent(BADGE_SVG)}`;

const contributorIds = new Set<string>(
  Object.values(Contributor).map((contributor) => contributor.id),
);

interface IconBadge {
  type: "icon";
  key: string;
  iconUrl: string;
  tooltip: string;
  url?: string;
}

export default definePlugin({
  name: "ContributorBadges",
  description:
    "Shows an Influx Contributor badge on the profiles of everyone in the contributor registry.",
  authors: [Contributor.Kairu],
  required: true,

  patches: [
    {
      find: '"user.user-profile-badges.div"',
      replacement: {
        match: /return (\i)\},\[(\i),(\i)\.flags,/,
        replace: "return $self.addBadges($1,$3)},[$2,$3.flags,$3.id,",
      },
    },
  ],

  addBadges(badges: IconBadge[], user: { id?: string }): IconBadge[] {
    if (user?.id && contributorIds.has(user.id)) {
      badges.push({
        type: "icon",
        key: "influx_contributor",
        iconUrl: BADGE_ICON_URL,
        tooltip: "Influx Contributor",
        url: `https://github.com/${INFLUX_REPO}`,
      });
    }
    return badges;
  },
});
