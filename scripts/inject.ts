import {
  chownSync,
  copyFileSync,
  existsSync,
  readFileSync,
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

import { createPackage, extractFile } from "@electron/asar";
import { createHash } from "node:crypto";

import { fetchLatestRelease, NoReleaseError } from "../src/shared/github";
import { influxDataDirectory } from "../src/shared/paths";
import { localReleaseDirectory } from "../src/shared/localRelease";
import { DESKTOP_ASSETS, LOCAL_BUILD_MARKER, downloadDesktopRelease, installFiles } from "../src/shared/release";
import { fluxerArchivePaths, isFluxerDesktopPackage } from "../src/shared/archiveLayout";

const SHIM_NAME = "influx-shim";
const USAGE = `Installs Influx into the Fluxer desktop app.

Usage: influx-installer [options]

  (no options)      Compiled installer: use matching local artifact; source: upstream
  --upstream        Explicitly install the official upstream Influx release
  --canary          Use Fluxer Canary (picked automatically when only Canary is installed)
  --stable          Use stable Fluxer even when only Canary is found
  --path <folder>   Fluxer's resources folder, or its .app bundle on macOS
  --uninstall       Remove Influx and restore Fluxer's original files
  --diagnose        Inspect archive backups without changing files
  --development     Install this checkout's build (source checkout only)
  --local           Install release assets from this checkout or beside this installer
  --help            Show this help`;

// Bun's compiled executable uses a virtual B:\\~BUN directory on Windows, even
// though import.meta.url can still point at the build-time source file.
const compiled =
  /\\$bunfs|~BUN/i.test(import.meta.dir) ||
  /\\$bunfs|~BUN/i.test(import.meta.url);
const root = path.dirname(import.meta.dir);
const options = process.argv.slice(2);
const pathOption = options.includes("--path") ? options[options.indexOf("--path") + 1] : undefined;
// A standalone compiled test bundle MUST NOT silently download upstream Influx:
// doing so replaces the fork with a main.js that still expects _app.asar.
const mode = options.includes("--diagnose")
  ? "diagnose"
  : options.includes("--uninstall")
    ? "uninstall"
    : options.includes("--development")
      ? "development"
      : options.includes("--upstream")
        ? "release"
        : options.includes("--local") || compiled
          ? "local"
          : "release";

const sudoUser = process.platform === "linux" ? process.env.SUDO_USER : undefined;
const homeDirectory = sudoUser ? `/home/${sudoUser}` : os.homedir();
const influxDirectory = influxDataDirectory(homeDirectory);
const influxInstallDirectory = path.join(influxDirectory, "dist");
const influxDevelopmentDirectory = path.join(influxDirectory, "development");

function fluxerResourcesDirectory(): string {
  if (pathOption) {
    const resolved = path.resolve(pathOption);
    return resolved.endsWith(".app") ? path.join(resolved, "Contents", "Resources") : resolved;
  }
  const stable = defaultResourcesDirectory(false);
  const canary = defaultResourcesDirectory(true);
  if (options.includes("--canary")) return canary;
  if (options.includes("--stable")) return stable;
  return !hasFluxer(stable) && hasFluxer(canary) ? canary : stable;
}

function hasFluxer(resourcesDirectory: string): boolean {
  return (
    existsSync(path.join(resourcesDirectory, "app.asar")) ||
    existsSync(fluxerArchivePaths(resourcesDirectory).original) ||
    existsSync(fluxerArchivePaths(resourcesDirectory).legacyOriginal)
  );
}

function defaultResourcesDirectory(canary: boolean): string {
  switch (process.platform) {
    case "darwin":
      return `/Applications/${canary ? "Fluxer Canary" : "Fluxer"}.app/Contents/Resources`;
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local"),
        canary ? "fluxer_desktop_canary" : "fluxer_desktop",
        "current",
        "resources",
      );
    default: {
      // The deb and rpm packages install to /opt/Fluxer, the Arch package to /opt/fluxer.
      const candidates = (canary ? ["fluxer-canary"] : ["Fluxer", "fluxer"]).map(
        (name) => `/opt/${name}/resources`,
      );
      return candidates.find(hasFluxer) ?? candidates[0];
    }
  }
}

function giveToSudoUser(target: string): void {
  const userId = Number(process.env.SUDO_UID);
  const groupId = Number(process.env.SUDO_GID);
  if (!sudoUser || !Number.isInteger(userId) || !Number.isInteger(groupId)) return;
  chownSync(target, userId, groupId);
  if (statSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) giveToSudoUser(path.join(target, entry));
  }
}

async function installRelease(installDirectory: string): Promise<string> {
  if (mode === "local") {
    const releaseDirectory = localReleaseDirectory(compiled, root, process.execPath);
    const missing = Object.values(DESKTOP_ASSETS).filter(
      (asset) => !existsSync(path.join(releaseDirectory, asset)),
    );
    if (missing.length)
      throw new Error(
        `Missing local release files in ${releaseDirectory}: ${missing.join(", ")}. ` +
          "Download and extract the complete Actions artifact, or run `bun run build --release`.",
      );
    mkdirSync(installDirectory, { recursive: true });
    const expectedMain = path.join(releaseDirectory, DESKTOP_ASSETS["main.js"]);
    if (!readFileSync(expectedMain, "utf8").includes("influx-original")) {
      throw new Error(
        "This bundled main.js does not contain the new Fluxer archive layout. " +
          "Download the latest successful artifact from the fork's Windows Test Build.",
      );
    }
    for (const [localName, assetName] of Object.entries(DESKTOP_ASSETS)) {
      const source = path.join(releaseDirectory, assetName);
      const target = path.join(installDirectory, localName);
      copyFileSync(source, target);
      if (fileDigest(source) !== fileDigest(target))
        throw new Error(`Copied Influx file failed checksum verification: ${localName}`);
    }
    writeFileSync(
      path.join(installDirectory, LOCAL_BUILD_MARKER),
      "Locally packaged fork: only update through the matching GitHub Actions artifact.\\n",
    );
    console.log("Verified: installed main.js matches the local forked artifact.");
    return "local release build";
  }
  console.log("Downloading the latest Influx release…");
  const release = await fetchLatestRelease();
  installFiles(installDirectory, await downloadDesktopRelease(release));
  rmSync(path.join(installDirectory, LOCAL_BUILD_MARKER), { force: true });
  return `Influx ${release.version}`;
}

async function main(): Promise<void> {
  if (options.includes("--help") || options.includes("-h")) {
    console.log(USAGE);
    return;
  }
  if (compiled && mode === "development") {
    throw new Error("--development needs a source checkout: run `bun run inject --development`.");
  }
  const resourcesDirectory = fluxerResourcesDirectory();
  if (mode === "diagnose") {
    diagnoseResources(resourcesDirectory);
    return;
  }
  if (!hasFluxer(resourcesDirectory)) {
    throw new Error(
      `No app.asar in ${resourcesDirectory}. Pass --path to your Fluxer install (or --canary).`,
    );
  }

  if (mode === "uninstall") {
    uninstall(resourcesDirectory);
    console.log(`Removed Influx from ${resourcesDirectory}. Restart Fluxer.`);
    console.log(
      `Release files remain in ${influxDirectory}; delete that folder to remove them too.`,
    );
    return;
  }

  // Under sudo, folders mkdirSync creates (even ~/.config itself) would stay owned by root.
  const createdDirectory = mkdirSync(influxDirectory, { recursive: true });
  if (createdDirectory) giveToSudoUser(createdDirectory);

  let mainScript: string;
  let installed: string;
  if (mode === "development") {
    const buildDirectory = path.join(root, "dist", "desktop");
    if (!existsSync(path.join(buildDirectory, "main.js")))
      throw new Error("dist/desktop/main.js not found. Run `bun run build` first.");
    mkdirSync(influxDevelopmentDirectory, { recursive: true });
    for (const file of Object.keys(DESKTOP_ASSETS))
      copyFileSync(path.join(buildDirectory, file), path.join(influxDevelopmentDirectory, file));
    mainScript = path.join(influxDevelopmentDirectory, "main.js");
    installed = `development build (bun run build keeps ${influxDevelopmentDirectory} up to date)`;
  } else {
    installed = await installRelease(influxInstallDirectory);
    mainScript = path.join(influxInstallDirectory, "main.js");
  }
  giveToSudoUser(influxDirectory);

  const stagedShim = path.join(resourcesDirectory, ".influx-shim.asar");
  await buildShim(mainScript, stagedShim);
  moveFluxerAside(resourcesDirectory);
  renameSync(stagedShim, path.join(resourcesDirectory, "app.asar"));
  console.log(`Installed ${installed} into ${resourcesDirectory}. Restart Fluxer.`);
}

function readAsarPackage(asarPath: string): Record<string, unknown> | null {
  if (!existsSync(asarPath) || !statSync(asarPath).isFile()) return null;
  try {
    const pkg: unknown = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
    return typeof pkg === "object" && pkg !== null ? (pkg as Record<string, unknown>) : null;
  } catch (error) {
    if (mode === "diagnose")
      console.log(`    package read error at ${asarPath}: ${String(error)}`);
    return null;
  }
}

function isInfluxShim(asarPath: string): boolean {
  return readAsarPackage(asarPath)?.name === SHIM_NAME;
}

function isFluxerArchive(asarPath: string): boolean {
  const pkg = readAsarPackage(asarPath);
  if (!isFluxerDesktopPackage(pkg)) {
    if (mode === "diagnose" && pkg !== null)
      console.log(`    package name/main mismatch at ${asarPath}: ${JSON.stringify(pkg)}`);
    return false;
  }
  try {
    // A plausible package.json isn't enough: the actual Electron entry must exist.
    extractFile(asarPath, path.normalize(pkg.main));
    return true;
  } catch (error) {
    if (mode === "diagnose")
      console.log(`    main entry read error (${pkg.main}) at ${asarPath}: ${String(error)}`);
    return false;
  }
}

function fileDigest(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function diagnoseResources(resourcesDirectory: string): void {
  const { live, original, legacyOriginal } = fluxerArchivePaths(resourcesDirectory);
  const previous = path.join(path.dirname(original), "previous-app.asar");
  console.log(`Archive diagnostics for ${resourcesDirectory}:`);
  for (const asarPath of [live, original, legacyOriginal, previous]) {
    const size = existsSync(asarPath) ? statSync(asarPath).size : null;
    const kind = size === null
      ? "MISSING"
      : isFluxerArchive(asarPath)
        ? "valid Fluxer desktop"
        : isInfluxShim(asarPath)
          ? "Influx shim"
          : "not a readable Fluxer archive";
    console.log(`  ${asarPath}: ${kind}${size === null ? "" : ` (${size} bytes)`}`);
    console.log(`    native files: ${existsSync(`${asarPath}.unpacked`) ? "present" : "missing"}`);
  }

  const installed = path.join(influxInstallDirectory, "main.js");
  const expected = path.join(
    localReleaseDirectory(compiled, root, process.execPath),
    DESKTOP_ASSETS["main.js"],
  );
  console.log("Influx main.js diagnostics:");
  if (!existsSync(installed)) {
    console.log(`  installed: MISSING (${installed})`);
  } else {
    const code = readFileSync(installed, "utf8");
    console.log(`  installed: ${installed}`);
    console.log(`  SHA-256: ${fileDigest(installed)}`);
    console.log(
      `  supports influx-original layout: ${code.includes("influx-original") ? "yes" : "NO (older code)"}`,
    );
  }
  if (existsSync(expected)) {
    console.log(`  local artifact: ${expected}`);
    console.log(`  local artifact SHA-256: ${fileDigest(expected)}`);
    console.log(
      `  installed matches local artifact: ${existsSync(installed) && fileDigest(installed) === fileDigest(expected) ? "YES" : "NO"}`,
    );
  } else {
    console.log(`  local artifact: not found at ${expected}`);
  }
}

function replaceWith(from: string, to: string): void {
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  renameSync(from, to);
}

function moveFluxerAside(resourcesDirectory: string): void {
  const { live, original, legacyOriginal } = fluxerArchivePaths(resourcesDirectory);
  const previous = path.join(path.dirname(original), "previous-app.asar");

  // Validate the actual ASAR *before* modifying the real app or its backups.
  if (isFluxerArchive(live)) {
    mkdirSync(path.dirname(original), { recursive: true });
    if (existsSync(original)) {
      // Keep one previous original when a Fluxer update replaces the live archive.
      replaceWith(original, previous);
      replaceWith(`${original}.unpacked`, `${previous}.unpacked`);
    }
    renameSync(live, original);
    replaceWith(`${live}.unpacked`, `${original}.unpacked`);
  } else if (!existsSync(live) || isInfluxShim(live)) {
    if (!isFluxerArchive(original) && isFluxerArchive(legacyOriginal)) {
      if (existsSync(original))
        throw new Error(`Refusing to overwrite an unreadable archive at ${original}; run --diagnose`);
      mkdirSync(path.dirname(original), { recursive: true });
      renameSync(legacyOriginal, original);
      replaceWith(`${legacyOriginal}.unpacked`, `${original}.unpacked`);
    }
  } else {
    throw new Error(`Live app.asar is neither Fluxer nor Influx: ${live}; run --diagnose`);
  }

  if (!isFluxerArchive(original))
    throw new Error(
      "No valid original Fluxer desktop archive is available. Installation stopped without " +
        "replacing the live app.asar. Run --diagnose. If every backup is invalid, " +
        "repair/reinstall the official Fluxer desktop application first.",
    );
}

function uninstall(resourcesDirectory: string): void {
  const { live, original, legacyOriginal } = fluxerArchivePaths(resourcesDirectory);
  const previous = path.join(path.dirname(original), "previous-app.asar");
  if (isFluxerArchive(live)) {
    console.log("The official Fluxer archive is already active; no shim to remove.");
    return;
  }
  if (!isInfluxShim(live))
    throw new Error("Cannot identify an Influx shim in app.asar. Nothing was changed. Run --diagnose.");

  const backup = [original, legacyOriginal, previous].find(isFluxerArchive);
  if (!backup)
    throw new Error(
      "Unable to restore Fluxer: no valid original app.asar is present. " +
        "The Influx shim was NOT removed. Run --diagnose and repair the official Fluxer installation.",
    );

  // Never delete the only bootable app without a valid original to restore.
  const stagedShim = path.join(resourcesDirectory, ".influx-uninstall.asar");
  if (existsSync(stagedShim))
    throw new Error(`Remove or back up the previous recovery file first: ${stagedShim}`);
  renameSync(live, stagedShim);
  try {
    renameSync(backup, live);
    replaceWith(`${backup}.unpacked`, `${live}.unpacked`);
    rmSync(stagedShim, { force: true });
  } catch (error) {
    if (!existsSync(live)) renameSync(stagedShim, live);
    throw error;
  }
}

async function buildShim(mainScript: string, destination: string): Promise<void> {
  const staging = mkdtempSync(path.join(os.tmpdir(), "influx-shim-"));
  try {
    writeFileSync(
      path.join(staging, "package.json"),
      `${JSON.stringify({ name: SHIM_NAME, main: "index.js" }, null, 2)}\n`,
    );
    writeFileSync(path.join(staging, "index.js"), `require(${JSON.stringify(mainScript)});\n`);
    rmSync(destination, { force: true });
    await createPackage(staging, destination);
    // Never move Fluxer's real app.asar until the generated shim can be read back.
    // A compile-time ASAR header cache can be stale after replacement, but this
    // staging path is unique to a single installer invocation.
    for (const name of ["package.json", "index.js"]) {
      const expected = readFileSync(path.join(staging, name));
      const actual = extractFile(destination, name);
      if (!expected.equals(actual))
        throw new Error(`Shim ASAR verification failed for ${name}; refusing to install`);
    }
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
          : `${error.message}\nUse --development to run this checkout, or --local after \`bun run build --release\`.`,
      );
    } else {
      console.error(error.message);
    }
    exit(1);
  },
);
