import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import path from "node:path";

import { fluxerArchivePaths } from "./archiveLayout";

describe("Fluxer archive compatibility", () => {
  it("keeps the original archive named app.asar for Fluxer native modules", () => {
    const paths = fluxerArchivePaths(path.join("resources"));
    assert.equal(path.basename(paths.original), "app.asar");
    assert.equal(path.basename(path.dirname(paths.original)), "influx-original");
    assert.equal(path.basename(paths.legacyOriginal), "_app.asar");
    assert.equal(path.basename(paths.live), "app.asar");
  });
});
