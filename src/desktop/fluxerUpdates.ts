import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { app, autoUpdater } from "electron";
import { copyFileSync } from "original-fs";

type ApplyUpdate = (
  update: unknown,
  silent?: boolean,
  restart?: boolean,
  restartArguments?: string[],
) => void;

// Fluxer's updates replace its app files and with them the Influx shim. After Fluxer exits and its
// updater finishes, these scripts move the new app.asar aside, put the shim back and, when Fluxer
// was restarting for the update, start it again.
const MAC_SCRIPT = `
label="$(/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "$4/Contents/Info.plist").ShipIt"
while kill -0 "$1" 2>/dev/null; do sleep 1; done
attempts=0
while [ "$attempts" -lt 600 ] && launchctl list "$label" 2>/dev/null | grep -q '"PID"'; do
  sleep 1
  attempts=$((attempts + 1))
done
cd "$2" || exit 1
if [ -f app.asar ] && [ ! -e _app.asar ]; then
  cp "$3" .influx-shim.asar &&
    mv app.asar _app.asar &&
    { [ ! -e app.asar.unpacked ] || mv app.asar.unpacked _app.asar.unpacked; } &&
    mv .influx-shim.asar app.asar
fi
[ "$5" = 1 ] && open "$4"
`;

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function windowsScript(shim: string, restart: boolean): string {
  const updateExecutable = path.join(path.dirname(path.dirname(process.execPath)), "Update.exe");
  return `
$ErrorActionPreference = 'Stop'
$resources = ${quotePowerShell(process.resourcesPath)}
$fluxerAsar = Join-Path $resources 'app.asar'
$movedAsar = Join-Path $resources '_app.asar'
$stagedShim = Join-Path $resources '.influx-shim.asar'
try {
  Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue
  Get-Process -Name Update -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq ${quotePowerShell(updateExecutable)} } |
    Wait-Process -Timeout 600
  if ((Test-Path -LiteralPath $fluxerAsar) -and -not (Test-Path -LiteralPath $movedAsar)) {
    Copy-Item -LiteralPath ${quotePowerShell(shim)} -Destination $stagedShim
    Move-Item -LiteralPath $fluxerAsar -Destination $movedAsar
    if (Test-Path -LiteralPath "$fluxerAsar.unpacked") {
      Move-Item -LiteralPath "$fluxerAsar.unpacked" -Destination "$movedAsar.unpacked"
    }
    Move-Item -LiteralPath $stagedShim -Destination $fluxerAsar
  }
} finally {
  if ($${restart}) { Start-Process -FilePath ${quotePowerShell(process.execPath)} }
}
`;
}

let reinjectScheduled = false;

function reinjectAfterExit(installDirectory: string, restart: boolean): void {
  const shim = path.join(installDirectory, "shim.asar");
  copyFileSync(path.join(process.resourcesPath, "app.asar"), shim);
  const [command, commandArguments] =
    process.platform === "win32"
      ? [
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            Buffer.from(windowsScript(shim, restart), "utf16le").toString("base64"),
          ],
        ]
      : [
          "/bin/sh",
          [
            "-c",
            MAC_SCRIPT,
            "influx-reinject",
            String(process.pid),
            process.resourcesPath,
            shim,
            path.resolve(process.resourcesPath, "..", ".."),
            restart ? "1" : "0",
          ],
        ];
  spawn(command, commandArguments, {
    cwd: installDirectory,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
    .on("error", (error) => console.error("[Influx] Failed to keep Influx after the update", error))
    .unref();
  reinjectScheduled = true;
}

export function keepAcrossFluxerUpdates(installDirectory: string, fluxerMain: string): void {
  if (process.platform === "win32") {
    let velopack: { UpdateManager: { prototype: { waitExitThenApplyUpdate: ApplyUpdate } } };
    try {
      velopack = createRequire(fluxerMain)("velopack");
    } catch {
      return;
    }
    const applyUpdate = velopack.UpdateManager.prototype.waitExitThenApplyUpdate;
    velopack.UpdateManager.prototype.waitExitThenApplyUpdate = function (
      update,
      silent,
      restart = true,
      restartArguments,
    ) {
      try {
        reinjectAfterExit(installDirectory, restart);
      } catch (error) {
        console.error("[Influx] Failed to keep Influx after the update", error);
        return applyUpdate.call(this, update, silent, restart, restartArguments);
      }
      applyUpdate.call(this, update, silent, false, restartArguments);
    };
  } else if (process.platform === "darwin") {
    // ShipIt relaunches Fluxer before the shim can be restored, so quit instead and let the script
    // relaunch it. ShipIt still installs the downloaded update when Fluxer quits.
    const quitAndInstall = autoUpdater.quitAndInstall.bind(autoUpdater);
    autoUpdater.quitAndInstall = () => {
      try {
        reinjectAfterExit(installDirectory, true);
      } catch (error) {
        console.error("[Influx] Failed to keep Influx after the update", error);
        quitAndInstall();
        return;
      }
      app.quit();
    };
    let updateDownloaded = false;
    autoUpdater.on("update-downloaded", () => {
      updateDownloaded = true;
    });
    app.on("will-quit", () => {
      if (!updateDownloaded || reinjectScheduled) return;
      try {
        reinjectAfterExit(installDirectory, false);
      } catch (error) {
        console.error("[Influx] Failed to keep Influx after the update", error);
      }
    });
  }
}
