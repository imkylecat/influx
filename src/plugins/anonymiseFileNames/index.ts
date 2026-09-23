import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";

const SPOILER_PREFIX = "SPOILER_";
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const settings = definePluginSettings({
  method: {
    type: "select",
    description: "What to rename uploaded files to.",
    options: [
      { label: "Random characters", value: "random" },
      { label: "Upload timestamp", value: "timestamp" },
      { label: "Fixed name", value: "fixed" },
    ],
    default: "random",
  },
  randomLength: {
    type: "number",
    description: "How many characters a random name has.",
    default: 8,
  },
  fixedName: {
    type: "string",
    description: "The name used by the fixed name option.",
    default: "image",
  },
});

function randomName(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}

function baseName(index: number): string {
  switch (settings.store.method) {
    case "timestamp":
      return `${Date.now()}${index || ""}`;
    case "fixed":
      return settings.store.fixedName.trim() || "file";
    default:
      return randomName(Math.min(64, Math.max(1, Math.floor(settings.store.randomLength) || 8)));
  }
}

export function anonymiseName(name: string, base: string): string {
  const spoiler = name.startsWith(SPOILER_PREFIX) ? SPOILER_PREFIX : "";
  const rest = name.slice(spoiler.length);
  // Keep compound extensions like .tar.gz, but not a dotted name like "my.holiday.photo.png".
  const match = /(\.tar)?\.[A-Za-z0-9]{1,10}$/.exec(rest);
  return spoiler + base + (match?.[0] ?? "");
}

export default definePlugin({
  name: "AnonymiseFileNames",
  description: "Renames files you upload so their original names aren't shared.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: /addFiles\(\i,\i\)\{return \i\(function\*/,
      replacement: {
        match: /addFiles\((\i),(\i)\)\{return \i\(function\*\(\)\{if\(0===\2\.length\)return\[\];/,
        replace: "$&$2=$self.anonymise($2);",
      },
    },
  ],

  anonymise(files: File[]): File[] {
    try {
      return files.map((file, i) => {
        const name = anonymiseName(file.name, baseName(i));
        return name === file.name
          ? file
          : new File([file], name, { type: file.type, lastModified: file.lastModified });
      });
    } catch (error) {
      console.error("[Influx] AnonymiseFileNames failed, uploading with original names", error);
      return files;
    }
  },
});
