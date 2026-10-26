# Experimental desktop compatibility and FakePlutonium

This branch targets Fluxer's newer Electron desktop packaging and adds a client-side quality preference override.

## Why the desktop archive moves differently

Influx previously renamed Fluxer's original `app.asar` to `_app.asar`. Fluxer's native addon packages derive their unpacked binary paths from an archive literally named `app.asar`, replacing `app.asar` with `app.asar.unpacked`. A renamed archive breaks that assumption.

The installer now stores Fluxer's original archive in `resources/influx-original/app.asar`, with its native files under `resources/influx-original/app.asar.unpacked`. The compatibility shim remains `resources/app.asar`. Existing `_app.asar` installations migrate automatically when the development installer runs. Uninstall restores the original archive. Update recovery scripts were adjusted to this layout.

## Windows development installation

Quit Fluxer fully and run from this source checkout:

```powershell
bun install
bun run typecheck
bun test
bun run build
bun run inject --development
```

Restart Fluxer. If necessary, use an elevated PowerShell for writing to installed resources. To remove the shim, run `bun run uninject`.

## Verification

In Fluxer's developer tools console, check:

```js
window.Influx?.version
window.Influx?.plugins?.FakePlutonium?.getStatus()
```

Enable FakePlutonium in Influx plugins settings and start a stream. Its quality preference changes client-side access to the options; it does not change paid account state, server bitrate policy, or guarantee the recipient's actual resolution.

**Not yet smoke-tested against a released Windows Fluxer binary.** If `window.Influx` is undefined, check preload diagnostics and CSP policies before investigating the plugin. The separate CSP handling and Electron ESM bootstrap may still require adaptation to the installed build.

## GitHub Actions: no local Bun required

Pull request builds run automatically in **Actions > Windows Test Build**. Open the successful run, then download the **influx-windows-experimental** artifact from the Artifacts section.

1. Extract the complete artifact ZIP into a normal folder. Keep the installer EXE and the three `influx-*.js` files together.
2. Exit Fluxer completely (including its tray process).
3. Open PowerShell in the extracted folder and run `./influx-installer-windows-x64.exe --local` (PowerShell also accepts `.\\influx-installer-windows-x64.exe --local`).
4. Restart Fluxer and check `window.Influx?.plugins?.FakePlutonium?.getStatus()` in DevTools.

**The compiled installer now installs its adjacent forked assets by default**, even when double-clicked. `--local` still works. `--upstream` explicitly downloads upstream Influx, but should not be used with this fork. Locally installed builds disable the upstream in-app updater so it cannot overwrite these changes. The action produces an experimental build, not a GitHub Release. Keep the ZIP only for testing and do not merge the draft PR without a real desktop smoke test.

The `workflow_dispatch` manual **Run workflow** button generally requires the workflow to exist on the default branch. Until the PR is merged, use the automatic PR run instead.

## Windows startup error: Invalid package `_app.asar`

The old upstream Influx shim reads `resources/_app.asar`. The branch's installer
migrates a **valid** legacy archive to `resources/influx-original/app.asar`,
and the updated Influx bootstrap checks the archive before attempting to launch Fluxer.

The Windows test build now exercises a compiled installer against disposable
ASAR fixtures for fresh installation, full uninstall, legacy migration, and
missing/corrupt original backups. These tests cannot prove compatibility with
every released Fluxer desktop version.

**Recovery without deleting your Fluxer profile:**

1. Download and extract the **latest successful** Windows Test Build artifact.
2. Exit Fluxer completely, then run
   `./influx-installer-windows-x64.exe --diagnose` from PowerShell in that folder.
   This command does not modify files.
3. Check **Influx main.js diagnostics**. Once installed, it should say `supports influx-original layout: yes` and `installed matches local artifact: YES`.
4. If either `influx-original/app.asar` or `_app.asar` reports
   **valid Fluxer desktop**, run `./influx-installer-windows-x64.exe --uninstall`
   and verify the stock Fluxer client opens. Exit Fluxer again.
5. Then run `./influx-installer-windows-x64.exe --local` to install the
   **forked** assets, not upstream Influx.
6. If all original archives report **MISSING** or **not a readable Fluxer archive**,
   do not force an uninstall or rename archives manually. Repair/reinstall the
   official Fluxer desktop app first without deleting your user profile, verify
   it starts normally, and repeat steps 2–5.

If Fluxer opens but `window.Influx` is missing in DevTools, the remaining problem
is Electron injection/preload compatibility rather than an invalid archive.

A successfully generated artifact does not prove it was installed. The installer verifies SHA-256 checksums of copied files, and `--diagnose` compares the installed `%APPDATA%/Influx/dist/main.js` with the adjacent `influx-main.js`. A small `app.asar` shim can remain from an old attempt while the renderer/main assets are still outdated.
