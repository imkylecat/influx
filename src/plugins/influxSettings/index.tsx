import definePlugin from "@api/Plugins";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";

import { autoUpdateTimer, scheduleAutoUpdate } from "./autoUpdate";
import { captureInviteEmbed, captureSettingsSearch, iconOrFallback } from "./components";
import { InfluxTab } from "./InfluxTab";
import { PluginsTab } from "./PluginsTab";
import { settings } from "./settings";

import STYLES from "./styles.css" with { type: "text" };

const CATEGORY = "influx";
const STYLE_ID = "influx-settings-styles";

interface SettingsTab {
  type: string;
  category: string;
  label: string;
  icon: unknown;
}

const TABS = [
  { type: "influx_home", label: "Influx", icon: "UsersThreeIcon", component: InfluxTab },
  { type: "influx_plugins", label: "Plugins", icon: "PlugIcon", component: PluginsTab },
];

export default definePlugin({
  name: "InfluxSettings",
  description:
    "Adds the Influx category to Fluxer settings (plugins, updates, community) and the Influx version to the build details.",
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
        replace: 'if($1==="influx")return"Influx";$&',
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
      // The settings search keeps a shorter copy of this list and falls back to the full one.
      find: /\{my_profile:[^{}]+,advanced_settings:/,
      replacement: {
        match: /\{(?=my_profile:[^{}]+,advanced_settings:)/,
        replace: "{...$self.tabComponents,",
      },
    },
    {
      find: '"ui.action-menu.settings-context-menu.menu-group--3"',
      replacement: {
        match:
          /\i\.length>0&&(\(0,\i\.jsx\)\(\i\.\i,\{"data-flx":")ui\.action-menu\.settings-context-menu\.menu-group--3(",children:)\i(\.map\(\i\)\}\))/,
        replace: "$1influx.settings-context-menu.menu-group$2$self.influxTabs()$3,$&",
      },
    },
    {
      find: '"app.settings-search.container"',
      replacement: {
        match:
          /(\i)=(\(0,\i\.\i\)\(\(\{className:\i,placeholder:\i,value:\i,onChange:\i\}\)=>\{.+?"app\.settings-search\.input\.query-change\.text"\}\)\}\)\}\)\}\))/,
        replace: "$1=$self.captureSettingsSearch($2)",
      },
    },
  ],

  captureInviteEmbed,
  captureSettingsSearch,
  versionLabel: `Influx ${INFLUX_VERSION}`,
  tabComponents: Object.fromEntries(TABS.map((tab) => [tab.type, tab.component])),

  influxTabs(): SettingsTab[] {
    return TABS.map(({ type, label, icon }) => ({
      type,
      label,
      category: CATEGORY,
      icon: iconOrFallback(icon),
    }));
  },

  addTabs(tabs: SettingsTab[]): SettingsTab[] {
    const developerIndex = tabs.findIndex((tab) => tab.category === "developer");
    tabs.splice(developerIndex === -1 ? tabs.length : developerIndex, 0, ...this.influxTabs());
    return tabs;
  },

  start() {
    if (INFLUX_DESKTOP) scheduleAutoUpdate();
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    clearTimeout(autoUpdateTimer);
    disableStyle(STYLE_ID);
  },
});
