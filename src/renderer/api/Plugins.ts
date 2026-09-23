import type { Contributor } from "../utils/constants";
import { Logger } from "../utils/Logger";
import type { Patch, PatchDef } from "../webpack/types";
import { getPluginData, type PluginSettings, saveSettings } from "./Settings";

const logger = new Logger("Plugins");

export interface PluginDef {
  name: string;
  description: string;
  authors: Contributor[];
  patches?: PatchDef[];
  settings?: PluginSettings<any>;
  enabledByDefault?: boolean;
  required?: boolean;
  start?(): void;
  stop?(): void;
}

export default function definePlugin<P extends PluginDef>(plugin: P & ThisType<P>): P {
  return plugin;
}

export const plugins: Record<string, PluginDef> = {};
export const pendingPatches: Patch[] = [];
const started = new Set<string>();
const enabledAtStartup = new Map<string, boolean>();

export function isPluginEnabled(plugin: PluginDef): boolean {
  return (
    plugin.required || (getPluginData(plugin.name).enabled ?? plugin.enabledByDefault ?? false)
  );
}

export function registerPlugins(list: PluginDef[]): void {
  for (const plugin of list) {
    if (plugins[plugin.name]) {
      logger.error(`Duplicate plugin name ${plugin.name}, skipping`);
      continue;
    }
    plugins[plugin.name] = plugin;
    if (plugin.settings) plugin.settings.pluginName = plugin.name;
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
    .filter((p) => p.patches?.length && enabledAtStartup.get(p.name) !== isPluginEnabled(p))
    .map((p) => p.name);
}

function startPlugin(plugin: PluginDef): boolean {
  if (started.has(plugin.name)) return true;
  try {
    plugin.start?.();
    started.add(plugin.name);
    return true;
  } catch (error) {
    logger.error(`Failed to start ${plugin.name}`, error);
    return false;
  }
}

function stopPlugin(plugin: PluginDef): boolean {
  if (!started.has(plugin.name)) return true;
  try {
    plugin.stop?.();
    started.delete(plugin.name);
    return true;
  } catch (error) {
    logger.error(`Failed to stop ${plugin.name}`, error);
    return false;
  }
}

export function startAllPlugins(): void {
  for (const plugin of Object.values(plugins)) {
    if (isPluginEnabled(plugin)) startPlugin(plugin);
  }
}

export function setPluginEnabled(name: string, enabled: boolean): boolean {
  const plugin = plugins[name];
  if (!plugin) throw new Error(`Unknown plugin ${name}`);
  if (plugin.required && !enabled) throw new Error(`${name} is required and cannot be disabled`);

  getPluginData(name).enabled = enabled;
  saveSettings();

  if (plugin.patches?.length) {
    logger.info(
      `${name} ${enabled ? "enabled" : "disabled"}. Reload Fluxer (Ctrl/Cmd+R) to apply its patches.`,
    );
    return true;
  }
  if (enabled) startPlugin(plugin);
  else stopPlugin(plugin);
  return false;
}
