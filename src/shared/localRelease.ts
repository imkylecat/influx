import path from "node:path";

/**
 * A compiled Bun installer must load assets next to its own executable.
 * A source checkout uses the output of `bun run build --release`.
 */
export function localReleaseDirectory(compiled: boolean, projectRoot: string, executable: string): string {
  return compiled ? path.dirname(executable) : path.join(projectRoot, "dist", "release");
}
