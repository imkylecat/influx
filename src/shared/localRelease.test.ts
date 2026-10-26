import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import path from "node:path";

import { localReleaseDirectory } from "./localRelease";

describe("localReleaseDirectory", () => {
  it("loads a source build from dist/release", () => {
    assert.equal(localReleaseDirectory(false, path.join("influx"), "/ignored/exe"),
      path.join("influx", "dist", "release"));
  });

  it("loads a compiled installer alongside the files from Actions", () => {
    const exe = path.join("Downloads", "influx-windows-test", "influx-installer-windows-x64.exe");
    assert.equal(localReleaseDirectory(true, "ignored", exe),
      path.join("Downloads", "influx-windows-test"));
  });
});
