// Fluxer's records, stores, and gateway payloads, as far as Influx relies on them.

export interface FluxerUser {
  id: string;
  username: string;
  discriminator?: string;
  tag?: string;
  bot?: boolean;
  flags: number;
}

export interface FluxerChannel {
  name?: string;
  guildId?: string;
}

export interface FluxerGuild {
  id: string;
  name: string;
  features: ReadonlySet<string>;
  toJSON(): object;
}

export interface FluxerMessage {
  id: string;
  channelId: string;
  guildId?: string | null;
  webhookId?: string | null;
  author: FluxerUser;
  content: string;
  flags: number;
  state: string;
  timestamp: Date;
  editedTimestamp: Date | null;
  blocked?: boolean;
  referencedMessage?: FluxerMessage | null;
  withUpdates(updates: Partial<FluxerMessage>): FluxerMessage;
}

// One channel's loaded messages. Every change returns a new list, so rows can tell when theirs changed.
export interface FluxerChannelMessages {
  get(id: string): FluxerMessage | undefined;
  update(id: string, updater: (message: FluxerMessage) => FluxerMessage): FluxerChannelMessages;
  removeIds(ids: string[]): FluxerChannelMessages;
}

export interface FluxerMessagesStore {
  getMessage(channelId: string, messageId: string): FluxerMessage | undefined;
  // Without creating an empty list for unloaded channels.
  getCachedMessages(channelId: string): FluxerChannelMessages | undefined;
  commitMessages(messages: FluxerChannelMessages): void;
  notifyChange(): void;
}

export interface MessageWire {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  mention_everyone?: boolean;
  mentions?: Array<{ id: string }>;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  member?: { nick?: string | null };
}

export interface RelationshipWire {
  id: string;
  type: number;
  nickname?: string | null;
  user?: { username?: string; global_name?: string | null };
}

export interface GuildWire {
  id: string;
  name?: string;
  unavailable?: boolean;
  properties?: { name?: string };
}

export interface ReadyPayload {
  user?: { id: string };
  relationships?: RelationshipWire[];
  guilds?: GuildWire[];
}
