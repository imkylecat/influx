export const INFLUX_REPOSITORY = "imkylecat/influx";
export const RELEASES_URL = `https://github.com/${INFLUX_REPOSITORY}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${INFLUX_REPOSITORY}/releases/latest`;

export function compareVersions(first: string, second: string): number {
  const parse = (version: string) => {
    const [core, prerelease] = version.replace(/^v/, "").split("-", 2);
    return { parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease };
  };
  const left = parse(first);
  const right = parse(second);
  for (let index = 0; index < Math.max(left.parts.length, right.parts.length); index++) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === undefined) return 1;
  if (right.prerelease === undefined) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}
