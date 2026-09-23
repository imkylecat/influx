import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { Stores } from "@webpack/common";
import type { ComponentType } from "react";

// Fluxer only defines flag bits up to 1 << 13, so this one is free for marking deleted messages.
// Changing flags also makes Message.equals() see a difference, which rerenders the row.
const DELETED_FLAG = 1 << 30;
const MAX_EDITED_MESSAGES = 2000;
const STYLE_ID = "influx-message-logger";

const STYLES = `
[data-influx-deleted] {
  background: color-mix(in srgb, var(--status-danger) 8%, transparent);
}
[data-influx-deleted] [data-search-highlight-scope="message"] {
  color: var(--status-danger);
}
[data-influx-deleted] [data-flx$="message-attachments"] {
  opacity: 0.6;
}
.influx-ml-edit {
  opacity: 0.6;
}
.influx-ml-edit-label {
  font-size: 0.625rem;
  color: var(--text-chat-muted);
  user-select: none;
}
`;

const settings = definePluginSettings({
  logDeletes: {
    type: "boolean",
    description: "Keep deleted messages in chat, highlighted in red.",
    default: true,
  },
  logEdits: {
    type: "boolean",
    description: "Show earlier versions of edited messages above the current text.",
    default: true,
  },
  ignoreSelf: {
    type: "boolean",
    description: "Don't log your own messages.",
    default: true,
  },
  ignoreBots: {
    type: "boolean",
    description: "Don't log messages from bots.",
    default: false,
  },
});

interface Message {
  id: string;
  content: string;
  flags: number;
  state: string;
  timestamp: Date;
  editedTimestamp: Date | null;
  author: { id: string; bot?: boolean };
  withUpdates(updates: { flags: number }): Message;
}

interface ChannelMessages {
  get(id: string): Message | undefined;
  update(id: string, updater: (message: Message) => Message): ChannelMessages;
  removeIds(ids: string[]): ChannelMessages;
}

interface MessagesStore {
  commitMessages(messages: ChannelMessages): void;
  notifyChange(): void;
}

interface PastEdit {
  content: string;
  timestamp: Date;
}

const editHistory = new Map<string, PastEdit[]>();

function isIgnored(message: Message): boolean {
  if (message.state === "SENDING" || message.state === "FAILED") return true;
  if (settings.store.ignoreBots && message.author.bot) return true;
  return settings.store.ignoreSelf && message.author.id === Stores.Users()?.currentUserId;
}

export default definePlugin({
  name: "MessageLogger",
  description: "Keeps deleted messages visible and shows the edit history of messages.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: /handleMessageDeleteBulk\(\i\)\{let \i=\i\.\i\.get\(/,
      replacement: [
        {
          match: /handleMessageDelete\((\i)\)\{let (\i)=\i\.\i\.get\(\1\.channelId\);/,
          replace: "$&if($self.keepDeleted(this,$2,[$1.id]))return!0;",
        },
        {
          match: /handleMessageDeleteBulk\((\i)\)\{let (\i)=\i\.\i\.get\(\1\.channelId\);/,
          replace: "$&if($self.keepDeleted(this,$2,$1.ids))return!0;",
        },
        {
          match:
            /handleMessageUpdate\((\i)\)\{let \i=\1\.message\.id,\i=\1\.message\.channel_id,(\i)=\i\.\i\.get\(\i\);/,
          replace: "$&$self.recordEdit($2,$1.message);",
        },
      ],
    },
    {
      find: '"data-flx-edited":',
      replacement: {
        match: /"data-flx-edited":null!=(\i)\.editedTimestamp\?"true":void 0,/,
        replace: '$&"data-influx-deleted":$self.isDeleted($1)?"true":void 0,',
      },
    },
    {
      find: '"channel.user-message.render-message-content.safe-markdown"',
      replacement: {
        match:
          /\(0,\i\.jsx\)\((\i\.\i),\{content:(\i)\.content,options:(\i),"data-flx":"channel\.user-message\.render-message-content\.safe-markdown"\}\)/,
        replace: "$self.renderEdits($2,$1,$3),$&",
      },
    },
    {
      find: '"channel.user-message.safe-markdown--2"',
      replacement: {
        match:
          /!(\i)&&(\(0,\i\.jsx\)\((\i\.\i),\{content:(\i)\.content,options:(\i),"data-flx":"channel\.user-message\.safe-markdown--2"\}\))/,
        replace: "!$1&&$self.renderEdits($4,$3,$5),!$1&&$2",
      },
    },
  ],

  keepDeleted(store: MessagesStore, messages: ChannelMessages | undefined, ids: string[]): boolean {
    if (!settings.store.logDeletes || !messages) return false;
    try {
      let next = messages;
      const dropped: string[] = [];
      let kept = 0;
      for (const id of ids) {
        const message = next.get(id);
        if (!message) continue;
        if (isIgnored(message)) {
          dropped.push(id);
          continue;
        }
        kept++;
        if (!this.isDeleted(message)) {
          next = next.update(id, (m) => m.withUpdates({ flags: m.flags | DELETED_FLAG }));
        }
      }
      if (kept === 0) return false;
      if (dropped.length) next = next.removeIds(dropped);
      store.commitMessages(next);
      store.notifyChange();
      return true;
    } catch (error) {
      console.error("[Influx] MessageLogger failed to keep a deleted message", error);
      return false;
    }
  },

  recordEdit(messages: ChannelMessages | undefined, update: { id: string; content?: string }) {
    if (!settings.store.logEdits || update.content == null) return;
    const message = messages?.get(update.id);
    if (!message || message.content === update.content || isIgnored(message)) return;

    const edits = editHistory.get(message.id) ?? [];
    edits.push({
      content: message.content,
      timestamp: message.editedTimestamp ?? message.timestamp,
    });
    editHistory.delete(message.id);
    editHistory.set(message.id, edits);
    if (editHistory.size > MAX_EDITED_MESSAGES) {
      editHistory.delete(editHistory.keys().next().value!);
    }
  },

  isDeleted(message: Message | undefined): boolean {
    return message != null && (message.flags & DELETED_FLAG) !== 0;
  },

  renderEdits(message: Message, Markdown: ComponentType<any>, options: unknown) {
    const edits = settings.store.logEdits ? editHistory.get(message.id) : undefined;
    if (!edits?.length) return null;
    return (
      <div className="influx-ml-edits">
        {edits.map((edit, i) => (
          <div key={i} className="influx-ml-edit">
            <Markdown content={edit.content} options={options} />
            <span className="influx-ml-edit-label" title={edit.timestamp.toLocaleString()}>
              {" "}
              (past edit)
            </span>
          </div>
        ))}
      </div>
    );
  },

  start() {
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    disableStyle(STYLE_ID);
  },
});
