export type ModuleId = string | number;

export interface WebpackModule {
  id?: ModuleId;
  loaded?: boolean;
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

export interface PatchDef {
  find: string | RegExp;
  replacement: PatchReplacement | PatchReplacement[];
  all?: boolean;
  predicate?(): boolean;
}

export interface Patch extends PatchDef {
  plugin: string;
}
