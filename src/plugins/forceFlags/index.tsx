import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, React, Stores } from "@webpack/common";
import type { FluxerGuild, FluxerUser } from "@webpack/fluxer";

const settings = definePluginSettings({
  userFlags: {
    type: "string",
    description:
      "User ID, then flags to add (+) or remove (-); separate users with ;. For example: 123456789: +STAFF -SPAMMER; 987654321: +PARTNER. Flags: STAFF, PARTNER, BUG_HUNTER, FRIENDLY_BOT, FRIENDLY_BOT_MANUAL_APPROVAL, SPAMMER, or a number.",
    default: "",
  },
  serverFeatures: {
    type: "string",
    description:
      "Server ID, then features to add (+) or remove (-); separate servers with ;. For example: 123456789: +VANITY_URL -DISCOVERABLE. Reload Fluxer to apply.",
    default: "",
  },
});

const USER_FLAGS: Record<string, number> = {
  STAFF: 1 << 0,
  PARTNER: 1 << 2,
  BUG_HUNTER: 1 << 3,
  FRIENDLY_BOT: 1 << 4,
  FRIENDLY_BOT_MANUAL_APPROVAL: 1 << 5,
  SPAMMER: 1 << 6,
};

const SERVER_FEATURES = [
  "ANIMATED_BANNER",
  "ANIMATED_ICON",
  "AUDIO_BITRATE_128_KBPS",
  "AUDIO_BITRATE_256_KBPS",
  "AUDIO_BITRATE_384_KBPS",
  "BANNER",
  "CLONE_EMOJI_DISABLED",
  "CLONE_EMOJI_ENABLED",
  "CLONE_STICKER_DISABLED",
  "CLONE_STICKER_ENABLED",
  "DETACHED_BANNER",
  "DISCOVERABLE",
  "EXPRESSION_PURGE_ALLOWED",
  "HIDE_OWNER_CROWN",
  "INVITES_DISABLED",
  "INVITE_SPLASH",
  "LARGE_GUILD_OVERRIDE",
  "MORE_EMOJI",
  "MORE_STICKERS",
  "PARTNERED",
  "RAID_DETECTED",
  "TEXT_CHANNEL_FLEXIBLE_NAMES",
  "UNAVAILABLE_FOR_EVERYONE",
  "UNAVAILABLE_FOR_EVERYONE_BUT_STAFF",
  "UNAVAILABLE_HIDDEN",
  "UNLIMITED_EMOJI",
  "UNLIMITED_STICKERS",
  "VANITY_URL",
  "VERIFIED",
  "VERY_LARGE_GUILD",
  "VIP_VOICE",
  "VISIONARY",
  "VOICE_E2EE",
];

// The user menus opened from DMs, servers, and group DMs.
const USER_MENUS = [
  "ui.action-menu.user-context-menu.render-advanced-menu-group",
  "ui.action-menu.guild-member-context-menu",
  "ui.action-menu.group-dm-context-menu.group-dm-member-context-menu",
];

interface Overrides {
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

export function toggleOverride(text: string, id: string, name: string, enabled: boolean): string {
  const overrides = parseOverrides(text);
  const target = overrides.get(id) ?? { add: [], remove: [] };
  if (target.add.includes(name) || target.remove.includes(name)) {
    target.add = target.add.filter((other) => other !== name);
    target.remove = target.remove.filter((other) => other !== name);
  } else {
    (enabled ? target.add : target.remove).push(name);
  }
  overrides.set(id, target);
  return [...overrides]
    .filter(([, { add, remove }]) => add.length || remove.length)
    .map(
      ([id, { add, remove }]) =>
        `${id}: ${[...add.map((name) => `+${name}`), ...remove.map((name) => `-${name}`)].join(" ")}`,
    )
    .join("; ");
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

function UserFlagItems({ user }: { user: FluxerUser }) {
  useSettings();
  const MenuItemCheckbox = Components.MenuItemCheckbox();
  if (!MenuItemCheckbox) return null;
  return Object.entries(USER_FLAGS).map(([name, bit]) => (
    <MenuItemCheckbox
      key={name}
      checked={(user.flags & bit) !== 0}
      onCheckedChange={(checked: boolean) => {
        settings.store.userFlags = toggleOverride(settings.store.userFlags, user.id, name, checked);
      }}
    >
      {name}
    </MenuItemCheckbox>
  ));
}

export default definePlugin({
  name: "ForceFlags",
  description:
    "Forces flags on or off for chosen users, and features on or off for chosen servers. Right-click a user or server to toggle them. Only changes what you see; Fluxer's server still uses the real values.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      // UserRecord. Its flags apply overrides when read, so every copy of a user stays current.
      find: "this.flags=e.flags,this.mentionFlags",
      replacement: [
        {
          match: /this\.flags=e\.flags,/,
          replace: "$self.defineFlags(this,e.flags),",
        },
        // Updated and serialized copies keep the real flags.
        {
          match: /(flags:null!=\((\i)=e\.flags\)\?\2:)this\.flags/,
          replace: "$1$self.realFlags.get(this)",
        },
        {
          match: /flags:this\.flags,mention_flags:/,
          replace: "flags:$self.realFlags.get(this),mention_flags:",
        },
      ],
    },
    {
      find: /this\.features=new Set\(\i\.features\)/,
      replacement: {
        match: /this\.features=new Set\((\i)\.features\)/,
        replace: "this.features=$self.serverFeatures($1.id,new Set($1.features))",
      },
    },
    ...USER_MENUS.map((menu) => ({
      find: `"${menu}.copy-user-id-menu-item"`,
      replacement: {
        match: new RegExp(
          String.raw`\{user:(\i),onClose:\i,"data-flx":"${menu.replaceAll(".", "\\.")}\.copy-user-id-menu-item"\}\)`,
        ),
        replace: "$&,$self.renderUserMenu($1)",
      },
    })),
    {
      find: '"ui.action-menu.guild-context-menu.mute-community-menu-item"',
      replacement: {
        match:
          /\{guild:(\i),onClose:\i,"data-flx":"ui\.action-menu\.guild-context-menu\.mute-community-menu-item"\}\)\}\)/,
        replace: "$&,$self.renderServerMenu($1)",
      },
    },
  ],

  realFlags: new WeakMap<object, number>(),

  defineFlags(user: { id: string }, flags: number) {
    this.realFlags.set(user, flags);
    Object.defineProperty(user, "flags", {
      configurable: true,
      enumerable: true,
      get: () => this.userFlags(user.id, flags),
    });
  },

  userFlags(id: string | undefined, flags: number) {
    const overrides = overridesFor(settings.store.userFlags, id);
    if (!overrides) return flags;
    let result = flags ?? 0;
    for (const name of overrides.add) result |= flagBit(name);
    for (const name of overrides.remove) result &= ~flagBit(name);
    return result;
  },

  serverFeatures(id: string | undefined, features: Set<string>) {
    const overrides = overridesFor(settings.store.serverFeatures, id);
    if (!overrides) return features;
    for (const name of overrides.add) features.add(name);
    for (const name of overrides.remove) features.delete(name);
    return features;
  },

  renderUserMenu(user: FluxerUser) {
    const MenuItemSubmenu = Components.MenuItemSubmenu();
    if (!MenuItemSubmenu || !Components.MenuItemCheckbox()) return null;
    return <MenuItemSubmenu label="Force flags" render={() => <UserFlagItems user={user} />} />;
  },

  renderServerMenu(guild: FluxerGuild) {
    const MenuGroup = Components.MenuGroup();
    const MenuItemSubmenu = Components.MenuItemSubmenu();
    const MenuItemCheckbox = Components.MenuItemCheckbox();
    if (!MenuGroup || !MenuItemSubmenu || !MenuItemCheckbox) return null;
    return (
      <MenuGroup>
        <MenuItemSubmenu
          label="Force features"
          render={() => {
            const current = Stores.Guilds()?.getGuild(guild.id) ?? guild;
            return [...new Set([...SERVER_FEATURES, ...current.features])].sort().map((name) => (
              <MenuItemCheckbox
                key={name}
                checked={current.features.has(name)}
                onCheckedChange={(checked: boolean) => {
                  settings.store.serverFeatures = toggleOverride(
                    settings.store.serverFeatures,
                    guild.id,
                    name,
                    checked,
                  );
                  // Records are rebuilt from the shown features, which include the old override.
                  const features = [...current.features].filter((other) => other !== name);
                  Stores.Guilds()?.handleGuildUpdate({
                    ...current.toJSON(),
                    features: checked ? [...features, name] : features,
                  });
                }}
              >
                {name}
              </MenuItemCheckbox>
            ));
          }}
        />
      </MenuGroup>
    );
  },
});
