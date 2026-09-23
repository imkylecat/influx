import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "bun:test";
import {
  compareVersions,
  downloadDesktopRelease,
  type Fetch,
  fetchLatestRelease,
  installFiles,
  NoReleaseError,
  parseChecksums,
  type ReleaseInfo,
} from "../src/shared/release";

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

function fakeGitHub(
  files: Record<string, string>,
  tamper?: string,
): { fetch: Fetch; release: ReleaseInfo } {
  const sums = Object.entries(files).map(([name, data]) => `${sha256(data)}  ${name}`);
  const served: Record<string, string> = { ...files, SHA256SUMS: `${sums.join("\n")}\n` };
  if (tamper) served[tamper] += "// injected";
  const url = (name: string) => `https://example.test/${name}`;
  const fetch: Fetch = async (requested) => {
    const name = Object.keys(served).find((n) => url(n) === requested);
    return name ? new Response(served[name]) : new Response("missing", { status: 404 });
  };
  return {
    fetch,
    release: {
      version: "1.2.0",
      url: "https://example.test",
      notes: "",
      assets: Object.fromEntries(Object.keys(served).map((n) => [n, url(n)])),
    },
  };
}

const DESKTOP_FILES = {
  "influx-main.js": "main",
  "influx-preload.js": "preload",
  "influx-renderer.js": "renderer",
};

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
    assert.equal(compareVersions("v1.2.0", "1.2.1"), -1);
    assert.equal(compareVersions("1.2", "1.2.0"), 0);
  });

  it("sorts pre-releases before their release", () => {
    assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
    assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  });
});

describe("parseChecksums", () => {
  it("reads sha256sum output, including binary-mode markers", () => {
    const hash = "a".repeat(64);
    const sums = parseChecksums(
      `${hash}  influx-main.js\n${hash} *influx-renderer.js\n\nnot a line\n`,
    );
    assert.deepEqual([...sums.keys()], ["influx-main.js", "influx-renderer.js"]);
  });
});

describe("fetchLatestRelease", () => {
  it("reports a missing release as NoReleaseError", async () => {
    await assert.rejects(
      fetchLatestRelease(async () => new Response("{}", { status: 404 })),
      NoReleaseError,
    );
  });

  it("strips the v from tags and maps assets by name", async () => {
    const body = {
      tag_name: "v2.0.1",
      html_url: "u",
      body: null,
      assets: [{ name: "SHA256SUMS", browser_download_url: "d" }],
    };
    const release = await fetchLatestRelease(async () => Response.json(body));
    assert.equal(release.version, "2.0.1");
    assert.deepEqual(release.assets, { SHA256SUMS: "d" });
  });
});

describe("downloadDesktopRelease", () => {
  it("returns verified files under their local names", async () => {
    const { fetch, release } = fakeGitHub(DESKTOP_FILES);
    const files = await downloadDesktopRelease(release, fetch);
    assert.deepEqual(Object.fromEntries([...files].map(([k, v]) => [k, v.toString()])), {
      "main.js": "main",
      "preload.js": "preload",
      "renderer.js": "renderer",
    });
  });

  it("refuses a file whose checksum does not match", async () => {
    const { fetch, release } = fakeGitHub(DESKTOP_FILES, "influx-renderer.js");
    await assert.rejects(
      downloadDesktopRelease(release, fetch),
      /Checksum mismatch for influx-renderer\.js/,
    );
  });

  it("refuses a release without checksums", async () => {
    const { fetch, release } = fakeGitHub(DESKTOP_FILES);
    delete release.assets.SHA256SUMS;
    await assert.rejects(downloadDesktopRelease(release, fetch), /no SHA256SUMS/);
  });
});

describe("installFiles", () => {
  it("replaces existing files and leaves no temporary files", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "influx-test-"));
    try {
      writeFileSync(path.join(dir, "main.js"), "old");
      installFiles(
        dir,
        new Map([
          ["main.js", Buffer.from("new")],
          ["renderer.js", Buffer.from("r")],
        ]),
      );
      assert.equal(readFileSync(path.join(dir, "main.js"), "utf8"), "new");
      assert.deepEqual(readdirSync(dir).sort(), ["main.js", "renderer.js"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
