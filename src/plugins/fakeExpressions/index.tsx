import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Logger } from "@utils/Logger";
import {
  checkEmojiAvailability,
  checkStickerAvailability,
  Components,
  Modals,
  React,
  Stores,
} from "@webpack/common";
import type { FluxerChannel, FluxerEmoji, FluxerSticker } from "@webpack/fluxer";

const logger = new Logger("FakeExpressions");

const EMBED_LINKS = 1n << 14n;
const EMOJI_SIZES = [32, 48, 56, 64, 96, 128, 160, 256, 512];
const STICKER_SIZES = [128, 160, 256, 320, 512];
const EMOJI_MARKDOWN = /(?<!\\)<a?:(?:\w+):(\d+)>/gi;
const HYPERLINK = /\[.+?\]\((https?:\/\/.+?)\)/;
const HYPERLINK_ONLY = new RegExp(`^${HYPERLINK.source}$`);
const LINK_TARGET = /https?:\/\/[^\s)]+/;
const REACTION_PICKER_RENDER_MILLISECONDS = 1_000;
const AVAILABLE = { canUse: true, isLockedByPremium: false, isLockedByPermission: false };
const NO_TRANSLATIONS = { _: () => "" };

const sizeOptions = (sizes: number[]) =>
  sizes.map((size) => ({ label: `${size}px`, value: String(size) }));

const settings = definePluginSettings({
  enableEmojiBypass: {
    type: "boolean",
    description:
      "Allows sending fake emojis (also bypasses missing permission to use custom emojis).",
    default: true,
  },
  emojiSize: {
    type: "select",
    description: "Size of the emojis when sending.",
    options: sizeOptions(EMOJI_SIZES),
    default: "48",
  },
  transformEmojis: {
    type: "boolean",
    description: "Whether to transform fake emojis into real ones.",
    default: true,
  },
  enableStickerBypass: {
    type: "boolean",
    description: "Allows sending fake stickers (also bypasses missing permission to use stickers).",
    default: true,
  },
  stickerSize: {
    type: "select",
    description: "Size of the stickers when sending.",
    options: sizeOptions(STICKER_SIZES),
    default: "160",
  },
  transformStickers: {
    type: "boolean",
    description: "Whether to transform fake stickers into real ones.",
    default: true,
  },
  transformCompoundSentence: {
    type: "boolean",
    description:
      "Whether to transform fake stickers and emojis in compound sentences (sentences with more content than just the fake emoji or sticker link).",
    default: false,
  },
  useHyperLinks: {
    type: "boolean",
    description: "Whether to use hyperlinks when sending fake emojis and stickers.",
    default: true,
  },
  hyperLinkText: {
    type: "string",
    description:
      "What text the hyperlink should use. {{NAME}} will be replaced with the emoji/sticker name.",
    default: "{{NAME}}",
  },
  disableEmbedPermissionCheck: {
    type: "boolean",
    description:
      "Whether to disable the embed permission check when sending fake emojis and stickers.",
    default: false,
  },
});

interface MessageSticker {
  id: string;
  name: string;
  animated: boolean;
  fake?: boolean;
}

interface OutgoingMessage {
  content: string;
  stickers?: MessageSticker[];
}

interface RenderedMessage {
  content: string;
  stickers?: readonly MessageSticker[];
}

interface MarkdownNode {
  type: string;
  url?: string;
  [key: string]: unknown;
}

interface ParseResult {
  nodes: MarkdownNode[];
}

interface FakeExpression {
  kind: "emoji" | "sticker";
  id: string;
  name: string | null;
  animated: boolean;
}

let nativeChecks = 0;
let reactionPickers = 0;
let reactionPickerRenderedAt = 0;

function withNativeRules<T>(check: () => T): T {
  nativeChecks++;
  try {
    return check();
  } finally {
    nativeChecks--;
  }
}

const reactionPickerOpen = () =>
  reactionPickers > 0 ||
  Date.now() - reactionPickerRenderedAt < REACTION_PICKER_RENDER_MILLISECONDS;

function canUseEmoji(emoji: FluxerEmoji, channel: FluxerChannel | null): boolean {
  const check = checkEmojiAvailability();
  return !check || withNativeRules(() => check(NO_TRANSLATIONS, emoji, channel, null).canUse);
}

function canUseSticker(sticker: FluxerSticker, channel: FluxerChannel | null): boolean {
  const check = checkStickerAvailability();
  return !check || withNativeRules(() => check(NO_TRANSLATIONS, sticker, channel).canUse);
}

function canEmbedLinks(channel: FluxerChannel | null): boolean {
  if (!channel || channel.isPrivate()) return true;
  return Stores.Permission()?.can(EMBED_LINKS, channel) ?? true;
}

const wordBoundary = (text: string, offset: number) =>
  !text[offset] || /\s/.test(text[offset]) ? "" : " ";

function fakeLink(
  path: "emojis" | "stickers",
  expression: { id?: string; name: string; animated?: boolean },
  size: string,
): string {
  const url = new URL(`${Stores.RuntimeConfig()!.mediaEndpoint}/${path}/${expression.id}.webp`);
  url.searchParams.set("size", size);
  if (expression.animated) url.searchParams.set("animated", "true");
  url.searchParams.set("name", expression.name);
  if (!settings.store.useHyperLinks) return url.toString();
  return `[${settings.store.hyperLinkText.replaceAll("{{NAME}}", expression.name)}](${url})`;
}

export function parseFakeExpression(target: string): FakeExpression | null {
  const mediaEndpoint = Stores.RuntimeConfig()?.mediaEndpoint;
  if (!mediaEndpoint || !URL.canParse(target)) return null;
  const url = new URL(target);
  if (url.origin !== new URL(mediaEndpoint).origin) return null;
  const match = /^\/(emojis|stickers)\/(\d+)\.\w+$/.exec(url.pathname);
  if (!match) return null;
  return {
    kind: match[1] === "emojis" ? "emoji" : "sticker",
    id: match[2],
    name: url.searchParams.get("name"),
    animated: url.searchParams.get("animated") === "true",
  };
}

function replaceEmojis(content: string, channel: FluxerChannel | null): string {
  return content.replace(
    EMOJI_MARKDOWN,
    (emojiString: string, emojiId: string, offset: number, original: string) => {
      const emoji = Stores.Emojis()?.getEmojiById(emojiId);
      if (!emoji || canUseEmoji(emoji, channel)) return emojiString;
      const link = fakeLink("emojis", emoji, settings.store.emojiSize);
      return `${wordBoundary(original, offset - 1)}${link}${wordBoundary(original, offset + emojiString.length)}`;
    },
  );
}

function CannotEmbedNotice({ resolve }: { resolve: (send: boolean) => void }) {
  React.useEffect(() => () => resolve(false), [resolve]);
  const ConfirmModal = Components.ConfirmModal()!;
  const Checkbox = Components.Checkbox();
  return (
    <ConfirmModal
      title="Hold on!"
      description="This message has a fake emoji or sticker, but you can't embed links in this channel. It will appear as a link only. Send it anyway?"
      primaryText="Send anyway"
      secondaryText="Cancel"
      checkboxContent={Checkbox && <Checkbox>Don't ask me again</Checkbox>}
      onPrimary={(dontAskAgain?: boolean) => {
        if (dontAskAgain) settings.store.disableEmbedPermissionCheck = true;
        resolve(true);
      }}
    />
  );
}

function confirmWithoutEmbeds(channel: FluxerChannel | null): Promise<boolean> {
  const modals = Modals();
  if (
    settings.store.disableEmbedPermissionCheck ||
    canEmbedLinks(channel) ||
    !modals ||
    !Components.ConfirmModal()
  ) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    modals.push(modals.modal(() => <CannotEmbedNotice resolve={resolve} />));
  });
}

const transformed = new WeakMap<ParseResult, { key: string; result: ParseResult }>();

export default definePlugin({
  name: "FakeExpressions",
  description:
    "Lets you use emojis and stickers from other servers without Plutonium, by sending them as image links.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: "isLockedByPermission:!0",
      replacement: [
        {
          match:
            /function \i\(\i,\i,(\i),(\i)\)\{(?:var \i;)?(?=if\(!\i\.guildId\)return\{canUse:!0)/,
          replace: "$&if($self.bypassEmoji($1,$2))return $self.AVAILABLE;",
        },
        {
          match: /function \i\(\i,\i,\i\)\{(?=if\(!\i\.guildId\)return\{canUse:!0)/,
          replace: "$&if($self.bypassSticker())return $self.AVAILABLE;",
        },
      ],
    },
    {
      find: '"emoji.emoji-picker-popout.expression-picker-popout"',
      replacement: {
        match: /\(\{channelId:\i,handleSelect:\i,onClose:\i\}\)=>\{/,
        replace: "$&$self.useReactionPicker();",
      },
    },
    {
      find: /getQuickReactionEmojis\(\i,\i\)\{/,
      replacement: {
        match: /(getQuickReactionEmojis\(\i,\i\)\{.+?)(\(0,\i\.\i\)\(\i\.\i,\i,\i\))(?=\.canUse)/,
        replace: "$1$self.withNativeRules(()=>$2)",
      },
    },
    {
      find: "Enqueueing message for channel",
      replacement: [
        {
          match: /(?=if\(!(\i\.\i)\.consumeLocalSendReservation\((\i),(\i)\.nonce\)\))/,
          replace:
            "if(!(yield $self.preSend($2,$3))){$1.rejectLocalRateLimitedSend($2,$3.nonce,$3.hasAttachments);return null;}",
        },
        {
          match:
            /function \i\((\i),\i,(\i),\i,\i,\i\)\{return \i\(function\*\(\)\{(?=var \i,\i;\i\.debug\(`Editing message )/,
          replace: "$&if(($2=yield $self.preEdit($1,$2))===!1)return null;",
        },
      ],
    },
    {
      find: /\.parse\(\);return \i\.set\(\i,\i\),\i\}/,
      replacement: {
        match: /function (\i)\((\{content:\i,context:\i\})\)\{/,
        replace:
          "function $1(influxOptions){return $self.transformParseResult(influxParse(influxOptions))}function influxParse($2){",
      },
    },
    {
      find: '"channel.message-attachments.stickers-container"',
      replacement: [
        {
          match:
            /(\i)\.stickers&&\1\.stickers\.length>0&&(\(0,\i\.jsx\)\("div",\{className:\i\.\i,"data-flx":"channel\.message-attachments\.stickers-container",children:)\1\.stickers\.map\(/,
          replace: "$self.withFakeStickers($1).length>0&&$2$self.withFakeStickers($1).map(",
        },
        {
          match:
            /(\i)\.embeds\.map\(\((\i),\i\)=>\{(?=let \i=`[^`]+`;return\(0,\i\.jsx\)\(\i,\{[^{}]*?"data-flx":"channel\.message-attachments\.embed"\})/,
          replace: "$&if($self.shouldIgnoreEmbed($2,$1))return null;",
        },
      ],
    },
    {
      find: '"channel.message-attachments.sticker-item.expression-info-card"',
      replacement: {
        match:
          /expressionId:(\i)\.id,(?=[^{}]*?"data-flx":"channel\.message-attachments\.sticker-item\.expression-info-card")/,
        replace: "$&influxFake:$1.fake,",
      },
    },
    {
      find: '"messaging.markdown.renderers.emoji-renderer.expression-info-card.custom"',
      replacement: {
        match:
          /expressionId:(?=[^{}]*?"data-flx":"messaging\.markdown\.renderers\.emoji-renderer\.expression-info-card\.custom")/,
        replace: "influxFake:arguments[0].node.fake,$&",
      },
    },
    {
      find: '"expressions.expression-info-card.description"',
      replacement: {
        match:
          /("default_emoji"===(\i)\.kind\?null:\2\.expressionId.+?"data-flx":"expressions\.expression-info-card\.description",children:)(.+?)(?=\}\)\]\}\)\]\}\))/,
        replace: "$1$self.addFakeNotice($3,$2)",
      },
    },
  ],

  AVAILABLE,
  withNativeRules,

  bypassEmoji(channel: FluxerChannel | null, guildId: string | null): boolean {
    return (
      settings.store.enableEmojiBypass &&
      nativeChecks === 0 &&
      (channel != null || guildId != null) &&
      !reactionPickerOpen()
    );
  },

  bypassSticker(): boolean {
    return settings.store.enableStickerBypass && nativeChecks === 0;
  },

  useReactionPicker(): void {
    const mounted = React.useRef(false);
    if (!mounted.current) reactionPickerRenderedAt = Date.now();
    React.useLayoutEffect(() => {
      mounted.current = true;
      reactionPickers++;
      return () => {
        reactionPickers--;
      };
    }, []);
  },

  async preSend(channelId: string, message: OutgoingMessage): Promise<boolean> {
    try {
      const channel = Stores.Channels()?.getChannel(channelId) ?? null;
      const { content } = message;

      if (settings.store.enableStickerBypass && message.stickers?.length) {
        message.stickers = message.stickers.filter((item) => {
          const sticker = Stores.Stickers()?.getStickerById(item.id);
          if (!sticker || canUseSticker(sticker, channel)) return true;
          const link = fakeLink("stickers", sticker, settings.store.stickerSize);
          message.content += `${wordBoundary(message.content, message.content.length - 1)}${link}`;
          return false;
        });
      }
      if (settings.store.enableEmojiBypass) {
        message.content = replaceEmojis(message.content, channel);
      }
      return message.content === content || (await confirmWithoutEmbeds(channel));
    } catch (error) {
      logger.error("Couldn't prepare a message", error);
      return true;
    }
  },

  async preEdit(
    channelId: string,
    content: string | undefined,
  ): Promise<string | false | undefined> {
    try {
      if (!content || !settings.store.enableEmojiBypass) return content;
      const channel = Stores.Channels()?.getChannel(channelId) ?? null;
      const replaced = replaceEmojis(content, channel);
      return replaced === content || (await confirmWithoutEmbeds(channel)) ? replaced : false;
    } catch (error) {
      logger.error("Couldn't prepare an edit", error);
      return content;
    }
  },

  transformParseResult(parsed: ParseResult): ParseResult {
    const { transformEmojis, transformStickers, transformCompoundSentence } = settings.store;
    const key = `${transformEmojis}${transformStickers}${transformCompoundSentence}`;
    const cached = transformed.get(parsed);
    if (cached?.key === key) return cached.result;

    let result = parsed;
    try {
      if (transformCompoundSentence || parsed.nodes.length <= 1) {
        let changed = false;
        const nodes: MarkdownNode[] = [];
        for (const node of parsed.nodes) {
          const fake = node.type === "Link" && node.url ? parseFakeExpression(node.url) : null;
          if (fake?.kind === "sticker" && transformStickers) {
            changed = true;
          } else if (fake?.kind === "emoji" && transformEmojis) {
            changed = true;
            const name = Stores.Emojis()?.getEmojiById(fake.id)?.name ?? fake.name ?? "FakeEmoji";
            nodes.push({
              type: "Emoji",
              kind: { kind: "Custom", name, id: fake.id, animated: fake.animated },
              fake: true,
            });
          } else {
            nodes.push(node);
          }
        }
        if (changed) result = { ...parsed, nodes };
      }
    } catch (error) {
      logger.error("Couldn't transform a message", error);
    }
    transformed.set(parsed, { key, result });
    return result;
  },

  withFakeStickers(message: RenderedMessage): readonly MessageSticker[] {
    const stickers = message.stickers ?? [];
    if (!settings.store.transformStickers) return stickers;
    try {
      const { transformCompoundSentence } = settings.store;
      const contentItems = message.content.split(/\s/);
      const items: string[] = [];
      if (transformCompoundSentence) items.push(...contentItems);
      else if (contentItems.length === 1) items.push(contentItems[0]);
      else if (HYPERLINK_ONLY.test(message.content)) items.push(message.content);

      const fakeStickers: MessageSticker[] = [];
      for (const item of items) {
        if (!transformCompoundSentence && !item.startsWith("http") && !HYPERLINK.test(item)) {
          continue;
        }
        const target = LINK_TARGET.exec(item)?.[0];
        const fake = target ? parseFakeExpression(target) : null;
        if (fake?.kind !== "sticker") continue;
        const sticker = Stores.Stickers()?.getStickerById(fake.id);
        fakeStickers.push({
          id: fake.id,
          name: sticker?.name ?? fake.name ?? "FakeSticker",
          animated: sticker?.animated ?? fake.animated,
          fake: true,
        });
      }
      return fakeStickers.length > 0 ? [...stickers, ...fakeStickers] : stickers;
    } catch (error) {
      logger.error("Couldn't find fake stickers", error);
      return stickers;
    }
  },

  shouldIgnoreEmbed(embed: { type?: string; url?: string }, message: RenderedMessage): boolean {
    try {
      const { transformEmojis, transformStickers, transformCompoundSentence } = settings.store;
      const contentItems = message.content.split(/\s/);
      if (
        contentItems.length > 1 &&
        !transformCompoundSentence &&
        !HYPERLINK_ONLY.test(message.content)
      ) {
        return false;
      }
      if (embed.type !== "image" || !embed.url) return false;
      const fake = parseFakeExpression(embed.url);
      if (!fake) return false;
      return fake.kind === "emoji" ? transformEmojis : transformStickers;
    } catch (error) {
      logger.error("Couldn't check an embed", error);
      return false;
    }
  },

  addFakeNotice(description: string, card: { kind: string; influxFake?: boolean }): string {
    if (!card.influxFake) return description;
    return `${description} This is a fake ${card.kind} and looks like a real ${card.kind} only for you. People without the plugin see a link.`;
  },
});
