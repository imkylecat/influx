/**
 * Conservative capture upgrade for an already-authorized desktop screen share.
 *
 * The browser may initially provide a 1080p-equivalent track even when Fluxer
 * has Source selected. This helper only suggests a native-sized, aspect-correct
 * request for the *same* monitor; it never changes the server bitrate ceiling.
 */
export interface CaptureDimensions {
  width: number;
  height: number;
}

export interface CaptureUpgrade extends CaptureDimensions {
  frameRate: number;
}

function usable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * Returns null if the captured track already has sufficient resolution, or
 * if window.screen is not a reliable match for the captured monitor.
 *
 * Chromium's screen.width/height can be CSS pixels; devicePixelRatio converts
 * them to physical pixels, while the width cap avoids oversized H.264 captures
 * on GPUs with hardware encoder profiles limited to 3840 pixels.
 */
export function suggestCaptureUpgrade(
  current: CaptureDimensions,
  display: CaptureDimensions,
  devicePixelRatio: number,
  frameRate: number,
  maxEncoderWidth = 3840,
): CaptureUpgrade | null {
  if (
    !usable(current.width) || !usable(current.height) ||
    !usable(display.width) || !usable(display.height) ||
    !usable(devicePixelRatio) || !usable(maxEncoderWidth)
  ) return null;

  const currentAspect = current.width / current.height;
  const displayAspect = display.width / display.height;

  // A different monitor or a cropped window may not share the main display's
  // aspect ratio. Never force an unrelated display's geometry onto its track.
  if (Math.abs(currentAspect / displayAspect - 1) > 0.05) return null;

  const targetWidth = evenFloor(
    Math.min(maxEncoderWidth, display.width * devicePixelRatio),
  );
  const targetHeight = evenFloor(
    Math.min(display.height * devicePixelRatio, targetWidth / currentAspect),
  );
  const currentPixels = current.width * current.height;
  const targetPixels = targetWidth * targetHeight;

  // Avoid repeatedly renegotiating tracks already within ~80% of their budget.
  if (
    targetWidth <= current.width ||
    targetHeight <= current.height ||
    targetPixels <= currentPixels * 1.25
  ) return null;

  return {
    width: targetWidth,
    height: targetHeight,
    frameRate: Math.max(15, Math.min(60, Math.floor(usable(frameRate) ? frameRate : 60))),
  };
}

export function shouldEnhanceMonitorCapture(
  isDesktop: boolean,
  displaySurface: string | undefined,
  streamingMode: string | undefined,
  resolution: string | undefined,
  higherQualityEnabled: boolean,
  captureEnhancementEnabled: boolean,
): boolean {
  return isDesktop &&
    displaySurface === "monitor" &&
    streamingMode === "custom" &&
    resolution === "source" &&
    higherQualityEnabled &&
    captureEnhancementEnabled;
}

/**
 * First retain the track's existing capture options (cursor/surface/etc).
 * Some Chromium capture backends reject frame-rate constraints while accepting
 * a resolution-only change; retrying only dimensions avoids losing the share.
 */
export async function applyCaptureUpgrade(
  track: Pick<MediaStreamTrack, "getConstraints" | "applyConstraints">,
  target: CaptureUpgrade,
): Promise<{ fallbackUsed: boolean }> {
  const width = { ideal: target.width };
  const height = { ideal: target.height };

  try {
    await track.applyConstraints({
      ...track.getConstraints(),
      width,
      height,
      frameRate: { ideal: target.frameRate, max: target.frameRate },
    });
    return { fallbackUsed: false };
  } catch {
    await track.applyConstraints({ width, height });
    return { fallbackUsed: true };
  }
}
