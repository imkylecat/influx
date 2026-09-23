import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import {
  Components,
  findIcon,
  MessageRecord,
  nativeClasses,
  React,
  RestClient,
  Stores,
} from "@webpack/common";
import type { Context, ReactNode } from "react";

const STYLE_ID = "influx-message-link-embeds";
// Matches Fluxer's own jump links, e.g. https://web.fluxer.app/channels/@me/<channel>/<message>.
const MESSAGE_LINK = /https?:\/\/([\w.-]+)\/channels\/(@me|\d+)\/(\d+)\/(\d+)/g;

// Fluxer's forwarded-message frame supplies the bar and spacing; this only caps the size.
const STYLES = `
.influx-mle {
  max-width: 520px;
  max-height: 20em;
  overflow: hidden;
}
`;

// Matches what Fluxer's confirm modal passes when it previews a message.
const PREVIEW_BEHAVIOR = {
  isEditing: false,
  isHighlight: false,
  disableContextMenu: true,
  disableContextMenuTracking: true,
  contextMenuOpen: false,
};

const settings = definePluginSettings({
  maxEmbeds: {
    type: "number",
    description: "The most message links to preview in one message.",
    default: 3,
  },
});

interface MessageLink {
  url: string;
  guildId: string;
  channelId: string;
  messageId: string;
}

type LoadState = { status: "loading" } | { status: "loaded"; message: any } | { status: "error" };

const cache = new Map<string, Promise<LoadState>>();

function parseLinks(content: string): MessageLink[] {
  const links = new Map<string, MessageLink>();
  for (const [url, host, guildId, channelId, messageId] of content.matchAll(MESSAGE_LINK)) {
    if (host !== location.host && !/(^|\.)fluxer\.app$/.test(host)) continue;
    links.set(messageId, { url, guildId, channelId, messageId });
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
    // Let failures retry the next time the message renders.
    void pending.then((state) => state.status === "error" && cache.delete(key));
  }
  return pending;
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

// Set inside a preview, so a linked message's own links don't preview again.
let InPreview: Context<boolean> | undefined;
const getInPreview = () => (InPreview ??= React.createContext(false));

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

  if (state.status === "loading") {
    const Spinner = Components.Spinner();
    return Spinner ? <Spinner size="small" /> : null;
  }

  if (state.status === "error") return <UnavailableCard link={link} />;

  const Message = Components.Message();
  const channel = Stores.Channels()?.getChannel(state.message.channelId);
  if (!Message || !channel) return null;

  const { Provider } = getInPreview();
  return (
    <div
      className={`influx-mle ${nativeClasses("MessageAttachments.module__forwardedContainer___")}`}
    >
      <div className={nativeClasses("MessageAttachments.module__forwardedBar___")} />
      <div className={nativeClasses("MessageAttachments.module__forwardedContent___")}>
        <Provider value={true}>
          <Message
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

const UNAVAILABLE_TITLE = "Message unavailable";
const UNAVAILABLE_DESCRIPTION = "It may have been deleted, or you can't see it.";

// Laid out like Fluxer's own card for an unavailable theme or invite.
function UnavailableCard({ link }: { link: MessageLink }) {
  const EmbedCard = Components.EmbedCard();
  const Button = Components.Button();
  const Icon = findIcon("WarningCircleIcon");
  if (!EmbedCard || !Button) {
    return (
      <span className={nativeClasses("EmbedCard.module__helpText___")}>
        {UNAVAILABLE_TITLE}. {UNAVAILABLE_DESCRIPTION}
      </span>
    );
  }
  return (
    <EmbedCard
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
          {UNAVAILABLE_TITLE}
        </h3>
      }
      subtitle={
        <span className={nativeClasses("EmbedCard.module__helpText___")}>
          {UNAVAILABLE_DESCRIPTION}
        </span>
      }
      footer={
        <Button variant="secondary" fitContainer small onClick={() => jumpTo(link)}>
          Jump to message
        </Button>
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
        <LinkEmbeds links={links} />
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
