import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPackage, extractFile, uncache } from "@electron/asar";

if (process.platform !== "linux") {
  throw new Error("Run the Linux installer smoke test on Linux.");
}

const root = path.dirname(import.meta.dir);
const installer = path.join(root, "dist", "release", `influx-installer-linux-${process.arch}`);
const expectedMain = path.join(root, "dist", "release", "influx-main.js");

const sandbox = mkdtempSync(path.join(os.tmpdir(), "influx-linux-smoke-"));
const resources = path.join(sandbox, "resources");
const originalSource = path.join(sandbox, "fluxer-source");
const configHome = path.join(sandbox, "config");
const installedMain = path.join(configHome, "Influx", "dist", "main.js");
const localMarker = path.join(configHome, "Influx", "dist", ".influx-local-build");
const live = path.join(resources, "app.asar");
const original = path.join(resources, "influx-original", "app.asar");
const legacy = path.join(resources, "_app.asar");

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readPackage(file: string): { name: string; main: string } {
  // @electron/asar caches by filename, but this test swaps the archive in place.
  uncache(file);
  return JSON.parse(extractFile(file, "package.json").toString("utf8"));
}

function runInstaller(extra: string[], shouldSucceed = true): string {
  const result = spawnSync(installer, ["--path", resources, ...extra], {
    cwd: path.dirname(installer),
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      SUDO_USER: "",
      SUDO_UID: "",
      SUDO_GID: "",
    },
  });
  if ((result.status === 0) !== shouldSucceed) {
    throw new Error(
      `Installer ${extra.join(" ")} returned status ${result.status}; expected success ${shouldSucceed}.\n` +
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}\nerror: ${result.error}`,
    );
  }
  return result.stdout;
}

try {
  assert.equal(existsSync(installer), true, "Native Linux installer must exist");
  chmodSync(installer, statSync(installer).mode | 0o111);
  assert.match(runInstaller(["--help"]), /Usage: influx-installer/);

  mkdirSync(resources, { recursive: true });
  mkdirSync(path.join(originalSource, "dist", "main"), { recursive: true });
  writeFileSync(
    path.join(originalSource, "package.json"),
    JSON.stringify({
      name: "fluxer_desktop",
      version: "0.0.0-test",
      main: "dist/main/index.js",
      type: "module",
    }),
  );
  writeFileSync(
    path.join(originalSource, "dist", "main", "index.js"),
    "console.log('Fluxer disposable smoke fixture');",
  );
  await createPackage(originalSource, live);
  mkdirSync(`${live}.unpacked`);
  writeFileSync(path.join(`${live}.unpacked`, "native-fixture.txt"), "native-module-data");
  assert.equal(readPackage(live).name, "fluxer_desktop");

  const before = runInstaller(["--diagnose"]);
  assert.match(before, /valid Fluxer desktop/);
  assert.equal(readPackage(live).name, "fluxer_desktop", "--diagnose must not modify original");

  // The compiled Linux binary must use adjacent fork assets by default, rather
  // than silently replacing them with the upstream _app.asar startup code.
  assert.match(runInstaller([]), /Verified: installed main.js matches/);
  assert.equal(sha256(installedMain), sha256(expectedMain));
  assert.equal(existsSync(localMarker), true, "upstream updater protection required");
  assert.equal(readPackage(live).name, "influx-shim");
  assert.equal(readPackage(original).name, "fluxer_desktop");
  assert.equal(
    readFileSync(path.join(`${original}.unpacked`, "native-fixture.txt"), "utf8"),
    "native-module-data",
  );

  const diag = runInstaller(["--diagnose"]);
  assert.match(diag, /installed matches local artifact: YES/);
  assert.match(diag, /supports influx-original layout: yes/);

  runInstaller(["--uninstall"]);
  assert.equal(readPackage(live).name, "fluxer_desktop");
  assert.equal(
    readFileSync(path.join(`${live}.unpacked`, "native-fixture.txt"), "utf8"),
    "native-module-data",
  );

  // Prior upstream Influx used _app.asar: the new installer migrates it safely.
  runInstaller(["--local"]);
  renameSync(original, legacy);
  renameSync(`${original}.unpacked`, `${legacy}.unpacked`);
  runInstaller(["--local"]);
  assert.equal(readPackage(original).name, "fluxer_desktop");
  runInstaller(["--uninstall"]);
  assert.equal(readPackage(live).name, "fluxer_desktop");

  // Never destroy a live shim when no valid original archive remains.
  runInstaller(["--local"]);
  renameSync(original, legacy);
  writeFileSync(legacy, "this is not an ASAR file");
  runInstaller(["--local"], false);
  runInstaller(["--uninstall"], false);
  assert.equal(readPackage(live).name, "influx-shim");
  assert.equal(existsSync(original), false);
  assert.match(runInstaller(["--diagnose"]), /not a readable Fluxer archive/);

  console.log(
    `PASS: Linux ${process.arch} compiled installer, local assets, SHA-256, ASAR backup, migration, native files, safe recovery`,
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
