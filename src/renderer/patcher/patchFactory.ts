import type { ModuleFactory, ModuleId, Patch, PatchReplacement } from "../webpack/types";

const IDENTIFIER = String.raw`(?:[A-Za-z_$][\w$]*)`;

const pluginReference = (plugin: string): string => `Influx.plugins[${JSON.stringify(plugin)}]`;

export function canonicalizeMatch<T extends string | RegExp>(match: T): T;
export function canonicalizeMatch(match: string | RegExp): string | RegExp {
  if (typeof match === "string") return match;
  const source = match.source.replace(/(?<!\\)\\i/g, IDENTIFIER);
  return new RegExp(source, match.flags);
}

function canonicalizeReplace(
  replace: PatchReplacement["replace"],
  plugin: string,
): PatchReplacement["replace"] {
  const self = pluginReference(plugin);
  if (typeof replace === "function") {
    return (...args) => replace(...(args as [string, ...unknown[]])).replaceAll("$self", self);
  }
  return replace.replaceAll("$self", self);
}

function matchesFind(code: string, find: string | RegExp): boolean {
  return typeof find === "string" ? code.includes(find) : canonicalizeMatch(find).test(code);
}

function toFunctionExpression(code: string): string {
  return /^(?:async\s+)?(?:function\b|\()/.test(code) ? code : `function ${code}`;
}

const evaluateFactory = (code: string, id: ModuleId, plugins: string[]): ModuleFactory =>
  (0, eval)(
    `// Influx patched module ${id} (${plugins.join(", ")})\n0,${code}\n//# sourceURL=InfluxPatched/${id}`,
  );

interface PatchLogger {
  error(...args: unknown[]): void;
}

export function patchFactory(
  id: ModuleId,
  factory: ModuleFactory,
  pending: Patch[],
  logger: PatchLogger,
): ModuleFactory {
  const original = Function.prototype.toString.call(factory);
  let code = original;
  let compiled: ModuleFactory | undefined;
  const appliedBy: string[] = [];

  for (let i = 0; i < pending.length; i++) {
    const patch = pending[i];
    if (!matchesFind(code, patch.find)) continue;
    if (patch.predicate && !patch.predicate()) continue;
    if (!patch.all) pending.splice(i--, 1);

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
        compiled = evaluateFactory(toFunctionExpression(candidate), id, [
          ...appliedBy,
          patch.plugin,
        ]);
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
