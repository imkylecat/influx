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

const common = {
  outdir: path.join(dist, "desktop"),
  sourcemap: release ? "none" : "inline",
  minify: release,
  define: { INFLUX_VERSION: JSON.stringify(version), INFLUX_DEVELOPMENT: JSON.stringify(!release) },
} satisfies Partial<BuildConfig>;

const builds: BuildConfig[] = [
  {
    ...common,
    entrypoints: [path.join(root, "src/renderer/index.ts")],
    naming: "renderer.js",
    format: "iife",
    target: "browser",
    plugins: [pluginDiscovery],
    jsx: {
      runtime: "classic",
      factory: "React.createElement",
      fragment: "React.Fragment",
    },
  },
  {
    ...common,
    entrypoints: ["main", "preload"].map((name) => path.join(root, `src/desktop/${name}.ts`)),
    naming: "[name].js",
    format: "cjs",
    target: "node",
    external: ["electron", "original-fs"],
    // Bun inlines __dirname as the build machine's source path; capture the real one first.
    banner: "var INFLUX_DIRECTORY = __dirname;",
  },
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

  const results = await Promise.all(builds.map((options) => Bun.build(options)));
  for (const result of results) {
    for (const log of result.logs) console.error(log);
  }
  if (results.some((result) => !result.success)) throw new Error("Build failed");
  await cp(path.join(dist, "desktop/renderer.js"), path.join(dist, "extension/renderer.js"));

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
