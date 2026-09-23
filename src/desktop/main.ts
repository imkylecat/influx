import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, ipcMain, session } from "electron";
import { FLUXER_APP_HOSTS, IPC_GET_RENDERER } from "./constants";
import { registerUpdater } from "./updater";

// Set by the build banner; Bun would otherwise bake in the build machine's __dirname.
declare const INFLUX_DIR: string;

const fluxerAsar = path.join(process.resourcesPath, "_app.asar");
const fluxerPackage = JSON.parse(readFileSync(path.join(fluxerAsar, "package.json"), "utf8"));

const internalApp = app as typeof app & {
  setAppPath(p: string): void;
  setVersion(v: string): void;
};
internalApp.setAppPath(fluxerAsar);
internalApp.setVersion(fluxerPackage.version);
app.setName(fluxerPackage.productName ?? fluxerPackage.name);

function allowEval(csp: string): string {
  const directives = csp.split(";").map((d) => d.trim());
  const target = directives.some((d) => d.startsWith("script-src "))
    ? "script-src "
    : "default-src ";
  return directives
    .map((d) => (d.startsWith(target) && !d.includes("'unsafe-eval'") ? `${d} 'unsafe-eval'` : d))
    .join("; ");
}

registerUpdater(INFLUX_DIR);

ipcMain.on(IPC_GET_RENDERER, (event) => {
  event.returnValue = readFileSync(path.join(INFLUX_DIR, "renderer.js"), "utf8");
});

app.whenReady().then(() => {
  session.defaultSession.registerPreloadScript({
    id: "influx",
    type: "frame",
    filePath: path.join(INFLUX_DIR, "preload.js"),
  });

  const urls = FLUXER_APP_HOSTS.map((host) => `https://${host}/*`);
  session.defaultSession.webRequest.onHeadersReceived({ urls }, ({ responseHeaders }, callback) => {
    for (const name of Object.keys(responseHeaders ?? {})) {
      if (name.toLowerCase() === "content-security-policy") {
        responseHeaders![name] = responseHeaders![name].map(allowEval);
      }
    }
    callback({ responseHeaders });
  });
});

import(pathToFileURL(path.join(fluxerAsar, fluxerPackage.main)).href).catch((error) => {
  console.error("[Influx] Failed to start Fluxer", error);
  app.exit(1);
});
