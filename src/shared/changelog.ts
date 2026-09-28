// Reads CHANGELOG.md, which follows https://keepachangelog.com.

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The body of a version's section, without its "## [x.y.z] - date" heading. */
export function changelogSection(changelog: string, version: string): string | null {
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\][^\\n]*\\n`, "m").exec(changelog);
  if (!heading) return null;
  const rest = changelog.slice(heading.index + heading[0].length);
  // The section ends at the next version heading or the link references at the bottom.
  const end = rest.search(/^## |^\[[^\]]+\]: /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim() || null;
}

/** Chat markdown keeps every newline, so rejoin wrapped bullets and show "### Added" as a bold label. */
export function toEmbedMarkdown(section: string, maximumLength: number, moreUrl: string): string {
  const text = section
    .replace(/\n {2,}(?=\S)/g, " ")
    .replace(/^### (.+)$/gm, "**$1**")
    .replace(/\n{3,}/g, "\n\n");
  if (text.length <= maximumLength) return text;
  const more = `\n\n… [Read the full changelog](${moreUrl})`;
  const cut = text.lastIndexOf("\n", maximumLength - more.length);
  return text.slice(0, cut > 0 ? cut : maximumLength - more.length) + more;
}
