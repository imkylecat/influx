import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { findByCode } from "@webpack/finders";
import { MarkdownComponent, React, RestClient, Stores } from "@webpack/common";
import type { ReactNode } from "react";

const STYLE_ID = "influx-message-link-embeds";
// Matches Fluxer's own jump links, e.g. https://web.fluxer.app/channels/@me/<channel>/<message>.
const MESSAGE_LINK = /https?:\/\/([\w.-]+)\/channels\/(@me|\d+)\/(\d+)\/(\d+)/g;

const STYLES = `
.influx-mle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 520px;
  margin-top: 4px;
  padding: 8px 12px;
  border-left: 4px solid var(--background-modifier-accent, var(--text-chat-muted));
  border-radius: 4px;
  background: var(--background-secondary, var(--background-tertiary));
}
.influx-mle-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 0.8125rem;
}
.influx-mle-avatar {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
}
.influx-mle-author {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}
.influx-mle-meta {
  overflow: hidden;
  color: var(--text-chat-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.influx-mle-jump {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-link, var(--text-primary));
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.influx-mle-jump:hover {
  text-decoration: underline;
}
.influx-mle-content {
  max-height: 12em;
  overflow: hidden;
  color: var(--text-primary);
}
.influx-mle-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  object-fit: contain;
  align-self: flex-start;
}
.influx-mle-note {
  color: var(--text-chat-muted);
  font-size: 0.8125rem;
}
`;

const settings = definePluginSettings({
  maxEmbeds: {
    type: "number",
    description: "The most message links to preview in one message.",
    default: 3,
  },
  showImages: {
    type: "boolean",
    description: "Show the first image attached to the linked message.",
    default: true,
  },
});

interface MessageLink {
  url: string;
  guildId: string;
  channelId: string;
  messageId: string;
}

interface LinkedMessage {
  channelId: string;
  author: { id: string; name: string; avatar: string | null };
  content: string;
  timestamp: Date;
  attachmentCount: number;
  image?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; message: LinkedMessage }
  | { status: "error" };

interface WireAttachment {
  url?: string;
  proxy_url?: string;
  content_type?: string;
  width?: number;
}

const cache = new Map<string, Promise<LoadState>>();

function parseLinks(content: string): MessageLink[] {
  const links = new Map<string, MessageLink>();
  for (const [url, host, guildId, channelId, messageId] of content.matchAll(MESSAGE_LINK)) {
    if (host !== location.host && !/(^|\.)fluxer\.app$/.test(host)) continue;
    links.set(messageId, { url, guildId, channelId, messageId });
  }
  return [...links.values()];
}

function firstImage(attachments: readonly WireAttachment[] | undefined): string | undefined {
  const image = attachments?.find((a) => a.content_type?.startsWith("image/") || a.width);
  return image?.proxy_url ?? image?.url;
}

function fromStore(message: any): LinkedMessage {
  return {
    channelId: message.channelId,
    author: {
      id: message.author.id,
      name: message.author.displayName ?? message.author.username,
      avatar: message.author.avatar,
    },
    content: message.content ?? "",
    timestamp: message.timestamp,
    attachmentCount: message.attachments?.length ?? 0,
    image: firstImage(message.attachments),
  };
}

function fromWire(message: any): LinkedMessage {
  return {
    channelId: message.channel_id,
    author: {
      id: message.author.id,
      name: message.author.global_name || message.author.username,
      avatar: message.author.avatar ?? null,
    },
    content: message.content ?? "",
    timestamp: new Date(message.timestamp),
    attachmentCount: message.attachments?.length ?? 0,
    image: firstImage(message.attachments),
  };
}

async function fetchLinkedMessage(channelId: string, messageId: string): Promise<LoadState> {
  const cached = Stores.Messages()?.getMessage(channelId, messageId);
  if (cached) return { status: "loaded", message: fromStore(cached) };

  const http = RestClient();
  if (!http) return { status: "error" };
  try {
    const response = await http.get(`/channels/${channelId}/messages/${messageId}`);
    return response.ok
      ? { status: "loaded", message: fromWire(response.body) }
      : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

function loadLinkedMessage(channelId: string, messageId: string): Promise<LoadState> {
  const key = `${channelId}/${messageId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchLinkedMessage(channelId, messageId);
    cache.set(key, pending);
    // Let failures retry the next time the message renders.
    void pending.then((state) => state.status === "error" && cache.delete(key));
  }
  return pending;
}

let avatarUrlFor: ((user: { id: string; avatar: string | null }) => string) | null | undefined;

function avatarUrl(author: LinkedMessage["author"]): string | undefined {
  avatarUrlFor ??=
    findByCode(/^function [\w$]+\(\{id:[\w$]+,avatar:[\w$]+\},[\w$]+=!1,[\w$]+=\d+\)\{if\(!/) ??
    null;
  try {
    return avatarUrlFor?.(author);
  } catch {
    return undefined;
  }
}

function describeChannel(link: MessageLink): string {
  const channel = Stores.Channels()?.getChannel(link.channelId);
  if (link.guildId === "@me") return channel?.name ? channel.name : "Direct Messages";
  const guild = Stores.Guilds()?.getGuild(link.guildId);
  const channelName = channel?.name ? `#${channel.name}` : "a channel";
  return guild ? `${channelName} in ${guild.name}` : channelName;
}

function jumpTo(link: MessageLink): void {
  const navigation = Stores.Navigation();
  if (!navigation) {
    window.open(link.url, "_blank", "noopener");
  } else if (link.guildId === "@me") {
    navigation.navigateToDM(link.channelId, link.messageId, "push");
  } else {
    navigation.navigateToGuild(link.guildId, link.channelId, link.messageId, "push");
  }
}

function LinkEmbed({ link }: { link: MessageLink }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let active = true;
    void loadLinkedMessage(link.channelId, link.messageId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [link.channelId, link.messageId]);

  if (state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <div className="influx-mle">
        <span className="influx-mle-note">
          Couldn't load the linked message. It may have been deleted, or you can't see it.
        </span>
      </div>
    );
  }

  const { message } = state;
  const Markdown = MarkdownComponent();
  const avatar = avatarUrl(message.author);
  const extraAttachments = message.attachmentCount - (message.image ? 1 : 0);

  return (
    <div className="influx-mle">
      <div className="influx-mle-header">
        {avatar && <img className="influx-mle-avatar" src={avatar} alt="" />}
        <span className="influx-mle-author">{message.author.name}</span>
        <span className="influx-mle-meta">
          {describeChannel(link)} · {message.timestamp.toLocaleString()}
        </span>
        <button type="button" className="influx-mle-jump" onClick={() => jumpTo(link)}>
          Jump
        </button>
      </div>
      {message.content &&
        (Markdown ? (
          <div className="influx-mle-content">
            <Markdown
              content={message.content}
              options={{ context: 4, channelId: message.channelId, messageId: link.messageId }}
            />
          </div>
        ) : (
          <div className="influx-mle-content">{message.content}</div>
        ))}
      {settings.store.showImages && message.image && (
        <img className="influx-mle-image" src={message.image} alt="" loading="lazy" />
      )}
      {extraAttachments > 0 && (
        <span className="influx-mle-note">
          {extraAttachments} attachment{extraAttachments === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

let SafeBoundary: any;

function getBoundary() {
  SafeBoundary ??= class extends React.Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
      return { failed: true };
    }

    componentDidCatch(error: unknown) {
      console.error("[Influx] MessageLinkEmbeds failed to render", error);
    }

    render() {
      return this.state.failed ? null : this.props.children;
    }
  };
  return SafeBoundary;
}

export default definePlugin({
  name: "MessageLinkEmbeds",
  description: "Shows a preview of the message behind any Fluxer message link.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"channel.message-attachments.embed"',
      replacement: {
        match: /\i\.default\.getRenderEmbeds\(\)&&!(\i)\.suppressEmbeds&&/,
        replace: "$self.renderEmbeds($1),$&",
      },
    },
  ],

  renderEmbeds(message: { id: string; content?: string }) {
    if (!message.content?.includes("/channels/")) return null;
    const links = parseLinks(message.content)
      .filter((link) => link.messageId !== message.id)
      .slice(0, Math.max(0, settings.store.maxEmbeds));
    if (!links.length) return null;
    const Boundary = getBoundary();
    return (
      <Boundary>
        {links.map((link) => (
          <LinkEmbed key={link.messageId} link={link} />
        ))}
      </Boundary>
    );
  },

  start() {
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    disableStyle(STYLE_ID);
  },
});
