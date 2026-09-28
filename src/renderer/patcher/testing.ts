import assert from "node:assert/strict";

import type { ModuleFactory, Patch, PatchDefinition } from "../webpack/types";
import { patchFactory } from "./patchFactory";

export const errors: unknown[][] = [];
export const logger = { error: (...values: unknown[]) => errors.push(values) };

// Builds a module from source shaped like Fluxer's compiled code: "function(e,t,n){...}".
export const compile = (source: string): ModuleFactory => new Function(`return ${source}`)();

export function run(factory: ModuleFactory): any {
  const module = { exports: {} as any };
  factory.call(module.exports, module, module.exports, (() => {}) as any);
  return module.exports;
}

export const pendingFor = (plugin: { name: string; patches: PatchDefinition[] }) =>
  plugin.patches.map((patch): Patch => ({ ...patch, plugin: plugin.name }));

// Patches a module, checks that every matching patch applied, and returns what the module exports.
export function runPatched(patches: Patch[], factory: ModuleFactory): any {
  const patched = patchFactory(1, factory, patches, logger);
  assert.deepEqual(errors, []);
  assert.notEqual(patched, factory);
  return run(patched);
}

export function resetPatching(...plugins: { name: string; [key: string]: unknown }[]): void {
  errors.length = 0;
  (globalThis as any).Influx = {
    plugins: Object.fromEntries(plugins.map((plugin) => [plugin.name, plugin])),
  };
}
