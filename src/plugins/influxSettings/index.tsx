import definePlugin from "@api/Plugins";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { cancelAutoUpdate, scheduleAutoUpdate } from "./autoUpdate";
import { captureInviteEmbed, iconOrFallback } from "./components";
import { InfluxTab } from "./InfluxTab";
import { PluginsTab } from "./PluginsTab";
import { settings } from "./settings";
import { STYLES } from "./styles";

const CATEGORY = "influx";
const CATEGORY_LABEL = "Influx";
const STYLE_ID = "influx-settings-styles";

interface SettingsTab {
  type: string;
  category: string;
  label: string;
  icon: unknown;
  iconWeight?: string;
}

const TABS = [
  { type: "influx_home", label: "Influx", icon: "UsersThreeIcon", component: InfluxTab },
  { type: "influx_plugins", label: "Plugins", icon: "PlugIcon", component: PluginsTab },
];

export default definePlugin({
  name: "InfluxSettings",
  description:
    "Adds the Influx category to Fluxer settings (plugins, updates, community) and the Influx version to build info.",
  authors: [Contributor.Kairu],
  required: true,
  settings,

  patches: [
    {
      find: '"desktop_settings"!==',
      replacement: {
        match: /return (\i)\.filter\((?=\i=>!\(!\i&&\("my_profile"===)/,
        replace: "return $self.addTabs($1).filter(",
      },
    },
    {
      find: 'case"user_settings":return',
      replacement: {
        match: /switch\((\i)\)\{case"user_settings":/,
        replace: 'if($1==="influx")return $self.categoryLabel;$&',
      },
    },
    {
      find: '"app.client-info.span--2"',
      replacement: {
        match: /\(0,(\i)\.jsx\)\("span",\{"data-flx":"app\.client-info\.span--2",children:\i\}\)/,
        replace:
          '$&,(0,$1.jsx)("span",{"data-flx":"influx.client-info.version",children:$self.versionLabel})',
      },
    },
    {
      find: '"channel.invite-embed.inner"',
      replacement: {
        match:
          /(\i)=(\(0,\i\.\i\)\(function\(\{code:\i,message:\i,sourceChannel:\i,onDelete:\i\}\)\{[^{}]*?\{[^{}]*\}\):[^{}]*?\{[^{}]*"data-flx":"channel\.invite-embed\.inner"\}\)\}\))/,
        replace: "$1=$self.captureInviteEmbed($2)",
      },
    },
    {
      find: /\{my_profile:\i,account_security:\i/,
      replacement: {
        match: /\{(?=my_profile:\i,account_security:\i)/g,
        replace: "{...$self.tabComponents,",
      },
    },
  ],

  captureInviteEmbed,
  categoryLabel: CATEGORY_LABEL,
  versionLabel: `Influx ${INFLUX_VERSION}`,
  tabComponents: Object.fromEntries(TABS.map((tab) => [tab.type, tab.component])),

  addTabs(tabs: SettingsTab[]): SettingsTab[] {
    try {
      const ours = TABS.map(({ type, label, icon }) => ({
        type,
        label,
        category: CATEGORY,
        icon: iconOrFallback(icon),
      }));
      const developerIndex = tabs.findIndex((tab) => tab.category === "developer");
      tabs.splice(developerIndex === -1 ? tabs.length : developerIndex, 0, ...ours);
    } catch (error) {
      console.error("[Influx] Failed to add settings tabs", error);
    }
    return tabs;
  },

  start() {
    scheduleAutoUpdate();
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    cancelAutoUpdate();
    disableStyle(STYLE_ID);
  },
});
