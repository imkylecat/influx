import { Logger } from "../utils/Logger";
import { React } from "../webpack/common";

const logger = new Logger("Settings");
const STORAGE_KEY = "InfluxSettings";
const SAVE_DELAY_MILLISECONDS = 1_000;

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

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let changes = 0;
const changeListeners = new Set<() => void>();

function writeSettings(): void {
  if (saveTimer === undefined) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    storage!.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logger.error("Failed to save settings", error);
  }
}

if (storage) window.addEventListener("pagehide", writeSettings);

// Tells components right away, and writes to storage once changes stop coming.
/** Write pending plugin settings immediately before a renderer reload or desktop relaunch. */
export function flushSettings(): void {
  writeSettings();
}

export function saveSettings(): void {
  changes++;
  for (const listener of changeListeners) listener();
  if (!storage) {
    logger.error("No localStorage available; settings will not persist");
    return;
  }
  saveTimer ??= setTimeout(writeSettings, SAVE_DELAY_MILLISECONDS);
}

// Returns a function that removes the listener again.
export function onSettingsChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

// Rerenders the component that calls it whenever a setting changes.
export function useSettings(): void {
  React.useSyncExternalStore(onSettingsChange, () => changes);
}

export function getPluginData(plugin: string): PluginSettingsData {
  return (settings.plugins[plugin] ??= {});
}

interface OptionBase {
  description: string;
  hidden?: boolean;
}

interface SelectOption {
  label: string;
  value: string;
}

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
