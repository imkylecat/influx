import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";

const settings = definePluginSettings({
  userFlags: {
    type: "string",
    description:
      "User ID, then flags to add (+) or remove (-); separate users with ;. For example: 123456789: +STAFF -SPAMMER; 987654321: +PARTNER. Flags: STAFF, PARTNER, BUG_HUNTER, FRIENDLY_BOT, FRIENDLY_BOT_MANUAL_APPROVAL, SPAMMER, or a number. Reload Fluxer to apply.",
    default: "",
  },
  guildFeatures: {
    type: "string",
    description:
      "Server ID, then features to add (+) or remove (-); separate servers with ;. For example: 123456789: +VANITY_URL -DISCOVERABLE. Reload Fluxer to apply.",
    default: "",
  },
});

// Fluxer's public user flags.
const USER_FLAGS: Record<string, number> = {
  STAFF: 1 << 0,
  PARTNER: 1 << 2,
  BUG_HUNTER: 1 << 3,
  FRIENDLY_BOT: 1 << 4,
  FRIENDLY_BOT_MANUAL_APPROVAL: 1 << 5,
  SPAMMER: 1 << 6,
};

export interface Overrides {
  add: string[];
  remove: string[];
}

/** Parses "id: +NAME -NAME; id: +NAME" into overrides per ID. */
export function parseOverrides(text: string): Map<string, Overrides> {
  const overrides = new Map<string, Overrides>();
  for (const entry of text.split(";")) {
    const match = /^\s*(\d+)\s*:(.*)$/.exec(entry);
    if (!match) continue;
    const [, id, rest] = match;
    const target = overrides.get(id) ?? { add: [], remove: [] };
    for (const token of rest.trim().split(/[\s,]+/)) {
      const name = token.slice(1).trim().toUpperCase();
      if (!name) continue;
      if (token[0] === "+") target.add.push(name);
      else if (token[0] === "-") target.remove.push(name);
    }
    overrides.set(id, target);
  }
  return overrides;
}

const cache = new Map<string, Map<string, Overrides>>();
function overridesFor(text: string, id: string | undefined) {
  if (!text || id == null) return undefined;
  let parsed = cache.get(text);
  if (!parsed) {
    cache.clear();
    cache.set(text, (parsed = parseOverrides(text)));
  }
  return parsed.get(String(id));
}

const flagBit = (name: string) => USER_FLAGS[name] ?? (/^\d+$/.test(name) ? Number(name) : 0);

export default definePlugin({
  name: "ForceFlags",
  description:
    "Forces flags on or off for chosen users, and features on or off for chosen servers. Only changes what your client shows; Fluxer's server still uses the real values.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      // UserRecord constructor.
      find: "this.flags=e.flags,this.mentionFlags",
      replacement: {
        match: /this\.flags=e\.flags,/,
        replace: "this.flags=$self.userFlags(e.id,e.flags),",
      },
    },
    {
      // GuildRecord constructor.
      find: "this.features=new Set(e.features)",
      replacement: {
        match: /this\.features=new Set\(e\.features\)/,
        replace: "this.features=$self.guildFeatures(e.id,new Set(e.features))",
      },
    },
  ],

  userFlags(id: string | undefined, flags: number) {
    try {
      const overrides = overridesFor(settings.store.userFlags, id);
      if (!overrides) return flags;
      let result = flags ?? 0;
      for (const name of overrides.add) result |= flagBit(name);
      for (const name of overrides.remove) result &= ~flagBit(name);
      return result;
    } catch {
      return flags;
    }
  },

  guildFeatures(id: string | undefined, features: Set<string>) {
    try {
      const overrides = overridesFor(settings.store.guildFeatures, id);
      if (!overrides) return features;
      for (const name of overrides.add) features.add(name);
      for (const name of overrides.remove) features.delete(name);
      return features;
    } catch {
      return features;
    }
  },
});
