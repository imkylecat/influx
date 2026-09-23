import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LATEST_RELEASE_API, RELEASES_URL } from "./version";

export { compareVersions } from "./version";

export const DESKTOP_ASSETS = {
  "main.js": "influx-main.js",
  "preload.js": "influx-preload.js",
  "renderer.js": "influx-renderer.js",
} as const;
const CHECKSUMS_ASSET = "SHA256SUMS";

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface ReleaseInfo {
  version: string;
  url: string;
  notes: string;
  assets: Record<string, string>;
}

export class NoReleaseError extends Error {
  constructor() {
    super(`No Influx release has been published yet (${RELEASES_URL})`);
  }
}

const HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "Influx-Updater" };

export async function fetchLatestRelease(fetchImpl: Fetch = fetch): Promise<ReleaseInfo> {
  const response = await fetchImpl(LATEST_RELEASE_API, { headers: HEADERS });
  if (response.status === 404) throw new NoReleaseError();
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for the latest release`);
  const release = (await response.json()) as {
    tag_name: string;
    html_url: string;
    body: string | null;
    assets: Array<{ name: string; browser_download_url: string }>;
  };
  return {
    version: release.tag_name.replace(/^v/, ""),
    url: release.html_url,
    notes: release.body ?? "",
    assets: Object.fromEntries(
      release.assets.map((asset) => [asset.name, asset.browser_download_url]),
    ),
  };
}

export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

async function download(fetchImpl: Fetch, url: string): Promise<Buffer> {
  const response = await fetchImpl(url, { headers: { "User-Agent": HEADERS["User-Agent"] } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadDesktopRelease(
  release: ReleaseInfo,
  fetchImpl: Fetch = fetch,
): Promise<Map<string, Buffer>> {
  const checksumsUrl = release.assets[CHECKSUMS_ASSET];
  if (!checksumsUrl) throw new Error(`Release ${release.version} has no ${CHECKSUMS_ASSET}`);
  const checksums = parseChecksums((await download(fetchImpl, checksumsUrl)).toString("utf8"));

  const files = new Map<string, Buffer>();
  for (const [localName, assetName] of Object.entries(DESKTOP_ASSETS)) {
    const url = release.assets[assetName];
    if (!url) throw new Error(`Release ${release.version} is missing ${assetName}`);
    const data = await download(fetchImpl, url);
    const expected = checksums.get(assetName);
    const actual = createHash("sha256").update(data).digest("hex");
    if (!expected || expected !== actual)
      throw new Error(`Checksum mismatch for ${assetName}; not installing`);
    files.set(localName, data);
  }
  return files;
}

export function installFiles(dir: string, files: Map<string, Buffer>): void {
  mkdirSync(dir, { recursive: true });
  const staged: Array<[string, string]> = [];
  for (const [name, data] of files) {
    const temp = path.join(dir, `.${name}.${process.pid}.tmp`);
    writeFileSync(temp, data);
    staged.push([temp, path.join(dir, name)]);
  }
  for (const [temp, target] of staged) renameSync(temp, target);
}
