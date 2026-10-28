export interface FluxerUser {
  id: string;
  username: string;
  discriminator?: string;
  tag?: string;
  bot?: boolean;
  system?: boolean;
  flags: number;
  toJSON(): MessageWire["author"];
}

export interface FluxerProfile {
  userProfile: { pronouns: string | null };
  guildMemberProfile: { pronouns: string | null } | null;
}

export interface FluxerChannel {
  id: string;
  name?: string;
  guildId?: string;
  recipientIds: readonly string[];
  isPrivate(): boolean;
}

export interface FluxerGuild {
  id: string;
  name: string;
  visiting: boolean;
  features: ReadonlySet<string>;
  toJSON(): object;
}

export interface FluxerEmoji {
  id?: string;
  guildId?: string;
  name: string;
  animated?: boolean;
}

export interface FluxerSticker {
  id: string;
  guildId: string;
  name: string;
  animated: boolean;
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

export interface FluxerChannelMessages {
  get(id: string): FluxerMessage | undefined;
  first(): FluxerMessage | undefined;
  last(): FluxerMessage | undefined;
  update(id: string, updater: (message: FluxerMessage) => FluxerMessage): FluxerChannelMessages;
  removeIds(ids: string[]): FluxerChannelMessages;
}

export interface FluxerMessagesStore {
  getMessage(channelId: string, messageId: string): FluxerMessage | undefined;
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
  visiting?: boolean;
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
