import {
  chownSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage, extractFile } from "@electron/asar";
import { DESKTOP_FILES, influxDataDir } from "../src/shared/paths";
import {
  DESKTOP_ASSETS,
  downloadDesktopRelease,
  fetchLatestRelease,
  installFiles,
  NoReleaseError,
} from "../src/shared/release";

const SHIM_NAME = "influx-shim";
const USAGE = `Installs Influx into the Fluxer desktop app.

Usage: influx-installer [options]

  (no options)   Install the latest Influx release; it updates itself from then on
  --canary       Use Fluxer Canary (picked automatically when only Canary is installed)
  --stable       Use stable Fluxer even when only Canary is found
  --path <dir>   Fluxer's resources folder, or its .app bundle on macOS
  --uninstall    Remove Influx and restore Fluxer's original files
  --dev          Install this checkout's build (source checkout only)
  --local        Install this checkout's release build (source checkout only)
  --help         Show this help`;

const compiled = /\$bunfs|~BUN/i.test(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const pathArg = args.includes("--path") ? args[args.indexOf("--path") + 1] : undefined;
const mode = args.includes("--uninstall")
  ? "uninstall"
  : args.includes("--dev")
    ? "dev"
    : args.includes("--local")
      ? "local"
      : "release";

const sudoUser = process.platform === "linux" ? process.env.SUDO_USER : undefined;
const homeDir = sudoUser ? `/home/${sudoUser}` : os.homedir();

function fluxerResourcesDir(): string {
  if (pathArg) return resolveResourcesPath(pathArg);
  const stable = defaultResourcesDir(false);
  const canary = defaultResourcesDir(true);
  if (args.includes("--canary")) return canary;
  if (args.includes("--stable")) return stable;
  return !hasFluxer(stable) && hasFluxer(canary) ? canary : stable;
}

function hasFluxer(resourcesDir: string): boolean {
  return (
    existsSync(path.join(resourcesDir, "app.asar")) ||
    existsSync(path.join(resourcesDir, "_app.asar"))
  );
}

function resolveResourcesPath(input: string): string {
  const resolved = path.resolve(input);
  return resolved.endsWith(".app") ? path.join(resolved, "Contents", "Resources") : resolved;
}

function defaultResourcesDir(canary: boolean): string {
  switch (process.platform) {
    case "darwin":
      return `/Applications/${canary ? "Fluxer Canary" : "Fluxer"}.app/Contents/Resources`;
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local"),
        canary ? "fluxer_desktop_canary" : "fluxer_desktop",
        "current",
        "resources",
      );
    default:
      return `/opt/${canary ? "fluxer-canary" : "Fluxer"}/resources`;
  }
}

function influxInstallDir(): string {
  return path.join(influxDataDir(homeDir), "dist");
}

function influxDevDir(): string {
  return path.join(influxDataDir(homeDir), "dev");
}

function giveToSudoUser(target: string): void {
  const uid = Number(process.env.SUDO_UID);
  const gid = Number(process.env.SUDO_GID);
  if (!sudoUser || !Number.isInteger(uid) || !Number.isInteger(gid)) return;
  chownSync(target, uid, gid);
  if (statSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) giveToSudoUser(path.join(target, entry));
  }
}

async function installRelease(installDir: string): Promise<string> {
  if (mode === "local") {
    const releaseDir = path.join(root, "dist", "release");
    if (!existsSync(releaseDir))
      throw new Error("dist/release not found. Run `bun run build --release` first.");
    mkdirSync(installDir, { recursive: true });
    for (const [localName, assetName] of Object.entries(DESKTOP_ASSETS)) {
      copyFileSync(path.join(releaseDir, assetName), path.join(installDir, localName));
    }
    return "local release build";
  }
  console.log("Downloading the latest Influx release…");
  const release = await fetchLatestRelease();
  installFiles(installDir, await downloadDesktopRelease(release));
  return `Influx ${release.version}`;
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  if (compiled && (mode === "dev" || mode === "local")) {
    throw new Error(
      `--${mode} needs a source checkout of Influx; run it with \`bun run inject --${mode}\`.`,
    );
  }
  const resourcesDir = fluxerResourcesDir();
  const fluxerAsar = path.join(resourcesDir, "app.asar");
  const movedAsar = path.join(resourcesDir, "_app.asar");
  if (!existsSync(fluxerAsar) && !existsSync(movedAsar)) {
    throw new Error(
      `No app.asar in ${resourcesDir}. Pass --path to your Fluxer install (or --canary).`,
    );
  }
  rmSync(path.join(resourcesDir, "app"), { recursive: true, force: true });

  if (mode === "uninstall") {
    uninstall(resourcesDir);
    console.log(`Removed Influx from ${resourcesDir}. Restart Fluxer.`);
    console.log(
      `Release files remain in ${path.dirname(influxInstallDir())}; delete that folder to remove them too.`,
    );
    return;
  }

  let mainJs: string;
  let installed: string;
  if (mode === "dev") {
    const buildDir = path.join(root, "dist", "desktop");
    if (!existsSync(path.join(buildDir, "main.js")))
      throw new Error("dist/desktop/main.js not found. Run `bun run build` first.");
    const devDir = influxDevDir();
    mkdirSync(devDir, { recursive: true });
    for (const file of DESKTOP_FILES)
      copyFileSync(path.join(buildDir, file), path.join(devDir, file));
    giveToSudoUser(influxDataDir(homeDir));
    mainJs = path.join(devDir, "main.js");
    installed = `development build (bun run build keeps ${devDir} up to date)`;
  } else {
    const installDir = influxInstallDir();
    installed = await installRelease(installDir);
    giveToSudoUser(path.dirname(installDir));
    mainJs = path.join(installDir, "main.js");
  }

  const stagedShim = path.join(resourcesDir, ".influx-shim.asar");
  await buildShim(mainJs, stagedShim);
  moveFluxerAside(resourcesDir);
  renameSync(stagedShim, fluxerAsar);
  console.log(`Installed ${installed} into ${resourcesDir}. Restart Fluxer.`);
}

function isInfluxShim(asarPath: string): boolean {
  try {
    return JSON.parse(extractFile(asarPath, "package.json").toString("utf8")).name === SHIM_NAME;
  } catch {
    return false;
  }
}

function replaceWith(from: string, to: string): void {
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  renameSync(from, to);
}

function moveFluxerAside(resourcesDir: string): void {
  const fluxerAsar = path.join(resourcesDir, "app.asar");
  const movedAsar = path.join(resourcesDir, "_app.asar");
  if (existsSync(fluxerAsar) && !isInfluxShim(fluxerAsar)) {
    replaceWith(fluxerAsar, movedAsar);
    replaceWith(`${fluxerAsar}.unpacked`, `${movedAsar}.unpacked`);
  }
  if (!existsSync(movedAsar)) throw new Error(`Fluxer's app.asar is missing from ${resourcesDir}`);
}

function uninstall(resourcesDir: string): void {
  const fluxerAsar = path.join(resourcesDir, "app.asar");
  const movedAsar = path.join(resourcesDir, "_app.asar");
  if (!existsSync(movedAsar)) return;
  if (existsSync(fluxerAsar) && !isInfluxShim(fluxerAsar)) {
    rmSync(movedAsar, { force: true });
    rmSync(`${movedAsar}.unpacked`, { recursive: true, force: true });
    return;
  }
  rmSync(fluxerAsar, { force: true });
  replaceWith(movedAsar, fluxerAsar);
  replaceWith(`${movedAsar}.unpacked`, `${fluxerAsar}.unpacked`);
}

async function buildShim(mainJs: string, destination: string): Promise<void> {
  const staging = mkdtempSync(path.join(os.tmpdir(), "influx-shim-"));
  try {
    writeFileSync(
      path.join(staging, "package.json"),
      `${JSON.stringify({ name: SHIM_NAME, main: "index.js" }, null, 2)}\n`,
    );
    writeFileSync(path.join(staging, "index.js"), `require(${JSON.stringify(mainJs)});\n`);
    rmSync(destination, { force: true });
    await createPackage(staging, destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function exit(code: number): never {
  if (compiled && process.platform === "win32" && process.stdin.isTTY)
    prompt("\nPress Enter to close.");
  process.exit(code);
}

main().then(
  () => exit(0),
  (error: NodeJS.ErrnoException) => {
    if (error.code === "EACCES" || error.code === "EPERM") {
      console.error(`Permission denied: ${error.path ?? error.message}`);
      if (process.platform === "darwin") {
        console.error(
          'Grant your terminal "App Management" in System Settings > Privacy & Security, then retry.',
        );
      } else if (process.platform === "linux") {
        console.error("Retry with sudo.");
      }
    } else if (error instanceof NoReleaseError) {
      console.error(
        compiled
          ? error.message
          : `${error.message}\nUse --dev to run this checkout, or --local after \`bun run build --release\`.`,
      );
    } else {
      console.error(error.message);
    }
    exit(1);
  },
);
