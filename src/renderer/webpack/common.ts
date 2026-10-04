import type { ComponentType } from "react";

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
  FluxerGuild,
  FluxerMessage,
  FluxerMessagesStore,
  FluxerUser,
} from "./fluxer";
import { moduleChanges } from "./patchWebpack";

const logger = new Logger("Common");

export let React: typeof import("react");

waitFor(filters.byProperties("useState", "createElement", "Fragment"), (module) => {
  React = module;
});

// Fluxer's modal building blocks all live in one module.
const MODAL_MODULE = "app.modal.content-layout.content-layout";

// Looks up once, and after finding nothing, again only when more of Fluxer has loaded.
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

export const Components = {
  ConfirmModal: lazy(() => findComponentByCode("app.confirm-modal.modal-root")),
  Switch: lazy(() => findComponentByCode("-switch-label")),
  Input: lazy(() => findComponentByCode("ui.form.input.field-set.fieldset", "Input")),
  Textarea: lazy(() => findComponentByDisplayName("ui.form.input.textarea.field-set", "Textarea")),
  MenuItem: lazy(() =>
    findComponentByDisplayName("ui.action-menu.menu-item.menu-item-primitive.select", "MenuItem"),
  ),
  // A context menu item that opens a nested menu built by its render prop.
  MenuItemSubmenu: lazy(() => findComponentByCode("ui.action-menu.menu-item-submenu.sub-menu")),
  // A context menu item with a checkbox. Toggling it keeps the menu open.
  MenuItemCheckbox: lazy(() =>
    findComponentByDisplayName("ui.action-menu.context-menu.checkbox-item.item", "CheckboxItem"),
  ),
  // A context menu section, with a separator after it when anything follows.
  MenuGroup: lazy(() => findComponentByCode("ui.action-menu.menu-group.menu-group-primitive")),
  Button: lazy(() => findComponentByCode("ui.button.button.focus-ring", "Button")),
  // The icon buttons in the chat bar, beside the GIF, sticker, and emoji pickers.
  TextareaButton: lazy(() =>
    findComponentByCode("channel.textarea.textarea-button.focus-ring", "TextareaButton"),
  ),
  Combobox: lazy(() => findComponentByCode("ui.form.combobox.label")),
  WarningAlert: lazy(() => findComponentByCode("ui.warning-alert.warning-alert.alert")),
  SettingsTabContainer: lazy(() =>
    findComponentByCode("app.settings-tab-layout.settings-tab-container.container"),
  ),
  SettingsTabContent: lazy(() =>
    findComponentByCode("app.settings-tab-layout.settings-tab-content.content"),
  ),
  SettingsSection: lazy(() => findComponentByCode("app.settings-section.section")),
  StatusSlate: lazy(() => findComponentByCode("app.status-slate.container")),
  Tooltip: lazy(() => findComponentByCode("ui.tooltip.tooltip.trigger-wrapper")),
  Spinner: lazy(() => findComponentByCode('"ui.spinner.spinner"')),
  ExternalLink: lazy(() => findComponentByCode("app.external-link.external-link.click")),
  // The card behind invite and theme embeds: an icon, title, subtitle, and a footer below a divider.
  EmbedCard: lazy(() => findComponentByCode("messaging.embeds.embed-card.embed-card.wrapper")),
  ModalRoot: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalRoot")),
  ModalHeader: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalHeader")),
  ModalContent: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalContent")),
  ModalContentLayout: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalContentLayout")),
  // Muted helper text, also used for the footer under an Input or Textarea.
  ModalDescription: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalDescription")),
  ModalFooter: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalFooter")),
  // The full message row, as rendered in pins, confirm modals, and unread-channel previews.
  Message: lazy(() => findComponentByCode("channel.message.message-view-context-provider")),
  // A scrolling area with Fluxer's scrollbar.
  Scroller: lazy(() => findComponentByCode("ui.scroller.scroller-children")),
  // Lexical's error boundary. It calls onError, and shows a red box unless fallback is set, even to null.
  ErrorBoundary: lazy(() => findComponentByCode("An error was thrown.")),
};

export const findIcon = lazyByKey<ComponentType<any>>(findComponentByName);

export const Modals = lazy<{
  push(modal: unknown): void;
  pop(): void;
  pushWithKey(modal: unknown, key: string): void;
  popWithKey(key: string): void;
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
    // Rebuilds the server's record, as when the server sends an update.
    handleGuildUpdate(guild: object): void;
  }>(() => findByProperties("getGuild", "getGuildRoles", "getOwnedGuilds")),
  Messages: lazy<FluxerMessagesStore>(() =>
    findByProperties("getMessage", "handleMessageDelete", "handleMessageDeleteBulk"),
  ),
  Navigation: lazy<{
    // The open server's ID, or "@me" in direct messages.
    guildId: string | null;
    navigateToGuild(guildId: string, channelId?: string, messageId?: string, mode?: string): void;
    navigateToDM(channelId?: string, messageId?: string, mode?: string): void;
  }>(() => findByProperties("navigateToGuild", "navigateToDM", "navigateToFavorites")),
  StreamerMode: lazy<{ shouldTruncateUsernames: boolean }>(() =>
    findByProperties("shouldTruncateUsernames", "shouldHidePersonalInformation"),
  ),
  Presence: lazy<{
    getStatus(userId: string): string;
    isMobile(userId: string): boolean;
    // Calls the listener at once, and again whenever the user's status or device changes.
    subscribeToUserStatus(userId: string, listener: () => void): () => void;
  }>(() => findByProperties("getStatus", "isMobile", "subscribeToUserStatus")),
  // The member list of each channel, by server ID and then by list ID.
  MemberList: lazy<{
    lists: Record<
      string,
      Record<
        string,
        {
          rows: Map<
            number,
            { userId?: string; presence?: { status?: string; mobile?: boolean } | null }
          >;
        }
      >
    >;
  }>(() => findByProperties("getList", "getPresence", "handleListUpdate")),
  MemberPresenceSubscription: lazy<{
    // Has the presence store follow a member's status for the next 5 minutes.
    touchMember(guildId: string, userId: string): void;
  }>(() => findByProperties("touchMember", "getSubscribedMembers")),
  Authentication: lazy<{ isAuthenticated: boolean }>(() =>
    findByProperties("isAuthenticated", "setUserId", "handleLogout"),
  ),
  // Whether Fluxer is using its layout for narrow windows and phones.
  MobileLayout: lazy<{ enabled: boolean }>(() =>
    findByProperties("navExpanded", "chatExpanded", "isEnabled"),
  ),
  UserSettings: lazy<{
    // The server list in order. Folders with the ID -1 hold the servers outside any folder.
    guildFolders: Array<{ id: number | null; guildIds: string[] }>;
  }>(() => findByProperties("getGuildFolders", "getGuildPositions")),
  // The voice engine. It tells its subscribers about every change, such as each second of a call.
  MediaEngine: lazy<{
    connected: boolean;
    channelId: string | null;
    voiceStats: { duration: number };
    subscribe(listener: () => void): () => void;
  }>(() => findByProperties("voiceStats", "disconnectFromVoiceChannel")),
};

// MobX, which Fluxer's stores and components are built on.
export const observable = lazy<{
  map<K, V>(entries?: undefined, options?: { deep?: boolean }): Map<K, V>;
  box<T>(value: T): { get(): T; set(value: T): void };
}>(() => findByProperties("box", "map", "array"));

// Runs the effect whenever the expression reads observable values that changed. Returns a function that stops it.
export const reaction = lazy<
  <T>(expression: () => T, effect: (value: T, previous: T) => void) => () => void
>(() => findByCode('"Reaction"', "fireImmediately"));

// Finds a CSS module class by its readable prefix, for example "Message.module__messageTimestamp___".
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
}>(() => findByProperties("installAuth", "carriesAuthorization", "get"));

// Fluxer's Message model class; its constructor takes a message as the API sends it.
export const MessageRecord = lazy<new (wire: unknown, options?: object) => FluxerMessage>(() =>
  findByCode("this.editedTimestamp=e.edited_timestamp"),
);

// NicknameUtils.getNickname: the name Fluxer shows in the header, such as a server or friend nickname.
export const NicknameLookup = lazy<
  (user: { username: string }, guildId?: string, channelId?: string) => string
>(() => findByCode(".displayName||", ".globalName||", ".username||", ".nickname)", ".nicks"));

// Formats seconds as Fluxer shows a call's length, such as 1:05 or 1:01:05.
export const formatDuration = lazy<(seconds: number) => string>(() =>
  findByCode('="en-US"', "Number.isFinite(", "/3600)"),
);

interface NotificationContent {
  title: string;
  body: string;
  url?: string;
}

const NativeNotification = lazy<(content: NotificationContent) => Promise<unknown>>(() =>
  findByCode("Electron native notification show failed; refusing browser/Web Push fallback"),
);

// Fluxer's own notifications: native on desktop, the service worker or Notification API in browsers.
// They respect Fluxer's notification settings and play its sound. Returns whether they were found.
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
  findByProperties("createToast", "getCurrentToast"),
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

export function openUserProfile(userId: string): void {
  const openLinkedUserProfile = linkedUserProfileOpener();
  if (openLinkedUserProfile) void openLinkedUserProfile(userId);
  else logger.error("Couldn't find Fluxer's openLinkedUserProfile");
}

const inviteAcceptModalOpener = lazy<(code: string) => void>(() =>
  findByCode("invite.invite-commands.open-accept-modal"),
);

export function openInvite(code: string): void {
  const openAcceptModal = inviteAcceptModalOpener();
  if (openAcceptModal) openAcceptModal(code);
  else window.open(`https://fluxer.gg/${code}`, "_blank", "noopener");
}
