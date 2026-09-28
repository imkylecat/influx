import type { MessageWire } from "@webpack/fluxer";

export interface PastEdit {
  content: string;
  timestamp: Date;
}

// What MessageLogger keeps on this device between restarts.
export interface SavedLogs {
  deleted: MessageWire[];
  edits: Array<[id: string, edits: readonly PastEdit[]]>;
}

// A page of messages as Fluxer loads it, newest first.
export interface LoadedWindow {
  channelId: string;
  messages: MessageWire[];
  isBefore?: boolean;
  isAfter?: boolean;
  hasMoreBefore?: boolean;
  hasMoreAfter?: boolean;
}

const PUBLIC_USER_FIELDS = [
  "id",
  "username",
  "discriminator",
  "global_name",
  "avatar",
  "avatar_color",
  "bot",
  "system",
  "flags",
];

// Your own user also holds private details, such as your email address, that logs shouldn't keep.
export const publicUser = <U extends object>(user: U): U =>
  Object.fromEntries(Object.entries(user).filter(([key]) => PUBLIC_USER_FIELDS.includes(key))) as U;

// IDs are numbers too large for JavaScript, so a longer one is a larger one.
export const compareIds = (a: string, b: string): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

export function readSavedLogs(value: unknown): SavedLogs {
  const { deleted, edits } = (value ?? {}) as Partial<SavedLogs>;
  return {
    deleted: Array.isArray(deleted)
      ? deleted.filter((wire) => typeof wire?.id === "string" && wire.author?.id != null)
      : [],
    edits: Array.isArray(edits)
      ? edits.filter(
          (entry) =>
            typeof entry?.[0] === "string" &&
            Array.isArray(entry[1]) &&
            entry[1].every(
              (edit) => typeof edit?.content === "string" && edit.timestamp instanceof Date,
            ),
        )
      : [],
  };
}

// Adds a channel's saved deleted messages to the page they were in.
// A page that ends where more messages follow leaves the ones past its end to the next page.
export function mergeDeleted(
  window: LoadedWindow,
  saved: MessageWire[],
  onScreen: { oldest?: string; newest?: string },
): MessageWire[] {
  const { messages } = window;
  const oldest = window.isAfter ? onScreen.newest : messages.at(-1)?.id;
  const newest = window.isBefore ? onScreen.oldest : messages[0]?.id;
  const bounded = {
    before: window.isAfter || window.hasMoreBefore,
    after: window.isBefore || window.hasMoreAfter,
  };
  if ((bounded.before && oldest == null) || (bounded.after && newest == null)) return messages;

  const loaded = new Set(messages.map((message) => message.id));
  const restored = saved.filter(
    ({ id }) =>
      !loaded.has(id) &&
      !(bounded.before && compareIds(id, oldest!) < 0) &&
      !(bounded.after && compareIds(id, newest!) > 0),
  );
  if (!restored.length) return messages;
  return [...messages, ...restored].sort((a, b) => compareIds(b.id, a.id));
}
