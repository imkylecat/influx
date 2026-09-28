import { Logger } from "../utils/Logger";

const logger = new Logger("Settings");
const STORAGE_KEY = "InfluxSettings";

const storage: Storage | null = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

export interface PluginSettingsData {
  enabled?: boolean;
  [option: string]: unknown;
}

interface SettingsData {
  plugins: Record<string, PluginSettingsData>;
}

function load(): SettingsData {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return { plugins: {}, ...JSON.parse(raw) };
  } catch (error) {
    logger.error("Failed to load settings, using defaults", error);
  }
  return { plugins: {} };
}

export const settings: SettingsData = load();

export function saveSettings(): void {
  if (!storage) {
    logger.error("No localStorage available; settings will not persist");
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logger.error("Failed to save settings", error);
  }
}

export function getPluginData(plugin: string): PluginSettingsData {
  return (settings.plugins[plugin] ??= {});
}

interface OptionBase {
  description: string;
  hidden?: boolean;
}

export type SelectOption = string | { label: string; value: string };

export type OptionDefinition =
  | (OptionBase & { type: "boolean"; default: boolean })
  | (OptionBase & { type: "number"; default: number })
  | (OptionBase & { type: "string"; default: string })
  | (OptionBase & { type: "select"; options: readonly SelectOption[]; default: string });

type OptionValue<O extends OptionDefinition> = O extends { type: "boolean" }
  ? boolean
  : O extends { type: "number" }
    ? number
    : string;
type OptionValues<D extends Record<string, OptionDefinition>> = {
  -readonly [K in keyof D]: OptionValue<D[K]>;
};

export interface PluginSettings<
  D extends Record<string, OptionDefinition> = Record<string, OptionDefinition>,
> {
  readonly definitions: D;
  readonly store: OptionValues<D>;
  pluginName?: string;
}

export function definePluginSettings<const D extends Record<string, OptionDefinition>>(
  definitions: D,
): PluginSettings<D> {
  const pluginSettings: PluginSettings<D> = {
    definitions,
    store: new Proxy({} as OptionValues<D>, {
      get(_, key: string) {
        const data = pluginSettings.pluginName ? getPluginData(pluginSettings.pluginName) : {};
        return key in data ? data[key] : definitions[key]?.default;
      },
      set(_, key: string, value) {
        const plugin = pluginSettings.pluginName;
        if (!plugin) throw new Error("Plugin settings used before the plugin was registered");
        getPluginData(plugin)[key] = value;
        saveSettings();
        return true;
      },
    }),
  };
  return pluginSettings;
}
