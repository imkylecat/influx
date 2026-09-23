import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";
import { findIcon } from "@webpack/common";
import { cancelAutoUpdate, scheduleAutoUpdate } from "./autoUpdate";
import { InfluxTab } from "./InfluxTab";
import { PluginsTab } from "./PluginsTab";
import { settings } from "./settings";
import { STYLES } from "./styles";

const CATEGORY = "influx";
const CATEGORY_LABEL = "Influx";
const STYLE_ID = "influx-settings-styles";

const PluginIconFallback = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="1em"
    height="1em"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M237.66 66.34a8 8 0 0 0-11.32 0L192 100.69 155.31 64l34.35-34.34a8 8 0 1 0-11.32-11.32L144 52.69l-18.34-18.35a8 8 0 0 0-11.32 11.32L120.69 52 66.34 106.34a36 36 0 0 0 0 50.91l6.06 6.06-54.06 54.06a8 8 0 0 0 11.32 11.32l54.06-54.06 6.06 6.06a36 36 0 0 0 50.91 0L204 126.31l6.34 6.35a8 8 0 0 0 11.32-11.32L203.31 103l34.35-34.34a8 8 0 0 0 0-11.32Z" />
  </svg>
);

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
      find: /\{my_profile:\i,account_security:\i/,
      replacement: {
        match: /\{(?=my_profile:\i,account_security:\i)/g,
        replace: "{...$self.tabComponents,",
      },
    },
  ],

  categoryLabel: CATEGORY_LABEL,
  versionLabel: `Influx ${INFLUX_VERSION}`,
  tabComponents: Object.fromEntries(TABS.map((tab) => [tab.type, tab.component])),

  addTabs(tabs: SettingsTab[]): SettingsTab[] {
    try {
      const ours = TABS.map(({ type, label, icon }) => ({
        type,
        label,
        category: CATEGORY,
        icon: findIcon(icon) ?? PluginIconFallback,
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
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.append(style);
  },

  stop() {
    cancelAutoUpdate();
    document.getElementById(STYLE_ID)?.remove();
  },
});
