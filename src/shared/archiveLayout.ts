import path from "node:path";

export const ORIGINAL_ASAR_DIRECTORY = "influx-original";
export const ORIGINAL_ASAR_FILE = "app.asar";

export function fluxerArchivePaths(resourcesDirectory: string) {
  const live = path.join(resourcesDirectory, ORIGINAL_ASAR_FILE);
  const original = path.join(resourcesDirectory, ORIGINAL_ASAR_DIRECTORY, ORIGINAL_ASAR_FILE);
  const legacyOriginal = path.join(resourcesDirectory, "_app.asar");
  return { live, original, legacyOriginal };
}

export interface FluxerDesktopPackage {
  name: string;
  main: string;
  version: string;
  productName?: string;
}

/** Do not mistake Influx's shim or an unrelated ASAR for the original Fluxer app. */
export function isFluxerDesktopPackage(value: unknown): value is FluxerDesktopPackage {
  if (typeof value !== "object" || value === null) return false;
  const pkg = value as Partial<FluxerDesktopPackage>;
  return (
    pkg.name === "fluxer_desktop" &&
    typeof pkg.main === "string" &&
    pkg.main.length > 0 &&
    typeof pkg.version === "string"
  );
}

export function originalArchiveCandidates(resourcesDirectory: string): string[] {
  const { original, legacyOriginal } = fluxerArchivePaths(resourcesDirectory);
  return [original, legacyOriginal];
}
