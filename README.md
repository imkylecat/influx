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
