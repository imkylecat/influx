import { compareVersions, LATEST_RELEASE_API, RELEASES_URL } from "./version";

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface Release {
  version: string;
  url: string;
  assets: Record<string, string>;
}

export class NoReleaseError extends Error {
  constructor() {
    super(`No Influx release has been published yet (${RELEASES_URL})`);
  }
}

export const USER_AGENT = "Influx-Updater";

export async function fetchLatestRelease(fetchImplementation: Fetch = fetch): Promise<Release> {
  const response = await fetchImplementation(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
  });
  if (response.status === 404) throw new NoReleaseError();
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for the latest release`);
  const release = (await response.json()) as {
    tag_name: string;
    html_url: string;
    assets: Array<{ name: string; browser_download_url: string }>;
  };
  return {
    version: release.tag_name.replace(/^v/, ""),
    url: release.html_url,
    assets: Object.fromEntries(
      release.assets.map((asset) => [asset.name, asset.browser_download_url]),
    ),
  };
}

type ReleaseCheck =
  | { ok: true; release: Release; available: boolean }
  | { ok: false; error: string };

export async function checkLatestRelease(
  installedVersion: string,
  fetchImplementation: Fetch = fetch,
): Promise<ReleaseCheck> {
  try {
    const release = await fetchLatestRelease(fetchImplementation);
    return {
      ok: true,
      release,
      available: compareVersions(release.version, installedVersion) > 0,
    };
  } catch (error) {
    const message =
      error instanceof NoReleaseError
        ? error.message
        : `Couldn't check for updates: ${String(error)}`;
    return { ok: false, error: message };
  }
}
