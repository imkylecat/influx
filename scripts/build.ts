import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { BuildConfig, BunPlugin } from "bun";

import { influxDataDirectory } from "../src/shared/paths";
import { DESKTOP_ASSETS } from "../src/shared/release";

const root = path.dirname(import.meta.dir);
const dist = path.join(root, "dist");
const pluginsDirectory = path.join(root, "src/plugins");
const watch = process.argv.includes("--watch");
const release = process.argv.includes("--release");
const developmentInstallDirectory = path.join(influxDataDirectory(), "development");

const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const pluginDiscovery: BunPlugin = {
  name: "plugin-discovery",
  setup(build) {
    build.onResolve({ filter: /^~plugins$/ }, () => ({
      path: "~plugins",
      namespace: "influx-plugins",
    }));
    build.onLoad({ filter: /.*/, namespace: "influx-plugins" }, async () => {
      const entries: string[] = [];
      for (const directory of (await readdir(pluginsDirectory, { withFileTypes: true })).filter(
        (entry) => entry.isDirectory(),
      )) {
        const entry = ["index.ts", "index.tsx"]
          .map((file) => path.join(pluginsDirectory, directory.name, file))
          .find(existsSync);
        if (entry) entries.push(entry);
      }
      const imports = entries
        .map((entry, index) => `import plugin${index} from ${JSON.stringify(entry)};`)
        .join("\n");
      return {
        contents: `${imports}\nexport default [${entries.map((_, index) => `plugin${index}`).join(", ")}];`,
        loader: "ts",
      };
    });
  },
};

// Bun's bundler can't run inside a plugin callback, so the style sheets are bundled before each build.
const styleSheets = new Map<string, string>();

const styles: BunPlugin = {
  name: "styles",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, ({ path: file }) => ({
      contents: styleSheets.get(file)!,
      loader: "text",
    }));
  },
};

async function bundleStyles(): Promise<void> {
  styleSheets.clear();
  for await (const file of new Bun.Glob("**/*.css").scan({
    cwd: path.join(root, "src"),
    absolute: true,
  })) {
    const result = await Bun.build({ entrypoints: [file], minify: release });
    styleSheets.set(file, await result.outputs[0].text());
  }
}

const common = {
  sourcemap: release ? "none" : "inline",
  minify: release,
  define: { INFLUX_VERSION: JSON.stringify(version), INFLUX_DEVELOPMENT: JSON.stringify(!release) },
} satisfies Partial<BuildConfig>;

const renderer = (target: "desktop" | "extension"): BuildConfig => ({
  ...common,
  outdir: path.join(dist, target),
  define: { ...common.define, INFLUX_DESKTOP: JSON.stringify(target === "desktop") },
  entrypoints: [path.join(root, "src/renderer/index.ts")],
  naming: "renderer.js",
  format: "iife",
  target: "browser",
  plugins: [pluginDiscovery, styles],
  jsx: {
    runtime: "classic",
    factory: "React.createElement",
    fragment: "React.Fragment",
  },
});

const desktop = {
  ...common,
  outdir: path.join(dist, "desktop"),
  naming: "[name].js",
  format: "cjs",
  target: "node",
  external: ["electron", "original-fs"],
} satisfies Partial<BuildConfig>;

const builds: BuildConfig[] = [
  renderer("desktop"),
  renderer("extension"),
  {
    ...desktop,
    entrypoints: [path.join(root, "src/desktop/main.ts")],
    // Bun inlines __dirname as the build machine's source path; capture the real one first.
    banner: "var INFLUX_DIRECTORY = __dirname;",
  },
  // Sandboxed windows have no __dirname, so the preload script gets no banner.
  { ...desktop, entrypoints: [path.join(root, "src/desktop/preload.ts")] },
];

async function buildAll(): Promise<void> {
  await mkdir(path.join(dist, "extension"), { recursive: true });
  await cp(path.join(root, "src/extension/rules.json"), path.join(dist, "extension/rules.json"));
  const manifest = JSON.parse(
    await readFile(path.join(root, "src/extension/manifest.json"), "utf8"),
  );
  await writeFile(
    path.join(dist, "extension/manifest.json"),
    `${JSON.stringify({ ...manifest, version }, null, "\t")}\n`,
  );

  await bundleStyles();
  const results = await Promise.all(builds.map((options) => Bun.build(options)));
  for (const result of results) {
    for (const log of result.logs) console.error(log);
  }
  if (results.some((result) => !result.success)) throw new Error("Build failed");

  if (!release && existsSync(developmentInstallDirectory)) {
    for (const file of Object.keys(DESKTOP_ASSETS)) {
      await cp(path.join(dist, "desktop", file), path.join(developmentInstallDirectory, file));
    }
  }
  if (release) {
    await mkdir(path.join(dist, "release"), { recursive: true });
    for (const [file, asset] of Object.entries(DESKTOP_ASSETS)) {
      await cp(path.join(dist, "desktop", file), path.join(dist, "release", asset));
    }
    console.log(`Staged release ${version} in dist/release/`);
  }
  console.log("Built desktop and browser bundles.");
}

// Poll source metadata so watch mode also detects new plugin directories on platforms
// where recursive filesystem notifications miss newly created files.
async function sourceSnapshot(): Promise<string> {
  async function scan(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? scan(file) : [file];
      }),
    );
    return files.flat();
  }
  const files = [...(await scan(path.join(root, "src"))), path.join(root, "tsconfig.json")];
  return JSON.stringify(
    await Promise.all(
      files.sort().map(async (file) => {
        const stats = await stat(file);
        return [file, stats.mtimeMs, stats.ctimeMs, stats.size];
      }),
    ),
  );
}

await rm(dist, { recursive: true, force: true });
if (watch) {
  let previous = "";
  console.log("Watching for changes...");
  while (true) {
    try {
      const current = await sourceSnapshot();
      if (current !== previous) {
        previous = current;
        await buildAll();
      }
    } catch (error) {
      console.error(error);
    }
    await delay(300);
  }
} else {
  await buildAll();
}
