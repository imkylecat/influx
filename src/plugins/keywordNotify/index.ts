import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { NativeNotification, showToast, Stores } from "@webpack/common";

const MAX_BODY_LENGTH = 200;

const settings = definePluginSettings({
  keywords: {
    type: "string",
    description:
      "Words or phrases to watch for, separated by commas. Wrap one in slashes to use a regular expression, e.g. /colou?r/.",
    default: "",
  },
  wholeWords: {
    type: "boolean",
    description: 'Only match whole words, so "cat" doesn\'t match "category".',
    default: true,
  },
  caseSensitive: {
    type: "boolean",
    description: "Match upper and lower case exactly.",
    default: false,
  },
  highlight: {
    type: "boolean",
    description: "Highlight matching messages in chat the way mentions are highlighted.",
    default: true,
  },
  notify: {
    type: "boolean",
    description:
      "Send a notification for new matching messages in servers. In servers over 250 members, Fluxer only sends new messages for the server you have open.",
    default: true,
  },
  ignoreBots: {
    type: "boolean",
    description: "Ignore messages from bots.",
    default: true,
  },
});

interface WireMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  flags?: number;
  mention_everyone?: boolean;
  mentions?: Array<{ id: string }>;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  member?: { nick?: string | null };
}

interface RenderedMessage {
  content?: string;
  author?: { id: string; bot?: boolean };
}

type GatewayHandler = (data: any, context: unknown) => void;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let compiled: { source: string; patterns: RegExp[] } | undefined;

// Rebuilt only when the keyword settings change.
function patterns(): RegExp[] {
  const { keywords, wholeWords, caseSensitive } = settings.store;
  const source = `${keywords}\0${wholeWords}\0${caseSensitive}`;
  if (compiled?.source === source) return compiled.patterns;

  const flags = caseSensitive ? "u" : "iu";
  const list: RegExp[] = [];
  for (const raw of keywords.split(",")) {
    const keyword = raw.trim();
    if (!keyword) continue;
    const regex = /^\/(.+)\/([a-z]*)$/.exec(keyword);
    try {
      if (regex) {
        list.push(new RegExp(regex[1], regex[2] || flags));
      } else {
        const text = escapeRegExp(keyword);
        list.push(
          new RegExp(wholeWords ? `(?<![\\p{L}\\p{N}_])${text}(?![\\p{L}\\p{N}_])` : text, flags),
        );
      }
    } catch {
      console.warn(`[Influx] KeywordNotify ignored an invalid pattern: ${keyword}`);
    }
  }
  compiled = { source, patterns: list };
  return list;
}

export function matchesKeywords(content: string | undefined): boolean {
  if (!content) return false;
  return patterns().some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

function isFromIgnored(author: { id: string; bot?: boolean } | undefined): boolean {
  if (!author) return true;
  if (author.id === Stores.Users()?.currentUserId) return true;
  return settings.store.ignoreBots && Boolean(author.bot);
}

// Fluxer already notifies for mentions, so don't send a second one.
function mentionsMe(message: WireMessage): boolean {
  const me = Stores.Users()?.currentUserId;
  return Boolean(message.mention_everyone || message.mentions?.some((user) => user.id === me));
}

// Like Fluxer's own notifications, skip the channel you're already reading.
function isViewing(message: WireMessage): boolean {
  return document.hasFocus() && location.pathname.split("/")[3] === message.channel_id;
}

function notify(message: WireMessage): void {
  const name = message.member?.nick || message.author.global_name || message.author.username;
  const channel = Stores.Channels()?.getChannel(message.channel_id);
  const guild = message.guild_id ? Stores.Guilds()?.getGuild(message.guild_id) : undefined;
  const where = channel?.name ? ` (#${channel.name}${guild ? `, ${guild.name}` : ""})` : "";
  const content = message.content ?? "";
  const body = content.length > MAX_BODY_LENGTH ? `${content.slice(0, MAX_BODY_LENGTH)}…` : content;
  const url = `/channels/${message.guild_id ?? "@me"}/${message.channel_id}/${message.id}`;

  const showNotification = NativeNotification();
  if (showNotification) {
    void showNotification({ title: `${name}${where}`, body, url }).catch((error) =>
      console.error("[Influx] KeywordNotify couldn't show a notification", error),
    );
  } else {
    showToast("info", `${name}${where}: ${body}`, { timeout: 10_000 });
  }
}

function onMessageCreate(message: WireMessage): void {
  // Fluxer already notifies for every DM and group DM message by default.
  if (!settings.store.notify || !message.guild_id || isFromIgnored(message.author)) return;
  if (mentionsMe(message) || isViewing(message) || !matchesKeywords(message.content)) return;
  notify(message);
}

export default definePlugin({
  name: "KeywordNotify",
  description:
    "Notifies you when a message contains words you choose, and highlights those messages in chat.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"SESSIONS_REPLACE"',
      replacement: {
        match: /(\i)\.set\("SESSIONS_REPLACE",\(\)=>\{\}\)/,
        replace: "$&,$self.wrapGatewayHandlers($1)",
      },
    },
    {
      // The message row's class list: match keyword hits with Fluxer's mention highlight.
      find: '"channel.message.article.alt-click"',
      replacement: {
        match: /(!\i&&)(\i)\.isMentioned\(\)(&&\i\.\i)/,
        replace: "$1($2.isMentioned()||$self.isHighlighted($2))$3",
      },
    },
  ],

  isHighlighted(message: RenderedMessage): boolean {
    try {
      return (
        settings.store.highlight &&
        !isFromIgnored(message.author) &&
        matchesKeywords(message.content)
      );
    } catch {
      return false;
    }
  },

  wrapGatewayHandlers(registry: Map<string, GatewayHandler>): void {
    const original = registry.get("MESSAGE_CREATE");
    if (!original) return;
    registry.set("MESSAGE_CREATE", (data, context) => {
      try {
        onMessageCreate(data);
      } catch (error) {
        console.error("[Influx] KeywordNotify failed on MESSAGE_CREATE", error);
      }
      original(data, context);
    });
  },
});
