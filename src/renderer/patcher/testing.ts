import type { ModuleFactory, Patch } from "../webpack/types";

// Helpers for the .test.ts files beside the patcher and plugins.

export const errors: unknown[][] = [];
export const logger = { error: (...values: unknown[]) => errors.push(values) };

export function run(factory: ModuleFactory): any {
  const module = { exports: {} as any };
  factory.call(module.exports, module, module.exports, (() => {}) as any);
  return module.exports;
}

export const pendingFor = (plugin: { name: string; patches: Patch[] | Omit<Patch, "plugin">[] }) =>
  plugin.patches.map((patch) => ({ ...patch, plugin: plugin.name }) as Patch);

// Clears logged errors and gives patched code these plugins as $self.
export function resetPatching(...plugins: { name: string }[]): void {
  errors.length = 0;
  (globalThis as any).Influx = {
    plugins: Object.fromEntries(plugins.map((plugin) => [plugin.name, plugin])),
  };
}
