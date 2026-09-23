import type { InfluxNative, UpdateCheckResult, UpdateInstallResult } from "../../desktop/types";
import { compareVersions, LATEST_RELEASE_API, RELEASES_URL } from "../../shared/version";
import { Logger } from "../utils/Logger";

export { RELEASES_URL };

const logger = new Logger("Updater");

declare global {
  interface Window {
    InfluxNative?: InfluxNative;
  }
}

const native = window.InfluxNative;

export const updateChannel: "desktop" | "desktop-dev" | "browser" = native
  ? INFLUX_DEV
    ? "desktop-dev"
    : "desktop"
  : "browser";

export const canInstallUpdates = updateChannel === "desktop";

let pendingRestart: string | null = null;
export const getPendingRestart = () => pendingRestart;

async function checkFromBrowser(): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.status === 404)
      return { ok: false, error: `No Influx release has been published yet (${RELEASES_URL})` };
    if (!response.ok) return { ok: false, error: `GitHub returned ${response.status}` };
    const release = (await response.json()) as {
      tag_name: string;
      html_url: string;
      body: string | null;
    };
    const latest = release.tag_name.replace(/^v/, "");
    return {
      ok: true,
      current: INFLUX_VERSION,
      latest,
      available: compareVersions(latest, INFLUX_VERSION) > 0,
      pendingRestart: null,
      url: release.html_url,
      notes: release.body ?? "",
    };
  } catch (error) {
    return { ok: false, error: `Couldn't check for updates: ${String(error)}` };
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
  if (native) void native.updater.restart();
  else location.reload();
}
