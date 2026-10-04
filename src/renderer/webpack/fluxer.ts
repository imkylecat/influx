// Fluxer's records, stores, and gateway payloads, as far as Influx relies on them.

export interface FluxerUser {
  id: string;
  username: string;
  discriminator?: string;
  tag?: string;
  bot?: boolean;
  flags: number;
  toJSON(): MessageWire["author"];
}

export interface FluxerChannel {
  id: string;
  name?: string;
  guildId?: string;
  recipientIds: readonly string[];
  // Whether it's a direct message or a group.
  isPrivate(): boolean;
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
  toJSON(): MessageWire;
}

// One channel's loaded messages. Every change returns a new list, so rows can tell when theirs changed.
export interface FluxerChannelMessages {
  get(id: string): FluxerMessage | undefined;
  // The oldest and newest messages on screen.
  first(): FluxerMessage | undefined;
  last(): FluxerMessage | undefined;
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
  webhook_id?: string | null;
  content?: string;
  flags?: number;
  blocked?: boolean;
  mention_everyone?: boolean;
  mentions?: Array<{ id: string }>;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  member?: { nick?: string | null };
  referenced_message?: MessageWire | null;
}

export interface VoiceStateWire {
  user_id: string;
  channel_id: string;
  mute?: boolean;
  deaf?: boolean;
  self_mute?: boolean;
  self_deaf?: boolean;
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

export interface ChannelWire {
  id: string;
  type: number;
  name?: string | null;
  recipients?: Array<{ id: string; username?: string; global_name?: string | null }>;
}

export interface ReadyPayload {
  user?: { id: string };
  relationships?: RelationshipWire[];
  guilds?: GuildWire[];
  private_channels?: ChannelWire[];
}
