export const INFLUX_REPOSITORY = "imkylecat/influx";
export const RELEASES_URL = `https://github.com/${INFLUX_REPOSITORY}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${INFLUX_REPOSITORY}/releases/latest`;

export function compareVersions(first: string, second: string): number {
  const parse = (version: string) =>
    version
      .replace(/^v/, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(first);
  const right = parse(second);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
