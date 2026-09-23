import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { influxDataDir } from "../src/shared/paths";
import { DESKTOP_ASSETS } from "../src/shared/release";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const pluginsDir = path.join(root, "src/plugins");
const watch = process.argv.includes("--watch");
const release = process.argv.includes("--release");
const devInstallDir = path.join(influxDataDir(), "dev");

const syncDevInstall: esbuild.Plugin = {
  name: "sync-dev-install",
  setup(build) {
    build.onEnd(async (result) => {
      if (release || result.errors.length > 0 || !existsSync(devInstallDir)) return;
      const outfile = build.initialOptions.outfile!;
      await cp(outfile, path.join(devInstallDir, path.basename(outfile)));
    });
  },
};
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const pluginDiscovery: esbuild.Plugin = {
  name: "plugin-discovery",
  setup(build) {
    build.onResolve({ filter: /^~plugins$/ }, () => ({
      path: "~plugins",
      namespace: "influx-plugins",
    }));
    build.onLoad({ filter: /.*/, namespace: "influx-plugins" }, async () => {
      const entries: string[] = [];
      for (const dir of (await readdir(pluginsDir, { withFileTypes: true })).filter((d) =>
        d.isDirectory(),
      )) {
        const entry = ["index.ts", "index.tsx"]
          .map((f) => path.join(pluginsDir, dir.name, f))
          .find(existsSync);
        if (entry) entries.push(entry);
      }
      const imports = entries
        .map((entry, i) => `import p${i} from ${JSON.stringify(entry)};`)
        .join("\n");
      return {
        contents: `${imports}\nexport default [${entries.map((_, i) => `p${i}`).join(", ")}];`,
        resolveDir: pluginsDir,
        watchDirs: [pluginsDir],
        watchFiles: entries,
      };
    });
  },
};

const common: esbuild.BuildOptions = {
  bundle: true,
  logLevel: "info",
  sourcemap: "inline",
  legalComments: "none",
  define: { INFLUX_VERSION: JSON.stringify(version), INFLUX_DEV: JSON.stringify(!release) },
};

const renderer: esbuild.BuildOptions = {
  ...common,
  entryPoints: [path.join(root, "src/renderer/index.ts")],
  format: "iife",
  platform: "browser",
  plugins: [pluginDiscovery],
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  inject: [path.join(root, "src/renderer/jsx.ts")],
};

const builds: esbuild.BuildOptions[] = [
  {
    ...renderer,
    outfile: path.join(dist, "desktop/renderer.js"),
    target: "chrome120",
    plugins: [pluginDiscovery, syncDevInstall],
  },
  {
    ...renderer,
    outfile: path.join(dist, "extension/renderer.js"),
    target: ["chrome120", "firefox128"],
  },
  ...["main", "preload"].map((name): esbuild.BuildOptions => ({
    ...common,
    entryPoints: [path.join(root, `src/desktop/${name}.ts`)],
    outfile: path.join(dist, `desktop/${name}.js`),
    format: "cjs",
    platform: "node",
    target: "node22",
    external: ["electron"],
    plugins: [syncDevInstall],
  })),
];

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "extension"), { recursive: true });
await cp(path.join(root, "src/extension/rules.json"), path.join(dist, "extension/rules.json"));
const manifest = JSON.parse(await readFile(path.join(root, "src/extension/manifest.json"), "utf8"));
await writeFile(
  path.join(dist, "extension/manifest.json"),
  `${JSON.stringify({ ...manifest, version }, null, "\t")}\n`,
);

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  if (release) await stageRelease();
}

async function stageRelease() {
  const releaseDir = path.join(dist, "release");
  await mkdir(releaseDir, { recursive: true });
  const sums: string[] = [];
  for (const [file, asset] of Object.entries(DESKTOP_ASSETS)) {
    const data = await readFile(path.join(dist, "desktop", file));
    await writeFile(path.join(releaseDir, asset), data);
    sums.push(`${createHash("sha256").update(data).digest("hex")}  ${asset}`);
  }
  await writeFile(path.join(releaseDir, "SHA256SUMS"), `${sums.join("\n")}\n`);
  console.log(`Staged release ${version} in dist/release/`);
}
