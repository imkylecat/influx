import { Components } from "@webpack/common";
import type { ComponentType } from "react";

const SETTINGS_COMPONENTS = {
  Container: Components.SettingsTabContainer,
  Content: Components.SettingsTabContent,
  Section: Components.SettingsTabSection,
  Switch: Components.Switch,
  Input: Components.Input,
  Combobox: Components.Combobox,
  Button: Components.Button,
  WarningAlert: Components.WarningAlert,
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
