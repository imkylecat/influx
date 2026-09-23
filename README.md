# Influx

A patch-based client mod for [Fluxer](https://fluxer.app), in the style of Vencord: plugins rewrite
Fluxer's bundled JavaScript module source before it runs.

## How it works

Fluxer's web client is built with Rspack, which uses a webpack-compatible runtime. Influx runs before
Fluxer's scripts and:

1. **Captures the runtime.** It defines a setter for `Function.prototype.m`, which fires when the runtime runs
   `__webpack_require__.m = modules`. The object of module factories is then swapped for a proxy, so modules
   in lazily loaded chunks (pushed onto `self.rspackChunkfluxer_app`) go through Influx too.
2. **Patches factories.** The first time a module is required, its factory source is checked against every
   pending patch (`find`). Matching patches run regex replacements, and the result is re-evaluated with `eval`.
   Each patch is atomic: if any replacement misses or the result doesn't compile, the whole patch is skipped
   and logged, so the module still loads unpatched.
3. **Records exports.** Fluxer's runtime doesn't expose its module cache, so Influx tracks every loaded
   module itself. This is what finders (`findByProps`, `waitFor`, ...) search.

Fluxer's CSP doesn't allow `eval`, so each injection method relaxes it (see below).

## Layout

```
src/
  plugins/<name>/index.ts(x)   plugins, auto-discovered at build time
  renderer/                    core, runs in the page
    api/Plugins.ts             definePlugin, plugin lifecycle
    api/Settings.ts            definePluginSettings, persisted in localStorage
    patcher/patchFactory.ts    applies patches to factory source (pure, unit tested)
    webpack/patchWebpack.ts    runtime capture and factory wrapping
    webpack/finders.ts         find, findByProps, findByCode, waitFor, search
    webpack/common.ts          Fluxer's React (also the JSX factory) and UI components
  desktop/                     Electron main-process shim, preload, and updater
  extension/                   MV3 manifest and CSP rule
  shared/                      release download and version logic (desktop updater and injector)
scripts/build.ts               esbuild builds into dist/ (--release stages release assets)
scripts/inject.ts              desktop installer (bun run inject)
scripts/build-installer.ts     compiles it into standalone installers for each OS
.github/workflows/release.yml  publishes a GitHub release for each version tag
```

## Installing

On a computer without Bun, download the installer for your system from the
[latest release](https://github.com/imkylecat/influx/releases/latest) (`influx-installer-macos-arm64`,
`-macos-x64`, `-windows-x64.exe`, `-linux-x64` or `-linux-arm64`), quit Fluxer, run it, and reopen Fluxer. The
release notes cover the one-time macOS/Windows security prompts. It accepts the same options as
`bun run inject` below (`--canary`, `--uninstall`, `--help`, ...), except `--dev` and `--local`.

## Getting started

```sh
bun install
bun run build        # or: bun run watch
bun test
```

### Browser (Chromium or Firefox 128+)

Load `dist/extension/` as an unpacked extension, then open https://web.fluxer.app. The extension injects
Influx at `document_start` in the page's main world and removes the CSP header on Fluxer's app hosts.

### Desktop

```sh
bun run inject                     # latest release; updates itself (add --canary for Fluxer Canary)
bun run inject --dev               # this checkout's build: bun run build, then restart Fluxer
bun run inject --local             # your own release build (bun run build --release), e.g. to test it
bun run inject --path /path/to/Fluxer.app
bun run uninject
```

This renames Fluxer's `app.asar` (and `app.asar.unpacked`) to `_app.asar` and puts a small shim `app.asar`
in its place. The shim loads Influx, which registers a preload (which injects the renderer), adds
`'unsafe-eval'` to the CSP, and then starts Fluxer from `_app.asar`. `bun run uninject` restores the original.
**Fluxer updates replace the shim; re-run `bun run inject` after updating.**

Influx's files live in its data folder (`~/Library/Application Support/Influx` on macOS, `%APPDATA%\Influx`
on Windows, `~/.config/Influx` on Linux): release installs in `dist/`, `--dev` installs in `dev/`, which
`bun run build` keeps up to date. Fluxer never reads from this checkout directly, because macOS doesn't let
apps read `~/Documents` (and similar folders) without asking.

- macOS: your terminal needs _App Management_ permission (System Settings → Privacy & Security).
- Linux: works for deb/rpm installs in `/opt` (run with sudo), not AppImages.

### Updates

**Settings → Influx → Updates** has _Check for updates_ and _Automatically update_ (on by default).

- **Desktop release installs** download the latest [GitHub release](https://github.com/imkylecat/influx/releases),
  check every file against the release's `SHA256SUMS`, swap them in, and ask you to restart Fluxer.
  With auto-update on, this happens shortly after Fluxer starts, and a toast offers the restart.
- **Development builds** (`--dev`) only check; update them with `git pull && bun run build`.
- **The browser extension** only checks and links to the release. Browsers don't let extensions replace
  their own code.

### Releasing

1. Bump `version` in `package.json` and commit.
2. `git tag v<version> && git push origin v<version>`

The [release workflow](.github/workflows/release.yml) checks the tag matches `package.json`, runs the
typecheck and tests, builds with `--release`, compiles the standalone installers (`bun run build:installer`,
ad-hoc signing the macOS ones), and publishes them with the desktop files, `influx-extension.zip` and
`SHA256SUMS` as a GitHub release. Installs pick it up on their next check.

## Writing a plugin

```ts
import definePlugin from "@api/Plugins";
import { Contributor } from "@utils/constants";

export default definePlugin({
  name: "MyPlugin",
  description: "Does a thing",
  authors: [Contributor.Kairu], // add yourself to src/renderer/utils/constants.ts
  patches: [
    {
      find: "a string unique to the target module",
      replacement: {
        match: /someMethod\((\i)\)\{/, // \i matches any minified identifier
        replace: "$&$self.onCall($1);", // $self is this plugin object
      },
    },
  ],
  onCall(arg: unknown) {},
  start() {},
  stop() {},
});
```

Plugins are disabled by default. Manage them in **Settings → Influx → Plugins**: toggle plugins, edit their
options (from `definePluginSettings`), and reload when a banner says a patch change needs it. From the
devtools console: `Influx.Plugins.setPluginEnabled('SilentTyping', true)`.

The settings UI is itself a required plugin, `src/plugins/influxSettings/`. To add another page to the
Influx category, add an entry to `TABS` there.

### Finding patch targets

- Fluxer is [open source](https://github.com/fluxerapp/fluxer) (`fluxer_app/src`), and its production
  bundles ship source maps, so you can read the original code and then locate it in the minified output.
- `Influx.webpack.search('some string')` lists the ids of modules whose source contains it.
  `Influx.webpack.wreq.m[id].toString()` shows the original minified source.
- Good `find` strings are error messages, log strings, and i18n keys. Minified identifiers change between
  builds; use `\i` for them in `match`.
- Rspack concatenates modules, so a source file can end up inside a bigger module (SilentTyping's target
  lives in the `App` module). Patch it where it appears.
- Patched modules show up in devtools under `InfluxPatched/<id>`.
- For UI, use `Components` from `@webpack/common` (Fluxer's Switch, Input, Button, settings layout), found by
  their `data-flx` attributes, which are stable across builds. Keep a fallback in case one moves.
- Fluxer deletes `window.localStorage` after startup. Use `definePluginSettings` for persistence.

## License

GPL-3.0-or-later. Fluxer itself is AGPL-3.0; Influx ships none of Fluxer's code.
