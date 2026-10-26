import { describe, it } from "bun:test";
import assert from "node:assert/strict";

import { qualityLimitValue } from ".";

describe("FakePlutonium", () => {
  it("enables only the client-side higher-video-quality limit", () => {
    assert.equal(qualityLimitValue("feature_higher_video_quality", 0, true), 1);
    assert.equal(qualityLimitValue("feature_higher_video_quality", 1, true), 1);
    assert.equal(qualityLimitValue("feature_higher_video_quality", 0, false), 0);
  });

  it("preserves all bitrate and unrelated account limits", () => {
    assert.equal(qualityLimitValue("max_screen_share_bitrate", 9_000_000, true), 9_000_000);
    assert.equal(qualityLimitValue("feature_animated_avatar", 0, true), 0);
  });
});
