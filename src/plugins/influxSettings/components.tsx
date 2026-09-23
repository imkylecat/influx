import { React, Components, findIcon, Modals } from "@webpack/common";
import type { ComponentType } from "react";

export const PluginIconFallback = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="1em"
    height="1em"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M237.66 66.34a8 8 0 0 0-11.32 0L192 100.69 155.31 64l34.35-34.34a8 8 0 1 0-11.32-11.32L144 52.69l-18.34-18.35a8 8 0 0 0-11.32 11.32L120.69 52 66.34 106.34a36 36 0 0 0 0 50.91l6.06 6.06-54.06 54.06a8 8 0 0 0 11.32 11.32l54.06-54.06 6.06 6.06a36 36 0 0 0 50.91 0L204 126.31l6.34 6.35a8 8 0 0 0 11.32-11.32L203.31 103l34.35-34.34a8 8 0 0 0 0-11.32Z" />
  </svg>
);

export const iconOrFallback = (name: string): ComponentType<any> =>
  findIcon(name) ?? PluginIconFallback;

// Fluxer's chat invite card, captured by a patch since its module has no other way to tell it apart.
let InviteEmbed: ComponentType<{ code: string }> | undefined;
export const getInviteEmbed = () => InviteEmbed;
export function captureInviteEmbed<T extends ComponentType<any>>(component: T): T {
  InviteEmbed = component;
  return component;
}

const SETTINGS_COMPONENTS = {
  Container: Components.SettingsTabContainer,
  Content: Components.SettingsTabContent,
  Section: Components.SettingsTabSection,
  Switch: Components.Switch,
  Input: Components.Input,
  Combobox: Components.Combobox,
  Button: Components.Button,
  WarningAlert: Components.WarningAlert,
  StatusSlate: Components.StatusSlate,
  ModalRoot: Components.ModalRoot,
  ModalHeader: Components.ModalHeader,
  ModalContent: Components.ModalContent,
  ModalContentLayout: Components.ModalContentLayout,
  ExternalLink: Components.ExternalLink,
};

type SettingsComponents = Record<keyof typeof SETTINGS_COMPONENTS, ComponentType<any>>;

function resolveSettingsComponents(): { components: SettingsComponents; missing: string[] } {
  const components = {} as SettingsComponents;
  const missing: string[] = [];
  for (const [name, lookup] of Object.entries(SETTINGS_COMPONENTS)) {
    const component = lookup();
    if (component) components[name as keyof SettingsComponents] = component;
    else missing.push(name);
  }
  if (!Modals()) missing.push("Modals");
  return { components, missing };
}

export const useSettingsComponents = (): SettingsComponents =>
  resolveSettingsComponents().components;

export function SettingsPage({ children }: { children: () => JSX.Element }) {
  const { missing } = resolveSettingsComponents();
  if (missing.length > 0) {
    return (
      <div className="influx-missing-components">
        Influx couldn't find Fluxer's {missing.join(", ")} component{missing.length > 1 ? "s" : ""}.
        Fluxer probably changed; update Influx.
      </div>
    );
  }
  return children();
}
