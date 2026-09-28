import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { nativeClasses, NicknameLookup, React, Stores } from "@webpack/common";
import type { FluxerMessage, FluxerUser } from "@webpack/fluxer";

const logger = new Logger("ShowMeYourName");

const settings = definePluginSettings({
  format: {
    type: "select",
    description: "What to show next to the name.",
    options: [
      { label: "Username", value: "username" },
      { label: "Username and discriminator (name#1234)", value: "tag" },
    ],
    default: "username",
  },
  hideWhenSame: {
    type: "boolean",
    description: "Don't repeat the username when it matches the display name.",
    default: true,
  },
});

// Fluxer's own streamer-mode truncation: keep the first character.
const truncate = (name: string) => `${Array.from(name.trim())[0] ?? ""}…`;

function label(author: FluxerUser): string {
  const { username, discriminator } = author;
  const hasDiscriminator = discriminator && discriminator !== "0";
  return settings.store.format === "tag" && hasDiscriminator
    ? (author.tag ?? `${username}#${discriminator}`)
    : username;
}

export default definePlugin({
  name: "ShowMeYourName",
  description: "Shows usernames next to display names and nicknames in chat.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"channel.user-message.message-username--2"',
      replacement: {
        // Cozy headers (normal, attachment-only, and bot) and the compact author prefix.
        match:
          /(\(0,\i\.jsx\)\(\i,\{user:(\i),message:(\i),guild:\i,member:[^}]{0,300}?"data-flx":"channel\.(?:user-message|compact-message-layout\.compact-author-prefix)\.message-username(?:--\d)?"\}\))/g,
        replace: "$1,$self.renderUsername($2,$3)",
      },
    },
  ],

  renderUsername(author: FluxerUser | undefined, message: FluxerMessage | undefined) {
    try {
      // A webhook's "username" is just its display name.
      if (!author?.username || message?.webhookId != null) return null;
      if (settings.store.hideWhenSame) {
        const shown = NicknameLookup()?.(author, undefined, message?.channelId) ?? author.username;
        if (shown.toLowerCase() === author.username.toLowerCase()) return null;
      }
      const text = label(author);
      return (
        <span className={nativeClasses("Message.module__messageTimestamp___")}>
          ({Stores.StreamerMode()?.shouldTruncateUsernames ? truncate(text) : text})
        </span>
      );
    } catch (error) {
      logger.error("Failed to render", error);
      return null;
    }
  },
});
