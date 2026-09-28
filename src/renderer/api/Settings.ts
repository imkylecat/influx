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

interface PluginSettingsData {
  enabled?: boolean;
  [option: string]: unknown;
}

interface SettingsData {
  plugins: Record<string, PluginSettingsData>;
}

// Settings saved under plugin and option names that have since changed.
const RENAMED_PLUGINS: Record<string, string> = { AnonymiseFileNames: "AnonymizeFileNames" };
const RENAMED_OPTIONS: Record<string, Record<string, string>> = {
  ForceFlags: { guildFeatures: "serverFeatures" },
  MessageLinkEmbeds: { maxEmbeds: "maximumPreviews" },
  RelationshipNotifier: { toast: "popup" },
  SendConfirmation: { channelIds: "confirmChannels" },
};

function migrate({ plugins }: SettingsData): void {
  for (const [from, to] of Object.entries(RENAMED_PLUGINS)) {
    if (!(from in plugins)) continue;
    plugins[to] ??= plugins[from];
    delete plugins[from];
  }
  for (const [plugin, options] of Object.entries(RENAMED_OPTIONS)) {
    const data = plugins[plugin];
    if (!data) continue;
    for (const [from, to] of Object.entries(options)) {
      if (!(from in data)) continue;
      data[to] ??= data[from];
      delete data[from];
    }
  }
}

function load(): SettingsData {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const data: SettingsData = { plugins: {}, ...JSON.parse(raw) };
      migrate(data);
      return data;
    }
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

type SelectOption = string | { label: string; value: string };

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
