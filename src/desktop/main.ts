import { existsSync, readFileSync } from "node:fs";
import { existsSync as existsOnDisk } from "original-fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, ipcMain, session } from "electron";

import { FLUXER_APP_ORIGINS, IPC_GET_RENDERER } from "./constants";
import {
  isFluxerDesktopPackage,
  originalArchiveCandidates,
  type FluxerDesktopPackage,
} from "../shared/archiveLayout";
import { keepAcrossFluxerUpdates } from "./fluxerUpdates";
import { registerUpdater } from "./updater";

// Set by the build banner; Bun would otherwise bake in the build machine's __dirname.
declare const INFLUX_DIRECTORY: string;

// Electron patches node:fs for ASAR paths. Use original-fs for physical archive checks,
// then use node:fs to read files *inside* each candidate ASAR.
function findOriginalFluxer(): { archive: string; manifest: FluxerDesktopPackage } {
  const diagnostics: string[] = [];
  for (const archive of originalArchiveCandidates(process.resourcesPath)) {
    if (!existsOnDisk(archive)) {
      diagnostics.push(`${archive}: missing`);
      continue;
    }
    try {
      const manifest: unknown = JSON.parse(
        readFileSync(path.join(archive, "package.json"), "utf8"),
      );
      if (!isFluxerDesktopPackage(manifest))
        throw new Error("not a Fluxer desktop package");
      if (!existsSync(path.join(archive, manifest.main)))
        throw new Error(`main entry missing: ${manifest.main}`);
      return { archive, manifest };
    } catch (error) {
      diagnostics.push(`${archive}: ${String(error)}`);
    }
  }
  throw new Error(
    "Influx could not locate a readable original Fluxer app.asar. " +
      "Quit Fluxer, run the corrected Influx installer with --diagnose, then " +
      "restore a valid original archive or repair your official Fluxer installation. " +
      "Do not delete either archive blindly.\\n" +
      diagnostics.join("\\n"),
  );
}

const { archive: fluxerAsar, manifest: fluxerPackage } = findOriginalFluxer();
const fluxerMain = path.join(fluxerAsar, fluxerPackage.main);

const internalApp = app as typeof app & {
  setAppPath(appPath: string): void;
  setVersion(version: string): void;
};
internalApp.setAppPath(fluxerAsar);
internalApp.setVersion(fluxerPackage.version);
app.setName(fluxerPackage.productName ?? fluxerPackage.name);

function allowEval(policy: string): string {
  const directives = policy.split(";").map((directive) => directive.trim());
  const target = directives.some((directive) => directive.startsWith("script-src "))
    ? "script-src "
    : "default-src ";
  return directives
    .map((directive) =>
      directive.startsWith(target) && !directive.includes("'unsafe-eval'")
        ? `${directive} 'unsafe-eval'`
        : directive,
    )
    .join("; ");
}

registerUpdater(INFLUX_DIRECTORY);
keepAcrossFluxerUpdates(INFLUX_DIRECTORY, fluxerMain);

ipcMain.on(IPC_GET_RENDERER, (event) => {
  event.returnValue = readFileSync(path.join(INFLUX_DIRECTORY, "renderer.js"), "utf8");
});

void app.whenReady().then(() => {
  session.defaultSession.registerPreloadScript({
    id: "influx",
    type: "frame",
    filePath: path.join(INFLUX_DIRECTORY, "preload.js"),
  });

  const urls = FLUXER_APP_ORIGINS.map((origin) => `${origin}/*`);
  session.defaultSession.webRequest.onHeadersReceived({ urls }, ({ responseHeaders }, respond) => {
    for (const name of Object.keys(responseHeaders ?? {})) {
      if (name.toLowerCase() === "content-security-policy") {
        responseHeaders![name] = responseHeaders![name].map(allowEval);
      }
    }
    respond({ responseHeaders });
  });
});

import(pathToFileURL(fluxerMain).href).catch((error) => {
  console.error("[Influx] Failed to start Fluxer", error);
  app.exit(1);
});
