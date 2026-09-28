import { onGatewayEvents } from "@api/Gateway";
import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { idListIncludes } from "@utils/idList";
import { Logger } from "@utils/Logger";
import { showNotification, showToast, Stores } from "@webpack/common";
import type { FluxerMessage, MessageWire } from "@webpack/fluxer";

const MAXIMUM_BODY_LENGTH = 200;
const logger = new Logger("KeywordNotify");

const settings = definePluginSettings({
  keywords: {
    type: "string",
    description:
      "Words or phrases to watch for, separated by commas. Wrap one in slashes to use a regular expression, for example /colou?r/.",
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
  ignoreUsers: {
    type: "string",
    description: "Ignore messages from these user IDs, separated by commas or spaces.",
    default: "",
  },
  ignoreChannels: {
    type: "string",
    description: "Ignore messages in these channel IDs, separated by commas or spaces.",
    default: "",
  },
  ignoreServers: {
    type: "string",
    description: "Ignore messages in these server IDs, separated by commas or spaces.",
    default: "",
  },
});

let compiled: { source: string; patterns: RegExp[] } | undefined;

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
        const text = RegExp.escape(keyword);
        list.push(
          new RegExp(wholeWords ? `(?<![\\p{L}\\p{N}_])${text}(?![\\p{L}\\p{N}_])` : text, flags),
        );
      }
    } catch {
      logger.warn(`Ignored an invalid pattern: ${keyword}`);
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

function isIgnored(
  author: { id: string; bot?: boolean },
  channelId: string,
  guildId: string | null | undefined,
): boolean {
  if (author.id === Stores.Users()?.currentUserId) return true;
  const { ignoreBots, ignoreUsers, ignoreChannels, ignoreServers } = settings.store;
  if (ignoreBots && author.bot) return true;
  if (idListIncludes(ignoreUsers, author.id) || idListIncludes(ignoreChannels, channelId)) {
    return true;
  }
  if (!ignoreServers) return false;
  return idListIncludes(
    ignoreServers,
    guildId ?? Stores.Channels()?.getChannel(channelId)?.guildId,
  );
}

// Fluxer already notifies for mentions, so don't send a second one.
function mentionsMe(message: MessageWire): boolean {
  const me = Stores.Users()?.currentUserId;
  return Boolean(message.mention_everyone || message.mentions?.some((user) => user.id === me));
}

// Like Fluxer's own notifications, skip the channel you're already reading.
function isViewing(message: MessageWire): boolean {
  return document.hasFocus() && location.pathname.split("/")[3] === message.channel_id;
}

function notify(message: MessageWire): void {
  const name = message.member?.nick || message.author.global_name || message.author.username;
  const channel = Stores.Channels()?.getChannel(message.channel_id);
  const guild = message.guild_id ? Stores.Guilds()?.getGuild(message.guild_id) : undefined;
  const where = channel?.name ? ` (#${channel.name}${guild ? `, ${guild.name}` : ""})` : "";
  const content = message.content ?? "";
  const body =
    content.length > MAXIMUM_BODY_LENGTH ? `${content.slice(0, MAXIMUM_BODY_LENGTH)}…` : content;
  const url = `/channels/${message.guild_id ?? "@me"}/${message.channel_id}/${message.id}`;

  if (!showNotification({ title: `${name}${where}`, body, url })) {
    showToast("info", `${name}${where}: ${body}`, { timeout: 10_000 });
  }
}

function onMessageCreate(message: MessageWire): void {
  // Fluxer already notifies for every DM and group DM message by default.
  if (!settings.store.notify || !message.guild_id) return;
  if (isIgnored(message.author, message.channel_id, message.guild_id)) return;
  if (mentionsMe(message) || isViewing(message) || !matchesKeywords(message.content)) return;
  notify(message);
}

let stopListening: (() => void) | undefined;

export default definePlugin({
  name: "KeywordNotify",
  description:
    "Notifies you when a message contains words you choose, and highlights those messages in chat.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      // The message row's class list: match keyword hits with Fluxer's mention highlight.
      find: '"channel.message.article.alt-click"',
      replacement: {
        match: /(!\i&&)(\i)\.isMentioned\(\)(&&\i\.\i)/,
        replace: "$1($2.isMentioned()||$self.isHighlighted($2))$3",
      },
    },
  ],

  isHighlighted(message: FluxerMessage): boolean {
    return (
      settings.store.highlight &&
      !isIgnored(message.author, message.channelId, message.guildId) &&
      matchesKeywords(message.content)
    );
  },

  start() {
    stopListening = onGatewayEvents(this.name, { MESSAGE_CREATE: onMessageCreate });
  },

  stop() {
    stopListening?.();
  },
});
