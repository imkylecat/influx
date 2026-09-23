import { patchFactory } from "../patcher/patchFactory";
import { Logger } from "../utils/Logger";
import type { ModuleFactory, ModuleId, Patch, WebpackModule, WebpackRequire } from "./types";

const logger = new Logger("Webpack");

export const CHUNK_GLOBAL = "rspackChunkfluxer_app";

const ORIGINAL_FACTORY = Symbol("influx.originalFactory");

export let wreq: WebpackRequire | undefined;

export const moduleCache = new Map<ModuleId, WebpackModule>();

type ModuleListener = (module: WebpackModule, id: ModuleId) => void;
const moduleListeners = new Set<ModuleListener>();

export function onModuleLoaded(listener: ModuleListener): () => void {
  moduleListeners.add(listener);
  return () => moduleListeners.delete(listener);
}

export function getOriginalFactory(factory: ModuleFactory): ModuleFactory {
  return (factory as any)[ORIGINAL_FACTORY] ?? factory;
}

function looksLikeWebpackRequire(fn: unknown, modules: unknown): fn is WebpackRequire {
  if (typeof fn !== "function" || modules == null || typeof modules !== "object") return false;
  const factories = Object.values(modules).slice(0, 10);
  return factories.length > 0 && factories.every((f) => typeof f === "function");
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
      for (const listener of moduleListeners) {
        try {
          listener(module, id);
        } catch (error) {
          logger.error("Module listener threw", error);
        }
      }
    };
    Object.defineProperty(wrapper, ORIGINAL_FACTORY, { value: original });
    wrapper.toString = () => Function.prototype.toString.call(original);
    return wrapper;
  }

  Object.defineProperty(Function.prototype, "m", {
    configurable: true,
    set(this: unknown, modules: Record<ModuleId, ModuleFactory>) {
      Object.defineProperty(this, "m", {
        value: modules,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      if (wreq || !looksLikeWebpackRequire(this, modules)) return;

      delete (Function.prototype as any).m;
      wreq = this;
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
