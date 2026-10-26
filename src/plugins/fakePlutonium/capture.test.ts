import { describe, expect, it } from "bun:test";

import { applyCaptureUpgrade, shouldEnhanceMonitorCapture, suggestCaptureUpgrade } from "./capture";

describe("FakePlutonium safe display capture enhancement", () => {
  it("targets 3840x1080 for the measured ultrawide source under 125% scaling", () => {
    expect(suggestCaptureUpgrade(
      { width: 2708, height: 762 },
      { width: 4096, height: 1152 },
      1.25,
      60,
    )).toEqual({ width: 3840, height: 1080, frameRate: 60 });
  });

  it("proposes 4K capture for a full 4K monitor previously captured at 1080p", () => {
    expect(suggestCaptureUpgrade(
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
      1,
      60,
    )).toEqual({ width: 3840, height: 2160, frameRate: 60 });
  });

  it("does not upscale 1080p monitors or nearly-native tracks", () => {
    expect(suggestCaptureUpgrade(
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 },
      1,
      60,
    )).toBeNull();
    expect(suggestCaptureUpgrade(
      { width: 3620, height: 1018 },
      { width: 4096, height: 1152 },
      1.25,
      60,
    )).toBeNull();
  });

  it("never guesses capture geometry for a mismatched secondary monitor", () => {
    expect(suggestCaptureUpgrade(
      { width: 1280, height: 720 },
      { width: 4096, height: 1152 },
      1.25,
      60,
    )).toBeNull();
  });

  it("rejects invalid sizes and clamps requested fps", () => {
    expect(suggestCaptureUpgrade(
      { width: 0, height: 720 },
      { width: 3840, height: 2160 },
      1,
      60,
    )).toBeNull();
    expect(suggestCaptureUpgrade(
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
      1,
      120,
    )?.frameRate).toBe(60);
  });

  it("only enhances explicit desktop custom Source monitor shares", () => {
    const allowed = shouldEnhanceMonitorCapture(true, "monitor", "custom", "source", true, true);
    expect(allowed).toBe(true);
    expect(shouldEnhanceMonitorCapture(false, "monitor", "custom", "source", true, true)).toBe(false);
    expect(shouldEnhanceMonitorCapture(true, "window", "custom", "source", true, true)).toBe(false);
    expect(shouldEnhanceMonitorCapture(true, "monitor", "gaming", "ultra", true, true)).toBe(false);
    expect(shouldEnhanceMonitorCapture(true, "monitor", "custom", "source", false, true)).toBe(false);
    expect(shouldEnhanceMonitorCapture(true, "monitor", "custom", "source", true, false)).toBe(false);
  });
  it("applies upgraded dimensions and frame rate to the same capture track", async () => {
    const calls: MediaTrackConstraints[] = [];
    const track = {
      getConstraints: () => ({ aspectRatio: { ideal: 3.55 } }),
      applyConstraints: async (constraints: MediaTrackConstraints) => { calls.push(constraints); },
    };
    const result = await applyCaptureUpgrade(track, { width: 3840, height: 1080, frameRate: 60 });
    expect(result).toEqual({ fallbackUsed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.width).toEqual({ ideal: 3840 });
    expect(calls[0]?.height).toEqual({ ideal: 1080 });
    expect(calls[0]?.frameRate).toEqual({ ideal: 60, max: 60 });
    expect(calls[0]?.aspectRatio).toEqual({ ideal: 3.55 });
  });

  it("retries resolution only if the browser rejects frame-rate constraints", async () => {
    const calls: MediaTrackConstraints[] = [];
    const track = {
      getConstraints: () => ({}),
      applyConstraints: async (constraints: MediaTrackConstraints) => {
        calls.push(constraints);
        if (constraints.frameRate !== undefined) throw new Error("Frame rate not supported");
      },
    };
    const result = await applyCaptureUpgrade(track, { width: 3840, height: 1080, frameRate: 60 });
    expect(result).toEqual({ fallbackUsed: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.frameRate).toBeUndefined();
    expect(calls[1]?.width).toEqual({ ideal: 3840 });
  });

  it("surfaces a rejection only after both attempts fail", async () => {
    const track = {
      getConstraints: () => ({}),
      applyConstraints: async () => { throw new Error("Unsupported"); },
    };
    await expect(applyCaptureUpgrade(track, { width: 3840, height: 1080, frameRate: 60 }))
      .rejects.toThrow("Unsupported");
  });

});
