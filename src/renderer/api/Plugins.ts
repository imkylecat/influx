import type { Contributor } from "../utils/constants";
import { Logger } from "../utils/Logger";
import type { Patch, PatchDefinition } from "../webpack/types";
import { getPluginData, type PluginSettings, saveSettings } from "./Settings";

const logger = new Logger("Plugins");

export interface PluginDefinition {
  name: string;
  description: string;
  authors: Contributor[];
  patches?: PatchDefinition[];
  settings?: PluginSettings<any>;
  enabledByDefault?: boolean;
  required?: boolean;
  start?(): void;
  stop?(): void;
}

export default function definePlugin<P extends PluginDefinition>(plugin: P & ThisType<P>): P {
  if (plugin.settings) plugin.settings.pluginName = plugin.name;
  return plugin;
}

export const plugins: Record<string, PluginDefinition> = {};
export const pendingPatches: Patch[] = [];
const started = new Set<string>();
const enabledAtStartup = new Map<string, boolean>();

export function isPluginEnabled(plugin: PluginDefinition): boolean {
  return (
    plugin.required || (getPluginData(plugin.name).enabled ?? plugin.enabledByDefault ?? false)
  );
}

export function registerPlugins(list: PluginDefinition[]): void {
  for (const plugin of list) {
    if (plugins[plugin.name]) {
      logger.error(`Duplicate plugin name ${plugin.name}, skipping`);
      continue;
    }
    plugins[plugin.name] = plugin;
    const enabled = isPluginEnabled(plugin);
    enabledAtStartup.set(plugin.name, enabled);
    if (!enabled) continue;
    for (const patch of plugin.patches ?? []) {
      pendingPatches.push({ ...patch, plugin: plugin.name });
    }
  }
}

export function getPluginsNeedingReload(): string[] {
  return Object.values(plugins)
    .filter(
      (plugin) =>
        plugin.patches?.length && enabledAtStartup.get(plugin.name) !== isPluginEnabled(plugin),
    )
    .map((plugin) => plugin.name);
}

function startPlugin(plugin: PluginDefinition): void {
  if (started.has(plugin.name)) return;
  try {
    plugin.start?.();
    started.add(plugin.name);
  } catch (error) {
    logger.error(`Failed to start ${plugin.name}`, error);
  }
}

function stopPlugin(plugin: PluginDefinition): void {
  if (!started.has(plugin.name)) return;
  try {
    plugin.stop?.();
    started.delete(plugin.name);
  } catch (error) {
    logger.error(`Failed to stop ${plugin.name}`, error);
  }
}

export function startAllPlugins(): void {
  for (const plugin of Object.values(plugins)) {
    if (isPluginEnabled(plugin)) startPlugin(plugin);
  }
}

export function setPluginEnabled(name: string, enabled: boolean): void {
  const plugin = plugins[name];
  if (!plugin) throw new Error(`Unknown plugin ${name}`);
  if (plugin.required && !enabled) throw new Error(`${name} is required and cannot be disabled`);

  getPluginData(name).enabled = enabled;
  saveSettings();

  if (plugin.patches?.length) return;
  if (enabled) startPlugin(plugin);
  else stopPlugin(plugin);
}
