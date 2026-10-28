export function changelogSection(changelog: string, version: string): string | null {
  const heading = new RegExp(`^## \\[${RegExp.escape(version)}\\][^\\n]*\\n`, "m").exec(changelog);
  if (!heading) return null;
  const rest = changelog.slice(heading.index + heading[0].length);
  const end = rest.search(/^## |^\[[^\]]+\]: /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim() || null;
}

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
