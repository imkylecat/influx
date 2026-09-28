import type { ModuleFactory, ModuleId, Patch, PatchReplacement } from "../webpack/types";

const IDENTIFIER = String.raw`(?:[A-Za-z_$][\w$]*)`;

const canonicalized = new WeakMap<RegExp, RegExp>();

export function canonicalizeMatch<T extends string | RegExp>(match: T): T;
export function canonicalizeMatch(match: string | RegExp): string | RegExp {
  if (typeof match === "string") return match;
  let canonical = canonicalized.get(match);
  if (!canonical) {
    canonical = new RegExp(match.source.replace(/(?<!\\)\\i/g, IDENTIFIER), match.flags);
    canonicalized.set(match, canonical);
  }
  canonical.lastIndex = 0;
  return canonical;
}

function canonicalizeReplace(
  replace: PatchReplacement["replace"],
  plugin: string,
): PatchReplacement["replace"] {
  const self = `Influx.plugins[${JSON.stringify(plugin)}]`;
  if (typeof replace === "function") {
    return (...match) => replace(...(match as [string, ...unknown[]])).replaceAll("$self", self);
  }
  return replace.replaceAll("$self", self);
}

function matchesFind(code: string, find: string | RegExp): boolean {
  return typeof find === "string" ? code.includes(find) : canonicalizeMatch(find).test(code);
}

const evaluateFactory = (code: string, id: ModuleId, plugins: string[]): ModuleFactory =>
  (0, eval)(
    `// Influx patched module ${id} (${plugins.join(", ")})\n0,${code}\n//# sourceURL=InfluxPatched/${id}`,
  );

interface PatchLogger {
  error(...values: unknown[]): void;
}

export function patchFactory(
  id: ModuleId,
  factory: ModuleFactory,
  pending: Patch[],
  logger: PatchLogger,
): ModuleFactory {
  if (pending.length === 0) return factory;
  let code = Function.prototype.toString.call(factory);
  let compiled: ModuleFactory | undefined;
  const appliedBy: string[] = [];

  for (let index = 0; index < pending.length; index++) {
    const patch = pending[index];
    if (!matchesFind(code, patch.find)) continue;
    pending.splice(index--, 1);

    let candidate = code;
    let failure: string | undefined;
    const replacements = Array.isArray(patch.replacement) ? patch.replacement : [patch.replacement];
    for (const { match, replace } of replacements) {
      const next = candidate.replace(
        canonicalizeMatch(match) as RegExp,
        canonicalizeReplace(replace, patch.plugin) as string,
      );
      if (next === candidate) {
        failure = `replacement ${String(match)} had no effect`;
        break;
      }
      candidate = next;
    }

    if (failure === undefined) {
      try {
        compiled = evaluateFactory(candidate, id, [...appliedBy, patch.plugin]);
      } catch (error) {
        failure = `patched code failed to compile: ${String(error)}`;
      }
    }

    if (failure !== undefined) {
      logger.error(`Patch by ${patch.plugin} failed on module ${id}, ${failure}. Skipping it.`, {
        find: patch.find,
      });
      continue;
    }
    code = candidate;
    appliedBy.push(patch.plugin);
  }

  return compiled ?? factory;
}
