import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

const root = path.dirname(import.meta.dir);
const outDir = path.join(root, "dist", "release");
const entry = path.join(root, "scripts", "inject.ts");

const TARGETS = [
  { target: "bun-darwin-arm64", file: "influx-installer-macos-arm64" },
  { target: "bun-darwin-x64", file: "influx-installer-macos-x64" },
  { target: "bun-windows-x64", file: "influx-installer-windows-x64.exe" },
  { target: "bun-linux-x64", file: "influx-installer-linux-x64" },
  { target: "bun-linux-arm64", file: "influx-installer-linux-arm64" },
];

const hostTarget = `bun-${process.platform}-${process.arch}`;
const targets = process.argv.includes("--host")
  ? TARGETS.filter((t) => t.target === hostTarget)
  : TARGETS;
if (targets.length === 0) throw new Error(`No installer target for ${hostTarget}`);

await mkdir(outDir, { recursive: true });
for (const { target, file } of targets) {
  const outfile = path.join(outDir, file);
  await $`${process.execPath} build ${entry} --compile --minify --target=${target} --outfile ${outfile}`;
  if (target.startsWith("bun-darwin")) {
    if (process.platform === "darwin") {
      await $`codesign --force --sign - ${outfile}`.quiet();
    } else {
      console.warn(
        `${file} is unsigned; Apple Silicon Macs will refuse to run it. Build on macOS.`,
      );
    }
  }
  console.log(`Built ${path.relative(root, outfile)}`);
}
