import type { ComponentType } from "react";
import {
  filters,
  find,
  findByCode,
  findByProps,
  findComponentByCode,
  findComponentByDisplayName,
  findComponentByName,
  waitFor,
} from "./finders";

export let React: typeof import("react");

waitFor(filters.byProps("useState", "createElement", "Fragment"), (m) => {
  React = m;
});

type AnyComponent = ComponentType<any>;

// Fluxer's modal building blocks all live in one module.
const MODAL_MODULE = "app.modal.content-layout.content-layout";

const componentCache = new Map<string, AnyComponent>();

function lazyComponent(
  key: string,
  lookup: () => AnyComponent | undefined,
): () => AnyComponent | undefined {
  return () => {
    let component = componentCache.get(key);
    if (!component) {
      component = lookup();
      if (component) componentCache.set(key, component);
    }
    return component;
  };
}

export const Components = {
  Switch: lazyComponent("Switch", () => findComponentByCode("-switch-label")),
  Input: lazyComponent("Input", () =>
    findComponentByCode("ui.form.input.field-set.fieldset", "Input"),
  ),
  Button: lazyComponent("Button", () =>
    findComponentByCode("ui.button.button.focus-ring", "Button"),
  ),
  Combobox: lazyComponent("Combobox", () => findComponentByCode("ui.form.combobox.label")),
  WarningAlert: lazyComponent("WarningAlert", () =>
    findComponentByCode("ui.warning-alert.warning-alert.alert"),
  ),
  SettingsTabContainer: lazyComponent("SettingsTabContainer", () =>
    findComponentByCode("app.settings-tab-layout.settings-tab-container.container"),
  ),
  SettingsTabContent: lazyComponent("SettingsTabContent", () =>
    findComponentByCode("app.settings-tab-layout.settings-tab-content.content"),
  ),
  SettingsTabSection: lazyComponent("SettingsTabSection", () =>
    findComponentByCode("app.settings-tab-layout.settings-tab-section.subsection"),
  ),
  StatusSlate: lazyComponent("StatusSlate", () =>
    findComponentByCode("app.status-slate.container"),
  ),
  Accordion: lazyComponent("Accordion", () =>
    findComponentByCode("ui.accordion.accordion.accordion"),
  ),
  Tooltip: lazyComponent("Tooltip", () =>
    findComponentByCode("ui.tooltip.tooltip.trigger-wrapper"),
  ),
  Spinner: lazyComponent("Spinner", () => findComponentByCode('"ui.spinner.spinner"')),
  ExternalLink: lazyComponent("ExternalLink", () =>
    findComponentByCode("app.external-link.external-link.click"),
  ),
  // The card behind invite and theme embeds: an icon, title, subtitle, and a footer below a divider.
  EmbedCard: lazyComponent("EmbedCard", () =>
    findComponentByCode("messaging.embeds.embed-card.embed-card.wrapper"),
  ),
  ModalRoot: lazyComponent("ModalRoot", () =>
    findComponentByDisplayName(MODAL_MODULE, "ModalRoot"),
  ),
  ModalHeader: lazyComponent("ModalHeader", () =>
    findComponentByDisplayName(MODAL_MODULE, "ModalHeader"),
  ),
  ModalContent: lazyComponent("ModalContent", () =>
    findComponentByDisplayName(MODAL_MODULE, "ModalContent"),
  ),
  ModalContentLayout: lazyComponent("ModalContentLayout", () =>
    findComponentByDisplayName(MODAL_MODULE, "ModalContentLayout"),
  ),
  // The full message row, as rendered in pins, confirm modals, and unread-channel previews.
  Message: lazyComponent("Message", () =>
    findComponentByCode("channel.message.message-view-context-provider"),
  ),
};

export const findIcon = (name: string): AnyComponent | undefined =>
  lazyComponent(`icon:${name}`, () => findComponentByName(name))();

const lookupCache = new Map<string, any>();

function lazyModule<T = any>(...props: string[]): () => T | undefined {
  const key = props.join(",");
  return () => {
    let module = lookupCache.get(key);
    if (!module) {
      module = findByProps(...props);
      if (module) lookupCache.set(key, module);
    }
    return module;
  };
}

export interface FluxerUser {
  id: string;
  username: string;
  globalName: string | null;
  displayName: string;
  avatar: string | null;
  bot?: boolean;
}

export interface FluxerChannel {
  id: string;
  name?: string;
  guildId?: string;
  type: number;
}

export interface FluxerGuild {
  id: string;
  name: string;
}

export const Modals = lazyModule<{
  push(modal: unknown): void;
  pop(): void;
  modal(render: () => JSX.Element): unknown;
}>("push", "pop", "modal", "pushWithKey");

export const Stores = {
  Users: lazyModule<{
    currentUserId: string | null;
    getUser(id: string): FluxerUser | undefined;
  }>("getUser", "getUserByTag", "getCurrentUser"),
  Channels: lazyModule<{ getChannel(id: string): FluxerChannel | undefined }>(
    "getChannel",
    "getGuildChannels",
    "getPrivateChannels",
  ),
  Guilds: lazyModule<{ getGuild(id: string): FluxerGuild | undefined }>(
    "getGuild",
    "getGuildRoles",
    "getOwnedGuilds",
  ),
  Messages: lazyModule<{ getMessage(channelId: string, messageId: string): any }>(
    "getMessage",
    "handleMessageDelete",
    "handleMessageDeleteBulk",
  ),
  Navigation: lazyModule<{
    navigateToGuild(guildId: string, channelId?: string, messageId?: string, mode?: string): void;
    navigateToDM(channelId?: string, messageId?: string, mode?: string): void;
  }>("navigateToGuild", "navigateToDM", "navigateToFavorites"),
  StreamerMode: lazyModule<{ shouldTruncateUsernames: boolean }>(
    "shouldTruncateUsernames",
    "shouldHidePersonalInformation",
  ),
};

const classCache = new Map<string, string>();

// Finds a CSS module class by its readable prefix, e.g. "Message.module__messageTimestamp___".
export function findClassName(prefix: string): string | undefined {
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

// Joins Fluxer CSS module classes found by prefix, skipping any that can't be found.
export const nativeClasses = (...prefixes: string[]): string =>
  prefixes
    .map(findClassName)
    .filter((name): name is string => Boolean(name))
    .join(" ");

export const RestClient = lazyModule<{
  get<T = unknown>(path: string): Promise<{ ok: boolean; status: number; body: T }>;
}>("installAuth", "carriesAuthorization", "get");

// Fluxer's Message model class; its constructor takes a message as the API sends it.
export const MessageRecord = (() => {
  let record: (new (wire: unknown, options?: object) => any) | undefined;
  return () => (record ??= findByCode("this.editedTimestamp=e.edited_timestamp"));
})();

export type ShowNotification = (options: {
  title: string;
  body: string;
  url?: string;
  playSound?: boolean;
}) => Promise<unknown>;

// Fluxer's own notifications: native on desktop, the service worker or Notification API in browsers.
// They respect Fluxer's notification settings and play its sound.
export const NativeNotification = (() => {
  let show: ShowNotification | undefined;
  return (): ShowNotification | undefined =>
    (show ??= findByCode(
      "Electron native notification show failed; refusing browser/Web Push fallback",
    ));
})();

export function openExternal(url: string): void {
  const open = findByCode("Failed to open external URL via Electron");
  if (open) void open(url);
  else window.open(url, "_blank", "noopener");
}

export type ToastType = "success" | "error" | "info";

export function showToast(
  type: ToastType,
  message: string,
  options: { timeout?: number; onClick?(): void } = {},
): void {
  const toasts = findByProps("createToast", "getCurrentToast");
  if (!toasts) {
    console.warn(`[Influx] Couldn't find Fluxer's toasts: ${message}`);
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
    console.error("[Influx] Couldn't find Fluxer's openLinkedUserProfile");
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
