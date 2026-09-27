# Influx

**Make Fluxer your own.**

Influx adds plugins to [Fluxer](https://fluxer.app) that make chatting more private, more informed and more fun. It uses Fluxer's own look, so everything feels like it was always there.

## Download

| Platform                     | Get Influx                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| **Windows, macOS and Linux** | [Download the installer](https://github.com/imkylecat/influx/releases/latest) |
| **Chrome**                   | Chrome Web Store: coming soon                                                 |
| **Firefox**                  | Firefox Add-ons: coming soon                                                  |

## Community

Have an idea or found a bug? Join the [Influx server](https://fluxer.gg/5YmmEFoj) or [open an issue](https://github.com/imkylecat/influx/issues).

## Contributing

<details>
<summary>Build from source</summary>

```sh
bun install
bun run build
bun run inject --dev   # then restart Fluxer
```

For the browser, load `dist/extension` as an unpacked extension.

JavaScript bundles are built with `Bun.build()`. Run `bun run watch` to rebuild when source files change, including when plugins are added or removed. Development builds also sync to an existing development install.

Bun does not downlevel JavaScript to specific browser or Node.js versions. Keep new syntax compatible with the Fluxer runtime and supported browsers. TSX files should import `React` from `@webpack/common` to use Fluxer's React instance.

</details>

## License

Influx is licensed under the [GNU General Public License v3.0](LICENSE). It isn't affiliated with or endorsed by Fluxer.
