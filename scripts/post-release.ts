// Posts a release and its changelog to a Fluxer webhook.
// Usage: FLUXER_WEBHOOK_URL=... bun scripts/post-release.ts <version> <release url>
import { readFileSync } from "node:fs";
import path from "node:path";
import { changelogSection, toEmbedMarkdown } from "../src/shared/changelog";

const EMBED_DESCRIPTION_MAX_LENGTH = 4096;
const INFLUX_PURPLE = 0x7b5cff;

const webhookUrl = process.env.FLUXER_WEBHOOK_URL;
const version = process.argv[2]?.replace(/^v/, "");
const releaseUrl = process.argv[3];

if (!webhookUrl) {
  console.log("FLUXER_WEBHOOK_URL isn't set; not posting the release to Fluxer.");
  process.exit(0);
}
if (!version || !releaseUrl) {
  console.error("Usage: bun scripts/post-release.ts <version> <release url>");
  process.exit(1);
}

const changelog = readFileSync(path.join(import.meta.dir, "..", "CHANGELOG.md"), "utf8");
const section = changelogSection(changelog, version) ?? "See the release for details.";

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    embeds: [
      {
        title: `Influx ${version}`,
        url: releaseUrl,
        color: INFLUX_PURPLE,
        description: toEmbedMarkdown(section, EMBED_DESCRIPTION_MAX_LENGTH, releaseUrl),
      },
    ],
    allowed_mentions: { parse: [] },
  }),
});

if (!response.ok) {
  console.error(`Fluxer returned ${response.status}: ${await response.text()}`);
  process.exit(1);
}
console.log(`Posted Influx ${version} to Fluxer.`);
