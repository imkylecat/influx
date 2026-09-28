import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { idListIncludes } from "@utils/idList";
import { Logger } from "@utils/Logger";
import { Components, nativeClasses, React, Stores } from "@webpack/common";
import type { FluxerChannelMessages, FluxerMessage, FluxerMessagesStore } from "@webpack/fluxer";
import type { ComponentType } from "react";

// Fluxer only defines flag bits up to 1 << 13, so this one is free for marking deleted messages.
// Changing flags also makes Message.equals() see a difference, which rerenders the row.
const DELETED_FLAG = 1 << 30;
const MAXIMUM_EDITED_MESSAGES = 2000;
const STYLE_ID = "influx-message-logger";
const logger = new Logger("MessageLogger");

// Fluxer's message menu actions that still work once a message is gone from the server.
const DELETED_MESSAGE_ACTIONS = new Set([
  "view_reactions",
  "copy_message",
  "message_speak",
  "message_copy_id",
  "debug_message",
]);

const STYLES = `
[data-influx-deleted] {
  background: color-mix(in srgb, var(--status-danger) 8%, transparent);
}
[data-influx-deleted] [data-flx$="message-attachments"] {
  opacity: 0.6;
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
  ignoreUsers: {
    type: "string",
    description: "Don't log messages from these user IDs, separated by commas or spaces.",
    default: "",
  },
  ignoreChannels: {
    type: "string",
    description: "Don't log messages in these channel IDs, separated by commas or spaces.",
    default: "",
  },
  ignoreServers: {
    type: "string",
    description: "Don't log messages in these server IDs, separated by commas or spaces.",
    default: "",
  },
});

interface ActionGroup {
  items: { id?: string }[];
}

interface PastEdit {
  content: string;
  timestamp: Date;
}

// Each message's list is replaced rather than mutated, so rows can tell when theirs changed.
const editHistory = new Map<string, readonly PastEdit[]>();
const editListeners = new Set<() => void>();

function setEdits(id: string, edits: readonly PastEdit[]) {
  // Re-inserting keeps the map ordered from least to most recently edited.
  editHistory.delete(id);
  if (edits.length) editHistory.set(id, edits);
  if (editHistory.size > MAXIMUM_EDITED_MESSAGES) {
    editHistory.delete(editHistory.keys().next().value!);
  }
  for (const listener of editListeners) listener();
}

function subscribeToEdits(listener: () => void) {
  editListeners.add(listener);
  return () => editListeners.delete(listener);
}

function isIgnored(message: FluxerMessage): boolean {
  if (message.state === "SENDING" || message.state === "FAILED") return true;
  const { ignoreBots, ignoreSelf, ignoreUsers, ignoreChannels, ignoreServers } = settings.store;
  if (ignoreBots && message.author.bot) return true;
  if (ignoreSelf && message.author.id === Stores.Users()?.currentUserId) return true;
  if (
    idListIncludes(ignoreUsers, message.author.id) ||
    idListIncludes(ignoreChannels, message.channelId)
  ) {
    return true;
  }
  if (!ignoreServers) return false;
  const guildId = message.guildId ?? Stores.Channels()?.getChannel(message.channelId)?.guildId;
  return idListIncludes(ignoreServers, guildId);
}

function removeDeletedMessage(message: FluxerMessage) {
  const store = Stores.Messages();
  const messages = store?.getCachedMessages(message.channelId);
  if (!store || !messages?.get(message.id)) return;
  store.commitMessages(messages.removeIds([message.id]));
  store.notifyChange();
  if (editHistory.has(message.id)) setEdits(message.id, []);
}

function PastEdits({
  message,
  Markdown,
  options,
}: {
  message: FluxerMessage;
  Markdown: ComponentType<any>;
  options: unknown;
}) {
  const edits = React.useSyncExternalStore(subscribeToEdits, () => editHistory.get(message.id));
  if (!settings.store.logEdits || !edits?.length) return null;
  const Tooltip = Components.Tooltip();
  // Dimmed like a message that's still sending, with Fluxer's own "(edited)" label.
  const pastEditClass = nativeClasses("Message.module__messageSending___");
  const editedClass = nativeClasses("Message.module__editedTimestamp___");
  const editedLabelClass = nativeClasses("Message.module__editedLabel___");
  return (
    <>
      {edits.map((edit, index) => {
        const time = edit.timestamp.toLocaleString();
        const label = (
          <span className={editedClass} title={Tooltip ? undefined : time}>
            {" "}
            <span className={editedLabelClass}>(past edit)</span>
          </span>
        );
        return (
          <div key={index} className={pastEditClass}>
            <Markdown content={edit.content} options={options} />
            {Tooltip ? <Tooltip text={time}>{label}</Tooltip> : label}
          </div>
        );
      })}
    </>
  );
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
      // Your own edits show before the server confirms them, and are undone if saving fails.
      find: /handleMessageDeleteBulk\(\i\)\{let \i=\i\.\i\.get\(/,
      replacement: [
        {
          match:
            /handleOptimisticEdit\((\i)\)\{(?:var \i,\i;)?let\{channelId:\i,messageId:\i,content:\i\}=\1,(\i)=\i\.\i\.get\(\i\);/,
          replace: "$&$self.recordEdit($2,{id:$1.messageId,content:$1.content});",
        },
        {
          match: /handleEditRollback\((\i)\)\{/,
          replace: "$&$self.undoEdit($1.messageId,$1.originalContent);",
        },
      ],
    },
    {
      // The message row: tag deleted messages and give them Fluxer's failed-message red text.
      find: '"data-flx-edited":',
      replacement: {
        match:
          /("data-flx-edited":null!=(\i)\.editedTimestamp\?"true":void 0,)(.{0,1500}?className:)(\i),/,
        replace:
          '$1"data-influx-deleted":$self.isDeleted($2)?"true":void 0,$3$self.rowClass($4,$2),',
      },
    },
    {
      find: '"channel.user-message.render-message-content.safe-markdown"',
      replacement: {
        match:
          /\(0,(\i)\.jsx\)\((\i\.\i),\{content:(\i)\.content,options:(\i),"data-flx":"channel\.user-message\.render-message-content\.safe-markdown"\}\)/,
        replace: "(0,$1.jsx)($self.PastEdits,{message:$3,Markdown:$2,options:$4}),$&",
      },
    },
    {
      find: '"channel.user-message.safe-markdown--2"',
      replacement: {
        match:
          /!(\i)&&(\(0,(\i)\.jsx\)\((\i\.\i),\{content:(\i)\.content,options:(\i),"data-flx":"channel\.user-message\.safe-markdown--2"\}\))/,
        replace: "!$1&&(0,$3.jsx)($self.PastEdits,{message:$5,Markdown:$4,options:$6}),!$1&&$2",
      },
    },
    {
      // Deleted messages get the permissions of a read-only channel, so the hover bar and
      // message menu stop offering replies, reactions, edits, and pins the server would reject.
      find: '"channel.message-action-utils.request-message-pin.confirm-modal"',
      replacement: {
        match:
          /(let \i=!(\i)\.guildId,\i=\i\.\i\.isBlocked\((\i)\.author\.id\),\i=)(\(0,\i\.\i\)\(\2\))/,
        replace: "$1$self.isDeleted($3)||$4",
      },
    },
    {
      // The message menu's actions, some of which don't check those permissions.
      find: '"channel.message-action-menu.groups.report-message-icon"',
      replacement: {
        match:
          /(\(0,\i\.\i\)\((\i)\)&&(\i)\.push\(\{items:\[\{id:\i\.reportMessage,.{0,250}?\}\]\}\),)\3\}/,
        replace: "$1$self.filterActions($2,$3)}",
      },
    },
    {
      find: '"ui.action-menu.message-context-menu.render-danger-group.menu-group"',
      replacement: {
        match:
          /messageId:(\i)\.id,"data-flx":"ui\.action-menu\.message-context-menu\.render-danger-group\.remove-reactions-submenu".{0,400}?\]\}\):null,/,
        replace: "$&$self.renderMenuItems($1),",
      },
    },
  ],

  keepDeleted(
    store: FluxerMessagesStore,
    messages: FluxerChannelMessages | undefined,
    ids: string[],
  ): boolean {
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
          next = next.update(id, (current) =>
            current.withUpdates({ flags: current.flags | DELETED_FLAG }),
          );
        }
      }
      if (kept === 0) return false;
      if (dropped.length) next = next.removeIds(dropped);
      store.commitMessages(next);
      store.notifyChange();
      return true;
    } catch (error) {
      logger.error("Failed to keep a deleted message", error);
      return false;
    }
  },

  recordEdit(
    messages: FluxerChannelMessages | undefined,
    update: { id: string; content?: string },
  ) {
    if (!settings.store.logEdits || update.content == null) return;
    const message = messages?.get(update.id);
    // An EDITING message already shows your unconfirmed edit, which was recorded when you saved it.
    if (!message || message.state === "EDITING" || message.content === update.content) return;
    if (isIgnored(message)) return;
    setEdits(message.id, [
      ...(editHistory.get(message.id) ?? []),
      { content: message.content, timestamp: message.editedTimestamp ?? message.timestamp },
    ]);
  },

  undoEdit(id: string, restoredContent: string) {
    const edits = editHistory.get(id);
    if (edits?.at(-1)?.content === restoredContent) setEdits(id, edits.slice(0, -1));
  },

  isDeleted(message: FluxerMessage | undefined): boolean {
    return message != null && (message.flags & DELETED_FLAG) !== 0;
  },

  rowClass(className: string | undefined, message: FluxerMessage | undefined): string | undefined {
    if (!this.isDeleted(message)) return className;
    return [className, nativeClasses("Message.module__messageFailed___")].filter(Boolean).join(" ");
  },

  PastEdits,

  filterActions(message: FluxerMessage, groups: ActionGroup[]): ActionGroup[] {
    if (!this.isDeleted(message)) return groups;
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id && DELETED_MESSAGE_ACTIONS.has(item.id)),
    }));
  },

  renderMenuItems(message: FluxerMessage) {
    const MenuGroup = Components.MenuGroup();
    const MenuItem = Components.MenuItem();
    if (!MenuGroup || !MenuItem) return null;
    const deleted = this.isDeleted(message);
    const edited = settings.store.logEdits && editHistory.has(message.id);
    if (!deleted && !edited) return null;
    return (
      <MenuGroup>
        {edited && <MenuItem onClick={() => setEdits(message.id, [])}>Clear edit history</MenuItem>}
        {deleted && (
          <MenuItem danger onClick={() => removeDeletedMessage(message)}>
            Remove deleted message
          </MenuItem>
        )}
      </MenuGroup>
    );
  },

  start() {
    enableStyle(STYLE_ID, STYLES);
  },

  stop() {
    disableStyle(STYLE_ID);
  },
});
