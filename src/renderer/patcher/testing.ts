import type { ModuleFactory, Patch } from "../webpack/types";

export const errors: unknown[][] = [];
export const logger = { error: (...values: unknown[]) => errors.push(values) };

export function run(factory: ModuleFactory): any {
  const module = { exports: {} as any };
  factory.call(module.exports, module, module.exports, (() => {}) as any);
  return module.exports;
}

export const pendingFor = (plugin: { name: string; patches: Patch[] | Omit<Patch, "plugin">[] }) =>
  plugin.patches.map((patch) => ({ ...patch, plugin: plugin.name }) as Patch);

export function resetPatching(...plugins: { name: string; [key: string]: unknown }[]): void {
  errors.length = 0;
  (globalThis as any).Influx = {
    plugins: Object.fromEntries(plugins.map((plugin) => [plugin.name, plugin])),
  };
}
