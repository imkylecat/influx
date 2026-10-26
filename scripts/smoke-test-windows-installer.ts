import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPackage, extractFile, uncache } from "@electron/asar";

const repositoryRoot = path.dirname(import.meta.dir);
const installer = path.join(repositoryRoot, "dist", "release", "influx-installer-windows-x64.exe");
const workingDirectory = mkdtempSync(path.join(os.tmpdir(), "influx-installer-smoke-"));
const resources = path.join(workingDirectory, "resources");
const source = path.join(workingDirectory, "fluxer-src");
const live = path.join(resources, "app.asar");
const original = path.join(resources, "influx-original", "app.asar");
const legacyOriginal = path.join(resources, "_app.asar");
const fakeAppData = path.join(workingDirectory, "AppData");
const installedMain = path.join(fakeAppData, "Influx", "dist", "main.js");
const downloadedMain = path.join(repositoryRoot, "dist", "release", "influx-main.js");
const buildMarker = path.join(fakeAppData, "Influx", "dist", ".influx-local-build");

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}


function pkg(file: string) {
  // @electron/asar caches headers by path. Installation swaps app.asar in place.
  uncache(file);
  return JSON.parse(extractFile(file, "package.json").toString("utf8")) as {
    name: string; main: string;
  };
}

function installerRun(args: string[], expectSuccess: boolean) {
  const result = spawnSync(installer, ["--path", resources, ...args], {
    cwd: path.dirname(installer),
    env: { ...process.env, APPDATA: fakeAppData },
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  if (!!(result.status === 0) !== expectSuccess)
    throw new Error(
      `Installer ${args.join(" ")} returned ${result.status} (expected success: ${expectSuccess})\n` +
      `stdout: ${result.stdout}\nstderr: ${result.stderr}\nerror: ${result.error}`,
    );
  return result;
}

try {
  mkdirSync(resources, { recursive: true });
  mkdirSync(path.join(source, "dist", "main"), { recursive: true });
  writeFileSync(path.join(source, "package.json"), JSON.stringify({
    name: "fluxer_desktop",
    version: "0.0.0",
    main: "dist/main/index.js",
    type: "module",
  }));
  writeFileSync(path.join(source, "dist", "main", "index.js"), "console.log('fake fluxer');");
  await createPackage(source, live);
  mkdirSync(`${live}.unpacked`, { recursive: true });
  writeFileSync(path.join(`${live}.unpacked`, "native-placeholder.txt"), "binary fixture");
  assert.equal(pkg(live).name, "fluxer_desktop", "the fixture must be a readable ASAR");
  console.log(installerRun(["--diagnose"], true).stdout);

  // A compiled installer launched without --local must install the forked assets,
  // never silently download an upstream main.js that expects _app.asar.
  const firstInstall = installerRun([], true);
  assert.match(firstInstall.stdout, /Verified: installed main.js matches/);
  assert.equal(sha256(installedMain), sha256(downloadedMain), "running main.js must equal downloaded fork");
  assert.equal(existsSync(buildMarker), true, "local marker protects against upstream auto-updates");
  assert.equal(pkg(live).name, "influx-shim", "live archive should contain the shim");
  assert.equal(pkg(original).name, "fluxer_desktop", "must back up the real Fluxer archive");
  assert.equal(
    readFileSync(path.join(`${original}.unpacked`, "native-placeholder.txt"), "utf8"),
    "binary fixture",
  );
  const diagnostics = installerRun(["--diagnose"], true).stdout;
  assert.match(diagnostics, /valid Fluxer desktop/);
  assert.match(diagnostics, /installed matches local artifact: YES/);
  assert.match(diagnostics, /supports influx-original layout: yes/);
  installerRun(["--uninstall"], true);
  assert.equal(pkg(live).name, "fluxer_desktop", "uninstall must restore Fluxer");
  assert.equal(readFileSync(path.join(`${live}.unpacked`, "native-placeholder.txt"), "utf8"), "binary fixture");

  // Test migration from upstream Influx, which stored its original as _app.asar.
  installerRun(["--local"], true);
  renameSync(original, legacyOriginal);
  renameSync(`${original}.unpacked`, `${legacyOriginal}.unpacked`);
  installerRun(["--local"], true);
  assert.equal(pkg(original).name, "fluxer_desktop", "legacy original must be migrated");
  installerRun(["--uninstall"], true);
  assert.equal(pkg(live).name, "fluxer_desktop");

  // Simulate the exact type of broken installation in the user report.
  installerRun(["--local"], true);
  renameSync(original, legacyOriginal);
  writeFileSync(legacyOriginal, "not-an-asar");
  assert.equal(pkg(live).name, "influx-shim");
  installerRun(["--local"], false);
  installerRun(["--uninstall"], false);
  assert.equal(pkg(live).name, "influx-shim", "must not delete shim without a valid backup");
  assert.match(installerRun(["--diagnose"], true).stdout, /not a readable Fluxer archive/);
  assert.equal(existsSync(original), false, "failed preflight must not fabricate a backup");

  console.log("PASS: packaged fork default install, exact JS hashes, native assets, uninstall, migration, corrupt-backup safety");
} finally {
  rmSync(workingDirectory, { recursive: true, force: true });
}
