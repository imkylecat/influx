import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { BuildConfig, BunPlugin } from "bun";
import { influxDataDir } from "../src/shared/paths";
import { DESKTOP_ASSETS } from "../src/shared/release";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const pluginsDir = path.join(root, "src/plugins");
const watch = process.argv.includes("--watch");
const release = process.argv.includes("--release");
const devInstallDir = path.join(influxDataDir(), "dev");

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
        loader: "ts",
      };
    });
  },
};

const common = {
  sourcemap: release ? "none" : "inline",
  minify: release,
  define: { INFLUX_VERSION: JSON.stringify(version), INFLUX_DEV: JSON.stringify(!release) },
} satisfies Partial<BuildConfig>;

const renderer: BuildConfig = {
  ...common,
  entrypoints: [path.join(root, "src/renderer/index.ts")],
  format: "iife",
  target: "browser",
  plugins: [pluginDiscovery],
  jsx: {
    runtime: "classic",
    factory: "React.createElement",
    fragment: "React.Fragment",
  },
};

const builds: BuildConfig[] = [
  { ...renderer, outdir: path.join(dist, "desktop"), naming: "renderer.js" },
  { ...renderer, outdir: path.join(dist, "extension"), naming: "renderer.js" },
  {
    ...common,
    entrypoints: ["main", "preload"].map((name) => path.join(root, `src/desktop/${name}.ts`)),
    outdir: path.join(dist, "desktop"),
    naming: "[name].js",
    format: "cjs",
    target: "node",
    external: ["electron"],
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

  if (!release && existsSync(devInstallDir)) {
    for (const result of results) {
      for (const output of result.outputs) {
        if (path.dirname(output.path) === path.join(dist, "desktop")) {
          await cp(output.path, path.join(devInstallDir, path.basename(output.path)));
        }
      }
    }
  }
  if (release) await stageRelease();
  console.log("Built desktop and browser bundles.");
}

// Poll source metadata so watch mode also detects new plugin directories on platforms
// where recursive filesystem notifications miss newly created files.
async function sourceSnapshot(): Promise<string> {
  async function scan(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? scan(file) : [file];
      }),
    );
    return files.flat();
  }
  const files = [...(await scan(path.join(root, "src"))), path.join(root, "tsconfig.json")];
  return JSON.stringify(
    await Promise.all(
      files.sort().map(async (file) => {
        const info = await stat(file);
        return [file, info.mtimeMs, info.ctimeMs, info.size];
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
