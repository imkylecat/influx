import type { InfluxNative, UpdateCheckResult, UpdateInstallResult } from "../../desktop/types";
import { checkLatestRelease } from "../../shared/github";
import { Logger } from "../utils/Logger";

const logger = new Logger("Updater");

declare global {
  interface Window {
    InfluxNative?: InfluxNative;
  }
}

const native = window.InfluxNative;

export const updateChannel: "desktop" | "desktop-development" | "browser" = native
  ? INFLUX_DEVELOPMENT
    ? "desktop-development"
    : "desktop"
  : "browser";

export const canInstallUpdates = updateChannel === "desktop";

export let pendingRestart: string | null = null;

async function checkFromBrowser(): Promise<UpdateCheckResult> {
  const check = await checkLatestRelease(INFLUX_VERSION);
  if (!check.ok) return check;
  return {
    ok: true,
    latest: check.release.version,
    available: check.available,
    pendingRestart: null,
    url: check.release.url,
  };
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const result = native ? await native.updater.check() : await checkFromBrowser();
  if (result.ok) pendingRestart = result.pendingRestart;
  else logger.warn(result.error);
  return result;
}

export async function installUpdate(): Promise<UpdateInstallResult> {
  if (!native || !canInstallUpdates) {
    return { ok: false, error: "This install of Influx cannot update itself" };
  }
  const result = await native.updater.install();
  if (result.ok) {
    pendingRestart = result.version;
    logger.info(`Installed Influx ${result.version}; restart Fluxer to load it`);
  } else {
    logger.error(result.error);
  }
  return result;
}

export function restartToUpdate(): void {
  void native?.updater.restart();
}
