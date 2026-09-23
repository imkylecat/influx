import { canInstallUpdates, checkForUpdates, installUpdate, restartToUpdate } from "@api/Updater";
import { showToast } from "@webpack/common";
import { settings } from "./settings";

const STARTUP_DELAY_MS = 15_000;

let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleAutoUpdate(): void {
  if (!canInstallUpdates || !settings.store.autoUpdate) return;
  timer = setTimeout(async () => {
    const check = await checkForUpdates();
    if (!check.ok || !check.available) return;
    const install = await installUpdate();
    if (install.ok) {
      showToast("success", `Influx updated to ${install.version}. Click to restart Fluxer.`, {
        timeout: 15_000,
        onClick: restartToUpdate,
      });
    } else {
      showToast("error", `Influx couldn't update: ${install.error}`);
    }
  }, STARTUP_DELAY_MS);
}

export function cancelAutoUpdate(): void {
  clearTimeout(timer);
}
