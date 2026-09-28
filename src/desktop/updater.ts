import { app, ipcMain, net } from "electron";

import { type Fetch, fetchLatestRelease, NoReleaseError, type Release } from "../shared/github";
import { downloadDesktopRelease, installFiles } from "../shared/release";
import { compareVersions } from "../shared/version";
import { IPC_UPDATER_CHECK, IPC_UPDATER_INSTALL, IPC_UPDATER_RESTART } from "./constants";
import type { UpdateCheckResult, UpdateInstallResult } from "./types";

const netFetch: Fetch = (url, init) => net.fetch(url, init);

export function registerUpdater(installDirectory: string): void {
  let latest: Release | null = null;
  let installedVersion: string | null = null;

  ipcMain.handle(IPC_UPDATER_CHECK, async (): Promise<UpdateCheckResult> => {
    try {
      latest = await fetchLatestRelease(netFetch);
      const baseline = installedVersion ?? INFLUX_VERSION;
      return {
        ok: true,
        latest: latest.version,
        available: compareVersions(latest.version, baseline) > 0,
        pendingRestart: installedVersion,
        url: latest.url,
      };
    } catch (error) {
      const message =
        error instanceof NoReleaseError
          ? error.message
          : `Couldn't check for updates: ${String(error)}`;
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC_UPDATER_INSTALL, async (): Promise<UpdateInstallResult> => {
    if (INFLUX_DEVELOPMENT)
      return { ok: false, error: "Development builds update from git: git pull && bun run build" };
    try {
      const release = latest ?? (await fetchLatestRelease(netFetch));
      if (compareVersions(release.version, installedVersion ?? INFLUX_VERSION) <= 0) {
        return { ok: false, error: `Already up to date (${installedVersion ?? INFLUX_VERSION})` };
      }
      installFiles(installDirectory, await downloadDesktopRelease(release, netFetch));
      installedVersion = release.version;
      return { ok: true, version: release.version };
    } catch (error) {
      return { ok: false, error: `Update failed: ${String(error)}` };
    }
  });

  ipcMain.handle(IPC_UPDATER_RESTART, () => {
    app.relaunch();
    app.quit();
  });
}
