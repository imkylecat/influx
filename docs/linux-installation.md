# Linux experimental Influx build (x64 + ARM64)

This branch builds standalone Linux installers for an **existing** Fluxer desktop installation. It does **not** produce an AppImage, .deb, .rpm, or full Fluxer desktop package. Both installers install the same Influx JavaScript assets (including FakePlutonium); the executable itself is compiled for the requested CPU architecture.

## Download and verify

Open the **Linux Test Build** workflow in GitHub Actions for this branch and download:

- `influx-linux-x64-experimental` for Intel/AMD Linux.
- `influx-linux-arm64-experimental` for ARM64 Linux.

Extract the **entire** artifact into one directory; do not separate the installer from `influx-main.js`, `influx-preload.js`, or `influx-renderer.js`.

For a standard 64-bit Intel/AMD Linux system, run:

```bash
cd /path/to/extracted/artifact
sha256sum -c SHA256SUMS
chmod +x ./influx-installer-linux-x64
sudo ./influx-installer-linux-x64 --diagnose
sudo ./influx-installer-linux-x64 --local
```

Replace `x64` with `arm64` on ARM64 systems.

**Install locations:** the injector checks `/opt/Fluxer/resources` for the .deb/.rpm layout, then `/opt/fluxer/resources` for Arch package installations. If yours is different, pass `--path /absolute/path/to/resources` to `--diagnose`, `--local`, and `--uninstall`. Stop Fluxer before modifying its resources. System-wide installations normally require `sudo`, but a user-owned writable location does not.

The compiled installer automatically prefers the **adjacent matching local fork** unless `--upstream` is explicitly supplied. Under `sudo`, it writes the user's Influx files to `~/.config/Influx/dist` and restores the original Fluxer archive from `resources/influx-original/app.asar`. Check the output before proceeding: invalid or missing original archives must not be blindly deleted or renamed.

## Rollback

Close Fluxer and run:

```bash
sudo ./influx-installer-linux-x64 --uninstall
```

The uninstaller restores Fluxer's original `app.asar` and its matching `app.asar.unpacked` files if it finds a valid original. If validation fails, run `--diagnose` and repair/reinstall the official Fluxer application instead of removing archives manually.

## Limitations

- Tested in GitHub Actions on native **Ubuntu 24.04 x64 and ARM64 runners**, using real standalone executables against *disposable* Fluxer ASAR fixtures. These tests cannot establish compatibility with every live Fluxer Linux release or distribution.
- Packaged AppImage/Flatpak/Snap installations may have **read-only or sandboxed application resources**; these are not tested/supported by this installer. Do not run it against an immutable mounted image.
- Linux Fluxer updates may replace the Influx shim. If that happens, exit Fluxer and rerun the local installer after confirming that the original archive is valid.
- FakePlutonium's local higher-quality entitlement hook is platform-independent; the optional Custom/Source monitor capture enhancement is **best-effort**. Wayland/PipeWire portals may omit monitor information or decline the requested `MediaStreamTrack.applyConstraints()`; use `getStatus().lastCapture` for diagnostics. Server, encoder, and network policies still apply.

## Verify the plugin

Open Fluxer with Influx enabled, press `Ctrl+Shift+I`, select Console:

```js
window.Influx?.plugins?.FakePlutonium?.getStatus()
```

Look for `running: true` and `resolverHooked: true`. Capture improvements must be checked separately using an active full-monitor **Custom → Source** share and a receiving client's decoded video dimensions.
