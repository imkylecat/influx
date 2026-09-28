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

const logger = new Logger("Common");

export let React: typeof import("react");

waitFor(filters.byProperties("useState", "createElement", "Fragment"), (module) => {
  React = module;
});

type AnyComponent = ComponentType<any>;

// Fluxer's modal building blocks all live in one module.
const MODAL_MODULE = "app.modal.content-layout.content-layout";

function lazy<T>(lookup: () => T | undefined): () => T | undefined {
  let value: T | undefined;
  return () => (value ??= lookup());
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
  SettingsTabSection: lazy(() =>
    findComponentByCode("app.settings-tab-layout.settings-tab-section.subsection"),
  ),
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
  ModalFooter: lazy(() => findComponentByDisplayName(MODAL_MODULE, "ModalFooter")),
  // The full message row, as rendered in pins, confirm modals, and unread-channel previews.
  Message: lazy(() => findComponentByCode("channel.message.message-view-context-provider")),
  // Lexical's error boundary. It calls onError, and shows a red box unless fallback is set, even to null.
  ErrorBoundary: lazy(() => findComponentByCode("An error was thrown.")),
};

const icons = new Map<string, AnyComponent>();

export function findIcon(name: string): AnyComponent | undefined {
  let icon = icons.get(name);
  if (!icon) {
    icon = findComponentByName(name);
    if (icon) icons.set(name, icon);
  }
  return icon;
}

export const Modals = lazy<{
  push(modal: unknown): void;
  pop(): void;
  pushWithKey(modal: unknown, key: string): void;
  popWithKey(key: string): void;
  modal(render: () => JSX.Element): unknown;
}>(() => findByProperties("push", "pop", "modal", "pushWithKey"));

export const Stores = {
  Users: lazy<{
    currentUserId: string | null;
    getUser(id: string): FluxerUser | undefined;
  }>(() => findByProperties("getUser", "getUserByTag", "getCurrentUser")),
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
    navigateToGuild(guildId: string, channelId?: string, messageId?: string, mode?: string): void;
    navigateToDM(channelId?: string, messageId?: string, mode?: string): void;
  }>(() => findByProperties("navigateToGuild", "navigateToDM", "navigateToFavorites")),
  StreamerMode: lazy<{ shouldTruncateUsernames: boolean }>(() =>
    findByProperties("shouldTruncateUsernames", "shouldHidePersonalInformation"),
  ),
};

const classCache = new Map<string, string>();

// Finds a CSS module class by its readable prefix, for example "Message.module__messageTimestamp___".
function findClassName(prefix: string): string | undefined {
  let className = classCache.get(prefix);
  if (className) return className;
  const matches = (value: unknown): value is string =>
    typeof value === "string" && value.startsWith(prefix);
  const module = find(
    (value) =>
      typeof value === "object" && !Array.isArray(value) && Object.values(value).some(matches),
  );
  className = module && Object.values(module).find(matches);
  if (className) classCache.set(prefix, className);
  return className;
}

export const nativeClasses = (...prefixes: string[]): string =>
  prefixes
    .map(findClassName)
    .filter((name): name is string => Boolean(name))
    .join(" ");

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

type ShowNotification = (options: {
  title: string;
  body: string;
  url?: string;
  playSound?: boolean;
}) => Promise<unknown>;

// Fluxer's own notifications: native on desktop, the service worker or Notification API in browsers.
// They respect Fluxer's notification settings and play its sound.
export const NativeNotification = lazy<ShowNotification>(() =>
  findByCode("Electron native notification show failed; refusing browser/Web Push fallback"),
);

export function openExternal(url: string): void {
  const open = findByCode("Failed to open external URL via Electron");
  if (open) void open(url);
  else window.open(url, "_blank", "noopener");
}

type ToastType = "success" | "error" | "info";

export function showToast(
  type: ToastType,
  message: string,
  options: { timeout?: number; onClick?: () => void } = {},
): void {
  const toasts = findByProperties("createToast", "getCurrentToast");
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

export async function openUserProfile(userId: string): Promise<boolean> {
  const openLinkedUserProfile = findByCode("Skipping linked profile open before fetch");
  if (!openLinkedUserProfile) {
    logger.error("Couldn't find Fluxer's openLinkedUserProfile");
    return false;
  }
  return openLinkedUserProfile(userId);
}

export function openInvite(url: string): void {
  const code = new URL(url).pathname.split("/").filter(Boolean).pop();
  const openAcceptModal = code && findByCode("invite.invite-commands.open-accept-modal");
  if (openAcceptModal) {
    openAcceptModal(code);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
