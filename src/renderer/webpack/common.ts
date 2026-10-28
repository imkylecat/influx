import type { ComponentType, FunctionComponent, ReactNode } from "react";

import { Logger } from "../utils/Logger";
import {
  filters,
  find,
  findByCode,
  findByProperties,
  findComponentByCode,
  findComponentByDisplayName,
  findComponentByName,
  waitFor,
} from "./finders";
import type {
  FluxerChannel,
  FluxerEmoji,
  FluxerGuild,
  FluxerMessage,
  FluxerMessagesStore,
  FluxerProfile,
  FluxerSticker,
  FluxerUser,
  VoiceStateWire,
} from "./fluxer";
import { moduleChanges } from "./patchWebpack";

const logger = new Logger("Common");

export let React: typeof import("react");

waitFor(filters.byProperties("useState", "createElement", "Fragment"), (module) => {
  React = module;
});

const MODAL_MODULE = "app.modal.content-layout.content-layout";

function lazy<T>(lookup: () => T | undefined): () => T | undefined {
  let value: T | undefined;
  let searchedAt = -1;
  return () => {
    if (value === undefined && searchedAt !== moduleChanges) {
      searchedAt = moduleChanges;
      value = lookup();
    }
    return value;
  };
}

const Missing = ({ children }: { children?: ReactNode }) => children ?? null;

function lazyComponents<T extends string>(
  lookups: Record<T, () => ComponentType<any> | undefined>,
): Record<T, ComponentType<any>> {
  const components = {} as Record<T, ComponentType<any>>;
  for (const [name, lookup] of Object.entries<() => ComponentType<any> | undefined>(lookups)) {
    const find = lazy(lookup);
    Object.defineProperty(components, name, { enumerable: true, get: () => find() ?? Missing });
  }
  return components;
}

export const found = (component: ComponentType<any>): boolean => component !== Missing;

function lazyByKey<T>(lookup: (key: string) => T | undefined): (key: string) => T | undefined {
  const lookups = new Map<string, () => T | undefined>();
  return (key) => {
    let cached = lookups.get(key);
    if (!cached) {
      cached = lazy(() => lookup(key));
      lookups.set(key, cached);
    }
    return cached();
  };
}

export const Components = lazyComponents({
  ConfirmModal: () => findComponentByCode("app.confirm-modal.modal-root"),
  Switch: () => findComponentByCode("-switch-label"),
  Checkbox: () => findComponentByCode("ui.checkbox.checkbox.checkbox-wrapper"),
  Input: () => findComponentByCode("ui.form.input.field-set.fieldset", "Input"),
  Textarea: () => findComponentByDisplayName("ui.form.input.textarea.field-set", "Textarea"),
  MenuItem: () =>
    findComponentByDisplayName("ui.action-menu.menu-item.menu-item-primitive.select", "MenuItem"),
  MenuItemSubmenu: () =>
    findComponentByDisplayName("ui.action-menu.context-menu.sub-menu.trigger", "SubMenu"),
  MenuItemCheckbox: () =>
    findComponentByDisplayName("ui.action-menu.context-menu.checkbox-item.item", "CheckboxItem"),
  MenuGroup: () => findComponentByCode("ui.action-menu.menu-group.menu-group-primitive"),
  Button: () => findComponentByCode("ui.button.button.focus-ring", "Button"),
  TextareaButton: () =>
    findComponentByCode("channel.textarea.textarea-button.focus-ring", "TextareaButton"),
  Combobox: () => findComponentByCode("ui.form.combobox.label"),
  WarningAlert: () => findComponentByCode("ui.warning-alert.warning-alert.alert"),
  SettingsTabContainer: () =>
    findComponentByCode("app.settings-tab-layout.settings-tab-container.container"),
  SettingsTabContent: () =>
    findComponentByCode("app.settings-tab-layout.settings-tab-content.content"),
  SettingsSection: () => findComponentByCode("app.settings-section.section"),
  StatusSlate: () => findComponentByCode("app.status-slate.container"),
  Tooltip: () => findComponentByCode("ui.tooltip.tooltip.trigger-wrapper"),
  Spinner: () => findComponentByCode('"ui.spinner.spinner"'),
  ExternalLink: () => findComponentByCode("app.external-link.external-link.click"),
  EmbedCard: () => findComponentByCode("messaging.embeds.embed-card.embed-card.wrapper"),
  ModalRoot: () => findComponentByDisplayName(MODAL_MODULE, "ModalRoot"),
  ModalHeader: () => findComponentByDisplayName(MODAL_MODULE, "ModalHeader"),
  ModalContent: () => findComponentByDisplayName(MODAL_MODULE, "ModalContent"),
  ModalContentLayout: () => findComponentByDisplayName(MODAL_MODULE, "ModalContentLayout"),
  ModalDescription: () => findComponentByDisplayName(MODAL_MODULE, "ModalDescription"),
  ModalFooter: () => findComponentByDisplayName(MODAL_MODULE, "ModalFooter"),
  Message: () => findComponentByCode("channel.message.message-view-context-provider"),
  AvatarStack: () => findComponentByCode("ui.avatars.avatar-stack.avatar"),
  Scroller: () => findComponentByCode("ui.scroller.scroller-children"),
  ErrorBoundary: () => findComponentByCode("An error was thrown."),
  SettingsSearch: () => findComponentByCode("app.settings-search.container"),
  TimestampWithTooltip: () => findComponentByCode("channel.timestamp-with-tooltip.container"),
  Nagbar: () => findComponentByCode("app.nagbar.nagbar"),
  NagbarContent: () => findComponentByCode("app.nagbar-content.container"),
  NagbarButton: () => findComponentByCode("app.nagbar-button.button.click"),
});

export const findIcon = lazyByKey<ComponentType<any>>(findComponentByName);

export const Modals = lazy<{
  push(modal: unknown): void;
  pop(): void;
  pushWithKey(modal: unknown, key: string): void;
  popWithKey(key: string): void;
  popAllByType(component: ComponentType<any>): void;
  modal(render: () => JSX.Element): unknown;
}>(() => findByProperties("push", "pop", "modal", "pushWithKey"));

export const Stores = {
  Users: lazy<{ currentUserId: string | null; getUser(id: string): FluxerUser | undefined }>(() =>
    findByProperties("getUser", "getUserByTag", "getCurrentUser"),
  ),
  Channels: lazy<{ getChannel(id: string): FluxerChannel | undefined }>(() =>
    findByProperties("getChannel", "getGuildChannels", "getPrivateChannels"),
  ),
  Guilds: lazy<{
    getGuild(id: string): FluxerGuild | undefined;
    handleGuildUpdate(guild: object): void;
  }>(() => findByProperties("getGuild", "getGuildRoles", "getOwnedGuilds")),
  Messages: lazy<FluxerMessagesStore>(() =>
    findByProperties("getMessage", "handleMessageDelete", "handleMessageDeleteBulk"),
  ),
  Navigation: lazy<{
    guildId: string | null;
    navigateToGuild(guildId: string, channelId?: string, messageId?: string, mode?: string): void;
    navigateToDM(channelId?: string, messageId?: string, mode?: string): void;
  }>(() => findByProperties("navigateToGuild", "navigateToDM", "navigateToFavorites")),
  Presence: lazy<{
    getStatus(userId: string): string;
    isMobile(userId: string): boolean;
    subscribeToUserStatus(userId: string, listener: () => void): () => void;
  }>(() => findByProperties("getStatus", "isMobile", "subscribeToUserStatus")),
  MemberList: lazy<{
    lists: Record<
      string,
      Record<
        string,
        {
          presences: Map<string, string>;
          mobileUserIds: Set<string>;
        }
      >
    >;
  }>(() => findByProperties("getList", "getPresence", "handleListUpdate")),
  MemberPresenceSubscription: lazy<{
    touchMember(guildId: string, userId: string): void;
    subscriptions: Map<string, Map<string, number>>;
  }>(() => findByProperties("touchMember", "getGuildSubscriptions")),
  UserProfile: lazy<{ getProfile(userId: string, guildId?: string): FluxerProfile | null }>(() =>
    findByProperties("getProfile", "handleProfileCreate", "handleProfilesClear"),
  ),
  Permission: lazy<{ can(permission: bigint, channel: FluxerChannel): boolean }>(() =>
    findByProperties("can", "canManageUser", "getChannelPermissions"),
  ),
  Emojis: lazy<{ getEmojiById(id: string): FluxerEmoji | undefined }>(() =>
    findByProperties("getEmojiById", "getQuickReactionEmojis"),
  ),
  Stickers: lazy<{ getStickerById(id: string): FluxerSticker | null }>(() =>
    findByProperties("getStickerById", "getGuildStickers"),
  ),
  RuntimeConfig: lazy<{ mediaEndpoint: string }>(() =>
    findByProperties("mediaEndpoint", "gatewayEndpoint"),
  ),
  Authentication: lazy<{ isAuthenticated: boolean }>(() =>
    findByProperties("isAuthenticated", "handleSessionStart", "handleLogout"),
  ),
  MobileLayout: lazy<{ enabled: boolean }>(() =>
    findByProperties("navExpanded", "chatExpanded", "isEnabled"),
  ),
  Modal: lazy<{ hasModal(key: string): boolean }>(() =>
    findByProperties("hasModal", "hasModalOfType", "popByType"),
  ),
  UserSettings: lazy<{
    guildFolders: Array<{ id: number | null; guildIds: string[] }>;
  }>(() => findByProperties("guildFolders", "updateUserSettings")),
  MediaEngine: lazy<{
    connected: boolean;
    channelId: string | null;
    voiceStats: { duration: number };
    subscribe(listener: () => void): () => void;
    getMobxSnapshot(): number;
    getAllVoiceStates(): Record<string, Record<string, Record<string, VoiceStateWire>>>;
    connectToVoiceChannel(guildId: string | null, channelId: string): Promise<void>;
  }>(() => findByProperties("voiceStats", "disconnectFromVoiceChannel")),
};

const mobxObserver = lazy<<P>(component: FunctionComponent<P>) => FunctionComponent<P>>(() =>
  findByCode("on a function component wrapped in either another"),
);

export function observer<P extends object>(component: FunctionComponent<P>): FunctionComponent<P> {
  let observed: FunctionComponent<P> | undefined;
  return (props) =>
    React.createElement((observed ??= mobxObserver()?.(component)) ?? component, props);
}

export const observable = lazy<{
  map<K, V>(entries?: undefined, options?: { deep?: boolean }): Map<K, V>;
  box<T>(value: T): { get(): T; set(value: T): void };
  array<T>(values: T[], options?: { deep?: boolean }): T[];
}>(() => findByProperties("box", "map", "array"));

export const reaction = lazy<
  <T>(expression: () => T, effect: (value: T, previous: T) => void) => () => void
>(() => findByCode('"Reaction"', "fireImmediately"));

const findClassName = lazyByKey<string>((prefix) => {
  const matches = (value: unknown): value is string =>
    typeof value === "string" && value.startsWith(prefix);
  const module = find(
    (value) =>
      typeof value === "object" && !Array.isArray(value) && Object.values(value).some(matches),
  );
  return module && Object.values(module).find(matches);
});

export const nativeClasses = (...prefixes: string[]): string =>
  prefixes.map(findClassName).filter(Boolean).join(" ");

export const RestClient = lazy<{
  get<T = unknown>(path: string): Promise<{ ok: boolean; status: number; body: T }>;
}>(() => findByProperties("installAuth", "hasAuthorization", "get"));

export const MessageRecord = lazy<new (wire: unknown, options?: object) => FluxerMessage>(() =>
  findByCode("this.editedTimestamp=e.edited_timestamp"),
);

export const NicknameLookup = lazy<
  (user: { username: string }, guildId?: string, channelId?: string) => string
>(() => findByCode(".displayName||", ".globalName||", ".username||", ".getMember(", ".nicks["));

export const fetchUserProfile = lazy<(userId: string, guildId?: string) => Promise<FluxerProfile>>(
  () => findByCode("in-flight profile request for user"),
);

export const channelIcon = lazy<
  (channel: FluxerChannel, props?: object, options?: { locked?: boolean }) => JSX.Element
>(() => findByCode("channel.channel-utils.get-icon.locked-voice-channel-icon"));

type ExpressionAvailability<T> = (
  translations: { _(message: object, values?: object): string },
  expression: T,
  channel: FluxerChannel | null,
  guildId?: string | null,
) => { canUse: boolean };

export const checkEmojiAvailability = lazy<ExpressionAvailability<FluxerEmoji>>(() =>
  findByCode("USE_EXTERNAL_EMOJIS", "isLockedByPermission"),
);
export const checkStickerAvailability = lazy<ExpressionAvailability<FluxerSticker>>(() =>
  findByCode("USE_EXTERNAL_STICKERS", "isLockedByPermission"),
);

export const formatDuration = lazy<(seconds: number) => string>(() =>
  findByCode('="en-US"', "Number.isFinite(", "/3600)"),
);

export const formatNameForStreamerMode = lazy<(name: string) => string>(() =>
  findByCode("shouldTruncateUsernames?"),
);

export const parseMessageJumpLink = lazy<
  (url: string) => { scope: string; channelId: string; messageId: string } | null
>(() => findByCode("{scope:", ",messageId:", "length)!==4"));

export const goToMessage = lazy<(channelId: string, messageId: string) => void>(() =>
  findByCode("setPendingJumpDispatch(", "viewContext"),
);

export const UserFlags = lazy<Record<string, number>>(() =>
  findByProperties("FRIENDLY_BOT_MANUAL_APPROVAL", "BUG_HUNTER", "SPAMMER"),
);

export const GuildFeatures = lazy<Record<string, string>>(() =>
  findByProperties("VOICE_E2EE", "VANITY_URL", "UNAVAILABLE_HIDDEN"),
);

interface NotificationContent {
  title: string;
  body: string;
  url?: string;
}

const NativeNotification = lazy<(content: NotificationContent) => Promise<unknown>>(() =>
  findByCode("Electron native notification show failed; refusing browser/Web Push fallback"),
);

export function showNotification(content: NotificationContent): boolean {
  const show = NativeNotification();
  void show?.(content).catch((error) => logger.error("Couldn't show a notification", error));
  return show !== undefined;
}

const externalOpener = lazy<(url: string) => unknown>(() =>
  findByCode("Failed to open external URL via Electron"),
);

export function openExternal(url: string): void {
  const open = externalOpener();
  if (open) void open(url);
  else window.open(url, "_blank", "noopener");
}

const Toasts = lazy<{ createToast(toast: object): void }>(() =>
  findByProperties("createToast", "destroyToast"),
);

export function showToast(
  type: "success" | "error" | "info",
  message: string,
  options: { timeout?: number; onClick?: () => void } = {},
): void {
  const toasts = Toasts();
  if (!toasts) {
    logger.warn(`Couldn't find Fluxer's toasts: ${message}`);
    return;
  }
  toasts.createToast({
    type,
    children: message,
    timeout: options.timeout ?? 5000,
    onClick: options.onClick,
  });
}

const linkedUserProfileOpener = lazy<(userId: string) => Promise<boolean>>(() =>
  findByCode("Skipping linked profile open before fetch"),
);

export async function openUserProfile(...userIds: string[]): Promise<void> {
  const openLinkedUserProfile = linkedUserProfileOpener();
  if (!openLinkedUserProfile) {
    logger.error("Couldn't find Fluxer's openLinkedUserProfile");
    return;
  }
  for (const userId of userIds) if (await openLinkedUserProfile(userId)) return;
}

const inviteAcceptModalOpener = lazy<(code: string) => void>(() =>
  findByCode("invite.invite-commands.open-accept-modal"),
);

export function openInvite(code: string): void {
  const openAcceptModal = inviteAcceptModalOpener();
  if (openAcceptModal) openAcceptModal(code);
  else window.open(`https://fluxer.gg/${code}`, "_blank", "noopener");
}
