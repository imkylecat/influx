import { definePluginSettings } from "@api/Settings";

export const settings = definePluginSettings({
  autoUpdate: {
    type: "boolean",
    description: "Download and install new Influx versions automatically when Fluxer starts.",
    default: true,
    hidden: true,
  },
  pluginFilter: {
    type: "select",
    description: "Which plugins the Plugins tab shows.",
    options: ["all", "enabled", "disabled", "configurable"],
    default: "all",
    hidden: true,
  },
});
