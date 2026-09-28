import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type Fetch, type Release, USER_AGENT } from "./github";

export const DESKTOP_ASSETS = {
  "main.js": "influx-main.js",
  "preload.js": "influx-preload.js",
  "renderer.js": "influx-renderer.js",
} as const;
const CHECKSUMS_ASSET = "SHA256SUMS";

export function parseChecksums(text: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match) checksums.set(match[2].trim(), match[1].toLowerCase());
  }
  return checksums;
}

async function download(fetchImplementation: Fetch, url: string): Promise<Buffer> {
  const response = await fetchImplementation(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadDesktopRelease(
  release: Release,
  fetchImplementation: Fetch = fetch,
): Promise<Map<string, Buffer>> {
  const checksumsUrl = release.assets[CHECKSUMS_ASSET];
  if (!checksumsUrl) throw new Error(`Release ${release.version} has no ${CHECKSUMS_ASSET}`);
  const checksums = parseChecksums(
    (await download(fetchImplementation, checksumsUrl)).toString("utf8"),
  );

  const files = new Map<string, Buffer>();
  for (const [localName, assetName] of Object.entries(DESKTOP_ASSETS)) {
    const url = release.assets[assetName];
    if (!url) throw new Error(`Release ${release.version} is missing ${assetName}`);
    const data = await download(fetchImplementation, url);
    const expected = checksums.get(assetName);
    const actual = createHash("sha256").update(data).digest("hex");
    if (!expected || expected !== actual)
      throw new Error(`Checksum mismatch for ${assetName}; not installing`);
    files.set(localName, data);
  }
  return files;
}

export function installFiles(directory: string, files: Map<string, Buffer>): void {
  mkdirSync(directory, { recursive: true });
  const staged: Array<[string, string]> = [];
  for (const [name, data] of files) {
    const temporaryPath = path.join(directory, `.${name}.${process.pid}.tmp`);
    writeFileSync(temporaryPath, data);
    staged.push([temporaryPath, path.join(directory, name)]);
  }
  for (const [temporaryPath, target] of staged) renameSync(temporaryPath, target);
}
