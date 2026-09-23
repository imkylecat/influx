// Prints a version's CHANGELOG.md section: bun scripts/changelog.ts 0.2.3
import { readFileSync } from "node:fs";
import path from "node:path";
import { changelogSection } from "../src/shared/changelog";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: bun scripts/changelog.ts <version>");
  process.exit(1);
}

const changelog = readFileSync(path.join(import.meta.dir, "..", "CHANGELOG.md"), "utf8");
const section = changelogSection(changelog, version);
if (!section) {
  console.error(`CHANGELOG.md has no entry for ${version}`);
  process.exit(1);
}
console.log(section);
