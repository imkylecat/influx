export type ModuleId = string | number;

export interface WebpackModule {
  exports: any;
}

export type ModuleFactory = (
  this: unknown,
  module: WebpackModule,
  exports: any,
  require: WebpackRequire,
) => void;

export interface WebpackRequire {
  (id: ModuleId): any;
  m: Record<ModuleId, ModuleFactory>;
}

export interface PatchReplacement {
  match: string | RegExp;
  replace: string | ((substring: string, ...groups: any[]) => string);
}

export interface PatchDefinition {
  find: string | RegExp;
  replacement: PatchReplacement | PatchReplacement[];
}

export interface Patch extends PatchDefinition {
  plugin: string;
}
