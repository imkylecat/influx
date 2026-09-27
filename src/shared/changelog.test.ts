import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { changelogSection, toEmbedMarkdown } from "./changelog";

describe("changelog", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [1.2.0] - 2026-01-02",
    "",
    "### Added",
    "",
    "- A long entry that",
    "  wraps onto a second line.",
    "",
    "### Fixed",
    "",
    "- A bug.",
    "",
    "## [1.1.0] - 2026-01-01",
    "",
    "- Older.",
    "",
    "[1.2.0]: https://example.com/compare",
  ].join("\n");

  it("extracts one version's section", () => {
    const section = changelogSection(changelog, "1.2.0");
    assert.ok(section?.startsWith("### Added"));
    assert.ok(section?.endsWith("- A bug."));
    assert.equal(changelogSection(changelog, "1.1.0"), "- Older.");
    assert.equal(changelogSection(changelog, "Unreleased"), null, "empty sections are null");
    assert.equal(changelogSection(changelog, "9.9.9"), null);
  });

  it("has an entry for the current version", () => {
    const root = path.join(import.meta.dir, "..", "..");
    const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    assert.ok(
      changelogSection(readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version),
      `CHANGELOG.md needs a section for ${version}`,
    );
  });

  it("formats a section for a Fluxer embed", () => {
    const section = changelogSection(changelog, "1.2.0")!;
    assert.equal(
      toEmbedMarkdown(section, 4096, "https://example.com"),
      "**Added**\n\n- A long entry that wraps onto a second line.\n\n**Fixed**\n\n- A bug.",
    );
    const short = toEmbedMarkdown(section, 60, "https://example.com");
    assert.ok(short.length <= 60, `${short.length} characters`);
    assert.ok(short.endsWith("[Read the full changelog](https://example.com)"));
  });
});
