import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import {
  Components,
  fetchUserProfile,
  nativeClasses,
  React,
  reaction,
  Stores,
} from "@webpack/common";
import type { FluxerMessage } from "@webpack/fluxer";

const settings = definePluginSettings({
  pronounsFormat: {
    type: "select",
    description: "The format for pronouns to appear in chat.",
    options: [
      { label: "Lowercase", value: "lowercase" },
      { label: "Capitalized", value: "capitalized" },
    ],
    default: "lowercase",
  },
  showSelf: {
    type: "boolean",
    description: "Enable or disable showing pronouns for yourself.",
    default: true,
  },
});

interface Entry {
  userId: string;
  guildId?: string;
  pronouns: string | null;
  time: number;
}

const REFRESH_MILLISECONDS = 60 * 60_000;
const MAXIMUM_REQUESTS = 4;

const known = new Map<string, Entry>();
const queued = new Set<string>();
const waiting: Array<() => Promise<unknown>> = [];
let running = 0;

const keyOf = (userId: string, guildId?: string) => `${userId}:${guildId ?? "@me"}`;

function remember(userId: string, guildId: string | undefined, pronouns: string | null): void {
  known.set(keyOf(userId, guildId), { userId, guildId, pronouns, time: Date.now() });
}

function pronounsOf(userId: string, guildId?: string): string | null | undefined {
  const profile = Stores.UserProfile()?.getProfile(userId, guildId);
  if (profile) {
    const pronouns = profile.guildMemberProfile?.pronouns || profile.userProfile.pronouns;
    remember(userId, guildId, pronouns || null);
  }
  return known.get(keyOf(userId, guildId))?.pronouns;
}

async function load(userId: string, guildId?: string, force?: boolean): Promise<void> {
  try {
    await fetchUserProfile()?.(userId, guildId, force);
    pronounsOf(userId, guildId);
  } catch (error) {
    const { status } = error as { status?: number };
    if (status === 403 || status === 404) remember(userId, guildId, null);
  }
}

function runWaiting(): void {
  while (running < MAXIMUM_REQUESTS && waiting.length > 0) {
    running++;
    void waiting.shift()!().finally(() => {
      running--;
      runWaiting();
    });
  }
}

function request(userId: string, guildId?: string, force?: boolean): void {
  const key = keyOf(userId, guildId);
  const entry = known.get(key);
  const fresh = !force && entry && Date.now() - entry.time < REFRESH_MILLISECONDS;
  if (fresh || queued.has(key)) return;
  queued.add(key);
  waiting.push(() => load(userId, guildId, force).finally(() => queued.delete(key)));
  runWaiting();
}

function Pronouns({ message }: { message: FluxerMessage }) {
  useSettings();
  const { author } = message;
  const guildId = message.guildId ?? Stores.Channels()?.getChannel(message.channelId)?.guildId;
  const subscribe = React.useCallback(
    (onChange: () => void) =>
      reaction()?.(() => pronounsOf(author.id, guildId), onChange) ?? (() => {}),
    [author.id, guildId],
  );
  const pronouns = React.useSyncExternalStore(subscribe, () => pronounsOf(author.id, guildId));
  const shown =
    !author.bot &&
    !author.system &&
    message.webhookId == null &&
    (settings.store.showSelf || author.id !== Stores.Users()?.currentUserId);
  React.useEffect(() => {
    if (shown) request(author.id, guildId);
  }, [shown, author.id, guildId]);

  const text = pronouns?.trim().replace(/\n+/g, "");
  if (!shown || !text) return null;
  const label = (
    <span className={nativeClasses("Message.module__messageTimestamp___")}>
      • {settings.store.pronounsFormat === "lowercase" ? text.toLowerCase() : text}
    </span>
  );
  const Tooltip = Components.Tooltip();
  return Tooltip ? <Tooltip text="Pronouns">{label}</Tooltip> : label;
}

export default definePlugin({
  name: "UserMessagesPronouns",
  description: "Shows people's pronouns next to their messages in chat.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"channel.user-message.message-timestamp--2"',
      replacement: {
        match:
          /\(0,(\i)\.jsxs\)\(\i(?:\.\i)?,\{date:(\i)\.timestamp,className:\i\.\i,"data-flx":"channel\.user-message\.message-timestamp--\d",children:\[[^\]]+\]\}\)/g,
        replace: "$&,(0,$1.jsx)($self.Pronouns,{message:$2})",
      },
    },
    {
      find: '"channel.compact-message-layout.compact-author-prefix.copy-only--2"',
      replacement: {
        match:
          /\(0,(\i)\.jsxs\)\("span",\{className:\i\.\i,"data-flx":"channel\.compact-message-layout\.compact-author-prefix\.copy-only--2"/,
        replace: "(0,$1.jsx)($self.Pronouns,{message:arguments[0].message}),$&",
      },
    },
    {
      find: '"Attempted to set invalid profile:"',
      replacement: [
        {
          match: /handleProfileInvalidate\((\i),\i\)\{/,
          replace: "$&$self.refreshProfiles($1);",
        },
        {
          match: /handleProfilesClear\(\)\{/,
          replace: "$&$self.refreshProfiles();",
        },
      ],
    },
  ],

  Pronouns,

  refreshProfiles(userId = Stores.Users()?.currentUserId) {
    for (const entry of known.values()) {
      if (entry.userId === userId) request(entry.userId, entry.guildId, true);
    }
  },

  stop() {
    known.clear();
    queued.clear();
    waiting.length = 0;
  },
});
