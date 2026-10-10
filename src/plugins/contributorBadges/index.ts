import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";

import { INFLUX_REPOSITORY } from "../../shared/version";

const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#fff" fill-rule="evenodd" d="M17 15Q13 14 12 15Q11 16 10 18Q8 21 8 25Q8 28 11 29Q13 31 14 31Q15 32 15 33Q15 34 13 39Q11 45 11 47Q11 50 10 51Q10 52 9 57Q8 63 7 66Q5 68 5 70Q5 71 5 72Q4 73 4 75Q4 78 10 79Q16 80 18 81Q20 81 21 81Q22 82 24 82Q27 82 28 83Q30 83 32 83Q34 83 35 84Q36 85 45 86Q55 86 56 86Q57 86 58 83Q60 80 60 79Q60 77 61 75Q62 73 63 71Q63 68 71 68Q80 69 82 68Q85 67 85 66Q86 65 86 62Q86 59 87 58Q88 57 88 55Q87 53 86 51Q84 50 77 48Q70 47 69 45Q67 43 67 42Q67 41 69 39Q70 37 74 37Q78 38 79 38Q80 39 83 39Q85 39 86 40Q87 40 91 40Q94 40 95 39Q96 38 96 32Q96 27 95 25Q93 24 87 22Q82 21 74 20Q67 19 63 18Q60 16 55 16Q49 16 48 17Q47 18 47 19Q47 20 45 20Q44 20 39 20Q34 19 32 18Q30 16 25 16Q21 16 17 15ZM41 37Q38 36 37 37Q37 38 36 41Q35 43 35 45Q35 48 32 56Q30 64 31 66Q31 67 34 69Q37 70 37 69Q38 68 40 64Q41 59 43 49Q45 40 44 38Q43 37 41 37Z"/><path d="M17 19Q15 19 14 20Q13 21 13 23Q13 24 14 25Q16 27 18 28Q19 28 19 31Q19 34 16 50Q12 66 12 67Q11 68 11 71Q11 74 15 76Q18 77 25 79Q31 80 32 80Q34 79 34 79Q35 78 35 77Q35 75 30 74Q25 72 25 71Q24 70 24 69Q24 67 29 50Q34 32 39 32Q44 32 45 31Q46 30 46 29Q46 27 44 25Q43 24 39 23Q36 23 28 21Q20 19 17 19Z"/><path fill="#2f6bf6" d="M57 22Q54 22 54 23Q53 24 52 31Q51 38 51 40Q50 41 51 44Q51 48 49 56Q46 65 46 68Q46 71 45 75Q44 78 46 79Q47 80 50 80Q52 80 56 70Q59 61 61 61Q63 61 65 62Q66 62 72 63Q77 63 79 63Q80 62 81 61Q82 60 82 57Q82 55 82 54Q81 53 79 52Q77 51 74 51Q72 51 67 50Q63 49 64 41Q66 33 68 33Q70 33 76 34Q82 36 86 36Q90 36 90 36Q91 35 92 34Q92 33 92 31Q91 29 90 29Q88 28 86 27Q83 27 71 25Q59 22 57 22Z"/></svg>`;
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
    "Shows an Influx Contributor badge on the profiles of everyone who has contributed to Influx.",
  authors: [Contributor.Kairu],
  required: true,

  patches: [
    {
      find: '"user.user-profile-badges.div"',
      replacement: {
        match: /return (\i)\},\[((?:\i,)*)(\i)\.flags,/,
        replace: "return $self.addBadges($1,$3)},[$2$3.flags,$3.id,",
      },
    },
  ],

  addBadges(badges: IconBadge[], user: { id: string }): IconBadge[] {
    if (contributorIds.has(user.id)) {
      badges.push({
        type: "icon",
        key: "influx_contributor",
        iconUrl: BADGE_ICON_URL,
        tooltip: "Influx Contributor",
        url: `https://github.com/${INFLUX_REPOSITORY}`,
      });
    }
    return badges;
  },
});
