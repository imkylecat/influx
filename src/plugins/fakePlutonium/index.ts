import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { filters, waitFor } from "@webpack/finders";

import {
  applyCaptureUpgrade,
  shouldEnhanceMonitorCapture,
  suggestCaptureUpgrade,
  type CaptureDimensions,
  type CaptureUpgrade,
} from "./capture";

interface LimitOptions {
  key: string;
  fallback: number;
  context?: unknown;
  instanceDomain?: string;
}

interface LimitResolver {
  resolve(options: LimitOptions): number;
  resolveStock(key: string, fallback: number): number;
  resolveRestricted(key: string, fallback: number): number;
}

interface VoiceSettings {
  getStreamingMode(): string;
  getScreenshareResolution(): string;
  getVideoFrameRate(): number;
  getScreenShareBitrateBudget(): { ceilingBps: number; chosenBps: number | null };
}

type CaptureResult =
  | "not-started"
  | "not-desktop"
  | "not-monitor"
  | "quality-store-unavailable"
  | "not-custom-source"
  | "no-video-track"
  | "already-near-target"
  | "upgraded"
  | "unchanged"
  | "rejected";

interface CaptureDiagnostics {
  result: CaptureResult;
  timestamp?: number;
  actualBefore?: CaptureDimensions;
  requested?: CaptureUpgrade;
  actualAfter?: CaptureDimensions;
  fallbackUsed?: boolean;
  error?: string;
}

const settings = definePluginSettings({
  higherStreamQuality: {
    type: "boolean",
    description:
      "Show higher-resolution and 60 FPS stream settings locally. Instance/server bitrate limits are unchanged.",
    default: true,
  },
  enhanceSourceCapture: {
    type: "boolean",
    description:
      "For desktop full-monitor Custom/Source shares, try to recover capture resolution that Chromium downscaled. Never exceed 3840px width; falls back safely if unsupported.",
    default: true,
  },
});

let active = false;
let resolver: LimitResolver | undefined;
let originalResolve: LimitResolver["resolve"] | undefined;
let patchedResolve: LimitResolver["resolve"] | undefined;
let voiceSettings: VoiceSettings | undefined;
let mediaDevices: MediaDevices | undefined;
let originalGetDisplayMedia: MediaDevices["getDisplayMedia"] | undefined;
let patchedGetDisplayMedia: MediaDevices["getDisplayMedia"] | undefined;
let lastCapture: CaptureDiagnostics = { result: "not-started" };

export function qualityLimitValue(key: string, actual: number, enabled: boolean): number {
  return key === "feature_higher_video_quality" && enabled ? Math.max(1, actual) : actual;
}

function installLimitResolver(resolved: LimitResolver): void {
  if (!active || resolver) return;
  const previous = resolved.resolve;
  if (typeof previous !== "function") return;

  const replacement: LimitResolver["resolve"] = function (this: LimitResolver, options) {
    const value = previous.call(this, options);
    return qualityLimitValue(options?.key, value, settings.store.higherStreamQuality);
  };

  try {
    resolved.resolve = replacement;
    if (resolved.resolve !== replacement) return;
  } catch {
    return;
  }

  resolver = resolved;
  originalResolve = previous;
  patchedResolve = replacement;
}

function installQualityState(candidate: VoiceSettings): void {
  if (!active) return;
  if (
    typeof candidate.getStreamingMode === "function" &&
    typeof candidate.getScreenshareResolution === "function" &&
    typeof candidate.getVideoFrameRate === "function"
  ) {
    voiceSettings = candidate;
  }
}

function setLastCapture(result: CaptureResult, details: Omit<CaptureDiagnostics, "result" | "timestamp"> = {}): void {
  lastCapture = { result, timestamp: Date.now(), ...details };
}

async function enhanceCapturedTrack(
  stream: MediaStream,
  options?: DisplayMediaStreamOptions,
): Promise<void> {
  if (window.location.protocol !== "fluxer-app:") {
    setLastCapture("not-desktop");
    return;
  }

  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== "live") {
    setLastCapture("no-video-track");
    return;
  }

  const videoOptions = options?.video;
  const requestedSurface =
    videoOptions && typeof videoOptions === "object"
      ? (videoOptions as MediaTrackConstraints & { displaySurface?: string }).displaySurface
      : undefined;
  // Fluxer may omit the surface hint in its initial getDisplayMedia call.
  // The captured track's actual displaySurface is more authoritative.
  const observedSurface =
    (track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
  const displaySurface = observedSurface ?? requestedSurface;

  if (displaySurface !== "monitor") {
    setLastCapture("not-monitor");
    return;
  }

  if (!voiceSettings) {
    setLastCapture("quality-store-unavailable");
    return;
  }

  if (!shouldEnhanceMonitorCapture(
    true,
    displaySurface,
    voiceSettings.getStreamingMode(),
    voiceSettings.getScreenshareResolution(),
    settings.store.higherStreamQuality,
    settings.store.enhanceSourceCapture,
  )) {
    setLastCapture("not-custom-source");
    return;
  }

  const before = track.getSettings();
  const dims = { width: before.width ?? 0, height: before.height ?? 0 };
  const requested = suggestCaptureUpgrade(
    dims,
    { width: window.screen.width, height: window.screen.height },
    window.devicePixelRatio || 1,
    voiceSettings.getVideoFrameRate(),
  );

  if (!requested) {
    setLastCapture("already-near-target", { actualBefore: dims });
    return;
  }

  try {
    // Apply to the existing video track instead of reacquiring the display.
    // This preserves Fluxer's native desktop-audio bridge and chosen source.
    const { fallbackUsed } = await applyCaptureUpgrade(track, requested);
    const after = track.getSettings();
    const updated = { width: after.width ?? 0, height: after.height ?? 0 };
    const grew = updated.width * updated.height > dims.width * dims.height * 1.1;
    setLastCapture(grew ? "upgraded" : "unchanged", {
      actualBefore: dims,
      requested,
      actualAfter: updated,
      fallbackUsed,
    });
  } catch (error) {
    setLastCapture("rejected", {
      actualBefore: dims,
      requested,
      actualAfter: {
        width: track.getSettings().width ?? 0,
        height: track.getSettings().height ?? 0,
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function installCaptureHook(): void {
  if (!active || mediaDevices || typeof navigator === "undefined") return;
  const devices = navigator.mediaDevices;
  if (!devices || typeof devices.getDisplayMedia !== "function") return;
  const original = devices.getDisplayMedia;

  const replacement: MediaDevices["getDisplayMedia"] = async function (
    this: MediaDevices,
    options?: DisplayMediaStreamOptions,
  ): Promise<MediaStream> {
    // Keep all selection, capture permissions, native audio and errors in
    // Fluxer's existing getDisplayMedia implementation.
    const stream = await original.call(this, options);
    if (!active) return stream;

    try {
      await enhanceCapturedTrack(stream, options);
    } catch (error) {
      // Any unexpected error must NOT interrupt an already-successful share.
      setLastCapture("rejected", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return stream;
  };

  try {
    devices.getDisplayMedia = replacement;
    if (devices.getDisplayMedia !== replacement) return;
  } catch {
    return;
  }

  mediaDevices = devices;
  originalGetDisplayMedia = original;
  patchedGetDisplayMedia = replacement;
}

export default definePlugin({
  name: "FakePlutonium",
  description:
    "Unlock higher-quality local stream choices, plus an optional safe capture-resolution boost for desktop Custom/Source monitors.",
  authors: [{ name: "mubeenkh4u", id: "0" }],
  settings,

  start() {
    active = true;
    lastCapture = { result: "not-started" };
    waitFor(filters.byProperties("resolve", "resolveStock", "resolveRestricted"), installLimitResolver);
    waitFor(
      filters.byProperties("getStreamingMode", "getScreenshareResolution", "getVideoFrameRate", "getScreenShareBitrateBudget"),
      installQualityState,
    );
    installCaptureHook();
  },

  stop() {
    active = false;
    if (resolver && originalResolve && resolver.resolve === patchedResolve) {
      resolver.resolve = originalResolve;
    }
    if (mediaDevices && originalGetDisplayMedia && mediaDevices.getDisplayMedia === patchedGetDisplayMedia) {
      mediaDevices.getDisplayMedia = originalGetDisplayMedia;
    }
    resolver = undefined;
    originalResolve = undefined;
    patchedResolve = undefined;
    voiceSettings = undefined;
    mediaDevices = undefined;
    originalGetDisplayMedia = undefined;
    patchedGetDisplayMedia = undefined;
    lastCapture = { result: "not-started" };
  },

  getStatus() {
    return {
      running: active,
      resolverHooked: resolver !== undefined && resolver.resolve === patchedResolve,
      higherStreamQuality: settings.store.higherStreamQuality,
      enhanceSourceCapture: settings.store.enhanceSourceCapture,
      captureHooked: mediaDevices !== undefined && mediaDevices.getDisplayMedia === patchedGetDisplayMedia,
      qualityStateFound: voiceSettings !== undefined,
      selectedMode: voiceSettings?.getStreamingMode(),
      selectedResolution: voiceSettings?.getScreenshareResolution(),
      selectedFps: voiceSettings?.getVideoFrameRate(),
      lastCapture,
    };
  },
});
