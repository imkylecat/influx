import * as Plugins from "./api/Plugins";
import * as Settings from "./api/Settings";
import pluginList from "~plugins";
import { Logger } from "./utils/Logger";
import * as common from "./webpack/common";
import * as finders from "./webpack/finders";
import * as webpack from "./webpack/patchWebpack";

const logger = new Logger("Core");

const Influx = {
  version: INFLUX_VERSION,
  plugins: Plugins.plugins,
  Plugins,
  Settings,
  webpack: {
    ...finders,
    common,
    get wreq() {
      return webpack.wreq;
    },
    moduleCache: webpack.moduleCache,
    pendingPatches: Plugins.pendingPatches,
  },
};

declare global {
  interface Window {
    Influx: typeof Influx;
  }
}

function evalAllowed(): boolean {
  try {
    return (0, eval)("true");
  } catch {
    return false;
  }
}

function init(): void {
  if (window.Influx) {
    logger.warn("Already loaded, skipping second injection");
    return;
  }
  window.Influx = Influx;

  Plugins.registerPlugins(pluginList);
  if (evalAllowed()) {
    webpack.installWebpackHook(Plugins.pendingPatches);
  } else {
    logger.error(
      "The page's Content-Security-Policy blocks eval, so patches are disabled. " +
        "The extension or desktop injector should relax CSP. Check that it is installed correctly.",
    );
  }

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!webpack.wreq)
        logger.error(
          `Never saw Fluxer's webpack runtime (${webpack.CHUNK_GLOBAL}). Was Influx injected too late?`,
        );
      Plugins.startAllPlugins();
      logger.info(`v${INFLUX_VERSION} loaded with ${Object.keys(Plugins.plugins).length} plugins`);
    },
    { once: true },
  );
}

init();
