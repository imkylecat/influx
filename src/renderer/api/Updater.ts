import type { InfluxNative, UpdateCheckResult, UpdateInstallResult } from "../../desktop/types";
import { fetchLatestRelease, NoReleaseError } from "../../shared/github";
import { compareVersions } from "../../shared/version";
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
  try {
    const release = await fetchLatestRelease();
    return {
      ok: true,
      latest: release.version,
      available: compareVersions(release.version, INFLUX_VERSION) > 0,
      pendingRestart: null,
      url: release.url,
    };
  } catch (error) {
    const message =
      error instanceof NoReleaseError
        ? error.message
        : `Couldn't check for updates: ${String(error)}`;
    return { ok: false, error: message };
  }
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
