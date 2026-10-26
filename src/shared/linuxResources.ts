import path from "node:path";

/**
 * Conservative install location hints for native Linux distributions.
 * We deliberately avoid Flatpak mounts and AppImages: their app resources
 * are immutable/sandboxed, so modifying them would be unsafe.
 */
export function linuxResourcesCandidates(home: string, canary: boolean): string[] {
  const names = canary ? ["fluxer-canary", "Fluxer Canary"] : ["Fluxer", "fluxer"];
  const roots = [
    "/opt",
    "/usr/lib",
    "/usr/share",
    "/usr/local/lib",
    "/usr/local/share",
    path.join(home, ".local", "share"),
    path.join(home, ".local", "opt"),
    path.join(home, "Applications"),
  ];
  return roots.flatMap((root) => names.map((name) => path.join(root, name, "resources")));
}

/**
 * Accept --path as an app.asar file, resources directory, or app directory.
 * A custom tar.gz installation can live anywhere; the explicit path wins.
 */
export function resolveLinuxResourcesPath(
  candidate: string,
  hasFluxer: (directory: string) => boolean,
): string {
  const resolved = path.resolve(candidate);
  if (path.basename(resolved) === "app.asar") return path.dirname(resolved);
  if (hasFluxer(resolved)) return resolved;
  const nested = path.join(resolved, "resources");
  return hasFluxer(nested) ? nested : resolved;
}
