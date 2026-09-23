import { Logger } from "../utils/Logger";
import { getOriginalFactory, moduleCache, onModuleLoaded, wreq } from "./patchWebpack";
import type { ModuleId, WebpackModule } from "./types";

const logger = new Logger("Finders");

export type Filter = (value: any) => boolean;

const PROBE_PROP = "__influxProbe__";
const answersEverything = (value: any): boolean => value[PROBE_PROP] !== undefined;

function sourceMatches(source: string, code: ReadonlyArray<string | RegExp>): boolean {
  return code.every((c) => (typeof c === "string" ? source.includes(c) : c.test(source)));
}

export const filters = {
  byProps:
    (...props: string[]): Filter =>
    (value) =>
      value != null &&
      (typeof value === "object" || typeof value === "function") &&
      props.every((p) => value[p] !== undefined) &&
      !answersEverything(value),

  byCode:
    (...code: Array<string | RegExp>): Filter =>
    (value) =>
      typeof value === "function" && sourceMatches(Function.prototype.toString.call(value), code),

  byDisplayName:
    (name: string): Filter =>
    (value) =>
      value?.displayName === name,
};

function* exportCandidates(module: WebpackModule): Generator<any> {
  const { exports } = module;
  if (exports == null) return;
  yield exports;
  if (typeof exports !== "object" && typeof exports !== "function") return;
  for (const key of Object.keys(exports)) {
    let value: unknown;
    try {
      value = exports[key];
    } catch {
      continue;
    }
    if (value != null && value !== exports) yield value;
  }
}

function firstMatch(module: WebpackModule, filter: Filter): any {
  for (const candidate of exportCandidates(module)) {
    try {
      if (filter(candidate)) return candidate;
    } catch {}
  }
  return undefined;
}

export function find(filter: Filter): any {
  for (const module of moduleCache.values()) {
    const match = firstMatch(module, filter);
    if (match !== undefined) return match;
  }
  return undefined;
}

export function findAll(filter: Filter): any[] {
  const matches: any[] = [];
  for (const module of moduleCache.values()) {
    const match = firstMatch(module, filter);
    if (match !== undefined) matches.push(match);
  }
  return matches;
}

export const findByProps = (...props: string[]) => find(filters.byProps(...props));
export const findByCode = (...code: Array<string | RegExp>) => find(filters.byCode(...code));
export const findComponentByName = (name: string) => find(filters.byDisplayName(name));

export function waitFor(filter: Filter, callback: (value: any) => void): () => void {
  const existing = find(filter);
  if (existing !== undefined) {
    callback(existing);
    return () => {};
  }
  const unsubscribe = onModuleLoaded((module) => {
    const match = firstMatch(module, filter);
    if (match === undefined) return;
    unsubscribe();
    try {
      callback(match);
    } catch (error) {
      logger.error("waitFor callback threw", error);
    }
  });
  return unsubscribe;
}

const isComponent = (value: any): boolean =>
  typeof value === "function" ||
  (value != null && typeof value === "object" && typeof value.$$typeof === "symbol");

function unwrapComponent(component: any): any {
  for (let depth = 0; depth < 5 && component != null && typeof component === "object"; depth++) {
    component = component.render ?? component.type;
  }
  return component;
}

// Display names often sit on the inner function of memo() and forwardRef() wrappers.
function displayNameOf(component: any): string | undefined {
  for (let depth = 0; depth < 5 && component != null; depth++) {
    if (typeof component.displayName === "string") return component.displayName;
    component = component.render ?? component.type;
  }
  return undefined;
}

// Finds a component by display name among the exports of modules whose source contains code.
export function findComponentByDisplayName(code: string, displayName: string): any {
  for (const id of search(code)) {
    let exports: any;
    try {
      exports = wreq!(id);
    } catch (error) {
      logger.error(`Requiring module ${id} for component lookup threw`, error);
      continue;
    }
    const match = [...exportCandidates({ exports })].find(
      (c) => isComponent(c) && displayNameOf(c) === displayName,
    );
    if (match) return match;
  }
  return undefined;
}

export function findComponentByCode(code: string, displayName?: string): any {
  for (const id of search(code)) {
    let exports: any;
    try {
      exports = wreq!(id);
    } catch (error) {
      logger.error(`Requiring module ${id} for component lookup threw`, error);
      continue;
    }
    const components = [...exportCandidates({ exports })].filter(isComponent);
    const byName = displayName && components.find((c) => c.displayName === displayName);
    if (byName) return byName;
    const bySource = components.find((c) => {
      const render = unwrapComponent(c);
      return (
        typeof render === "function" && Function.prototype.toString.call(render).includes(code)
      );
    });
    if (bySource) return bySource;
    if (components.length === 1) return components[0];
    // Observer-wrapped components hide their source, but hooks and helpers beside them are plain functions.
    const wrapped = components.filter((c) => typeof c === "object");
    if (wrapped.length === 1) return wrapped[0];
  }
  return undefined;
}

export function search(...code: Array<string | RegExp>): ModuleId[] {
  if (!wreq) return [];
  return Object.entries(wreq.m)
    .filter(([, factory]) =>
      sourceMatches(Function.prototype.toString.call(getOriginalFactory(factory)), code),
    )
    .map(([id]) => id);
}
