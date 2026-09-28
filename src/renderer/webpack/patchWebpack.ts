import { patchFactory } from "../patcher/patchFactory";
import { Logger } from "../utils/Logger";
import type { ModuleFactory, ModuleId, Patch, WebpackModule, WebpackRequire } from "./types";

const logger = new Logger("Webpack");

export let webpackRequire: WebpackRequire | undefined;

export const moduleCache = new Map<ModuleId, WebpackModule>();

// Counts factories added and modules loaded, so lookups that found nothing know when to retry.
export let moduleChanges = 0;

type ModuleListener = (module: WebpackModule, id: ModuleId) => void;
const moduleListeners = new Set<ModuleListener>();

export function onModuleLoaded(listener: ModuleListener): () => void {
  moduleListeners.add(listener);
  return () => moduleListeners.delete(listener);
}

function looksLikeWebpackRequire(value: unknown, modules: unknown): value is WebpackRequire {
  if (typeof value !== "function" || modules == null || typeof modules !== "object") return false;
  const factories = Object.values(modules).slice(0, 10);
  return factories.length > 0 && factories.every((factory) => typeof factory === "function");
}

export function installWebpackHook(pendingPatches: Patch[]): void {
  function wrapFactory(id: ModuleId, original: ModuleFactory): ModuleFactory {
    let patched: ModuleFactory | undefined;
    const wrapper: ModuleFactory = function (this: unknown, module, exports, require) {
      patched ??= patchFactory(id, original, pendingPatches, logger);
      if (patched === original) {
        original.call(this, module, exports, require);
      } else {
        try {
          patched.call(this, module, exports, require);
        } catch (error) {
          logger.error(`Patched module ${id} threw, falling back to the original`, error);
          module.exports = {};
          original.call(module.exports, module, module.exports, require);
        }
      }
      moduleCache.set(id, module);
      moduleChanges++;
      for (const listener of moduleListeners) {
        try {
          listener(module, id);
        } catch (error) {
          logger.error("Module listener threw", error);
        }
      }
    };
    // Module searches read the original source through this.
    wrapper.toString = () => Function.prototype.toString.call(original);
    moduleChanges++;
    return wrapper;
  }

  // Fluxer's runtime creates its require function, then assigns the module table to it as `m`.
  // Every function inherits this setter from Function.prototype, so it runs on that assignment,
  // captures the runtime before any module executes, and removes itself. The proxy it leaves on
  // `m` wraps the factories that later chunks add.
  Object.defineProperty(Function.prototype, "m", {
    configurable: true,
    set(this: unknown, modules: Record<ModuleId, ModuleFactory>) {
      Object.defineProperty(this, "m", {
        value: modules,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      if (webpackRequire || !looksLikeWebpackRequire(this, modules)) return;

      delete (Function.prototype as any).m;
      webpackRequire = this;
      logger.info("Captured Fluxer webpack runtime");

      for (const id of Object.keys(modules)) {
        modules[id] = wrapFactory(id, modules[id]);
      }
      this.m = new Proxy(modules, {
        set(target, id, factory) {
          target[id as ModuleId] =
            typeof factory === "function" ? wrapFactory(id as ModuleId, factory) : factory;
          return true;
        },
      });
    },
  });
}
