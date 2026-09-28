import os from "node:os";
import path from "node:path";

export function influxDataDirectory(homeDirectory: string = os.homedir()): string {
  const base =
    process.platform === "darwin"
      ? path.join(homeDirectory, "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env.APPDATA ?? path.join(homeDirectory, "AppData", "Roaming"))
        : (process.env.XDG_CONFIG_HOME ?? path.join(homeDirectory, ".config"));
  return path.join(base, "Influx");
}

export const DESKTOP_FILES = ["main.js", "preload.js", "renderer.js"] as const;
