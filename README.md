# Influx

A patch-based client mod for [Fluxer](https://fluxer.app).

## Install

Download the installer for your OS from the [latest release](https://github.com/imkylecat/influx/releases/latest), quit Fluxer, and run it. Add `--canary` for Fluxer Canary, or `--uninstall` to remove Influx.

## Development

```sh
bun install
bun run build
bun run inject --dev   # then restart Fluxer
```

For the browser, load `dist/extension` as an unpacked extension.

JavaScript bundles are built with `Bun.build()`. Run `bun run watch` to rebuild when source files change, including when plugins are added or removed. Development builds also sync to an existing development install.

Bun does not downlevel JavaScript to specific browser or Node.js versions. Keep new syntax compatible with the Fluxer runtime and supported browsers. TSX files should import `React` from `@webpack/common` to use Fluxer's React instance.
