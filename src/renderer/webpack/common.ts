import type { ComponentType } from "react";
import {
  filters,
  findByCode,
  findByProps,
  findComponentByCode,
  findComponentByName,
  waitFor,
} from "./finders";

export let React: typeof import("react");

waitFor(filters.byProps("useState", "createElement", "Fragment"), (m) => {
  React = m;
});

type AnyComponent = ComponentType<any>;

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
};

export const findIcon = (name: string): AnyComponent | undefined =>
  lazyComponent(`icon:${name}`, () => findComponentByName(name))();

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
