import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { Logger } from "@utils/Logger";
import {
  Components,
  findIcon,
  goToMessage,
  MessageRecord,
  nativeClasses,
  parseMessageJumpLink,
  React,
  RestClient,
  Stores,
} from "@webpack/common";
import type { FluxerMessage } from "@webpack/fluxer";
import type { Context } from "react";

import STYLES from "./styles.css" with { type: "text" };

const STYLE_ID = "influx-message-link-embeds";
const logger = new Logger("MessageLinkEmbeds");
const MESSAGE_LINK = /https?:\/\/[\w.:-]+\/channels\/(?:@me|\d+)\/\d+\/\d+/g;

const PREVIEW_BEHAVIOR = {
  isEditing: false,
  isHighlight: false,
  disableContextMenu: true,
  disableContextMenuTracking: true,
  contextMenuOpen: false,
};

const settings = definePluginSettings({
  maximumPreviews: {
    type: "number",
    description: "The most message links to preview in one message.",
    default: 3,
  },
});

interface MessageLink {
  url: string;
  scope: string;
  channelId: string;
  messageId: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; message: FluxerMessage }
  | { status: "error" };

const cache = new Map<string, Promise<LoadState>>();

function parseLinks(content: string): MessageLink[] {
  const parse = parseMessageJumpLink();
  const links = new Map<string, MessageLink>();
  if (!parse) return [];
  for (const [url] of content.matchAll(MESSAGE_LINK)) {
    const link = parse(url);
    if (link) links.set(link.messageId, { url, ...link });
  }
  return [...links.values()];
}

async function fetchLinkedMessage(channelId: string, messageId: string): Promise<LoadState> {
  const cached = Stores.Messages()?.getMessage(channelId, messageId);
  if (cached) return { status: "loaded", message: cached };

  const http = RestClient();
  const Record = MessageRecord();
  if (!http || !Record) return { status: "error" };
  try {
    const response = await http.get(`/channels/${channelId}/messages/${messageId}`);
    return response.ok
      ? { status: "loaded", message: new Record(response.body) }
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
    void pending.then((state) => state.status === "error" && cache.delete(key));
  }
  return pending;
}

function jumpTo(link: MessageLink): void {
  const navigation = Stores.Navigation();
  const goTo = goToMessage();
  if (goTo && Stores.Channels()?.getChannel(link.channelId)) {
    goTo(link.channelId, link.messageId);
  } else if (!navigation) {
    window.open(link.url, "_blank", "noopener");
  } else if (link.scope === "@me") {
    navigation.navigateToDM(link.channelId, link.messageId, "push");
  } else {
    navigation.navigateToGuild(link.scope, link.channelId, link.messageId, "push");
  }
}

let InPreview: Context<boolean> | undefined;
const getInPreview = () => (InPreview ??= React.createContext(false));

function LinkEmbed({ link }: { link: MessageLink }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let active = true;
    void loadLinkedMessage(link.channelId, link.messageId).then((loaded) => {
      if (active) setState(loaded);
    });
    return () => {
      active = false;
    };
  }, [link.channelId, link.messageId]);

  if (state.status === "loading") {
    return <Components.Spinner size="small" />;
  }

  if (state.status === "error") return <UnavailableCard link={link} />;

  const channel = Stores.Channels()?.getChannel(state.message.channelId);
  if (!channel) return null;
  const gate = Stores.MatureContentGate();
  if (!gate || gate.getGateReason({ channelId: channel.id, guildId: channel.guildId })) {
    return <UnavailableCard link={link} />;
  }

  const { Provider } = getInPreview();
  return (
    <div
      className={`influx-message-link-embed ${nativeClasses("MessageAttachments.module__forwardedContainer___")}`}
    >
      <div className={nativeClasses("MessageAttachments.module__forwardedBar___")} />
      <div className={nativeClasses("MessageAttachments.module__forwardedContent___")}>
        <Provider value={true}>
          <Components.Message
            channel={channel}
            message={state.message}
            previewContext="LIST_POPOUT"
            removeTopSpacing
            suppressMessageActions
            behaviorOverrides={PREVIEW_BEHAVIOR}
            onHeadingActivate={() => jumpTo(link)}
          />
        </Provider>
      </div>
    </div>
  );
}

function UnavailableCard({ link }: { link: MessageLink }) {
  const Icon = findIcon("WarningCircleIcon");
  return (
    <Components.EmbedCard
      splashURL={null}
      icon={
        <div className={nativeClasses("EmbedCard.module__iconCircleDisabled___")}>
          {Icon && <Icon className={nativeClasses("EmbedCard.module__iconError___")} />}
        </div>
      }
      title={
        <h3
          className={nativeClasses(
            "EmbedCard.module__title___",
            "EmbedCard.module__titleDanger___",
          )}
        >
          Message unavailable
        </h3>
      }
      subtitle={
        <span className={nativeClasses("EmbedCard.module__helpText___")}>
          It may have been deleted, or you can't see it.
        </span>
      }
      footer={
        <Components.Button variant="secondary" fitContainer small onClick={() => jumpTo(link)}>
          Jump to message
        </Components.Button>
      }
    />
  );
}

function LinkEmbeds({ links }: { links: MessageLink[] }) {
  if (React.useContext(getInPreview())) return null;
  return (
    <>
      {links.map((link) => (
        <LinkEmbed key={link.messageId} link={link} />
      ))}
    </>
  );
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
        match: /\i\.default\.renderEmbeds&&!(\i)\.suppressEmbeds&&/,
        replace: "$self.renderEmbeds($1),$&",
      },
    },
  ],

  renderEmbeds(message: { id: string; content?: string }) {
    if (!message.content?.includes("/channels/")) return null;
    const links = parseLinks(message.content)
      .filter((link) => link.messageId !== message.id)
      .slice(0, Math.max(0, settings.store.maximumPreviews));
    if (!links.length) return null;
    return (
      <Components.ErrorBoundary
        fallback={null}
        onError={(error: unknown) => logger.error("Failed to render", error)}
      >
        <LinkEmbeds links={links} />
      </Components.ErrorBoundary>
    );
  },

  start() {
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    disableStyle(STYLE_ID);
  },
});
