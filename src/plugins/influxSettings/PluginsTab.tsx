import {
  getPluginsNeedingReload,
  isPluginEnabled,
  type PluginDefinition,
  plugins,
  setPluginEnabled,
} from "@api/Plugins";
import { type OptionDefinition, useSettings } from "@api/Settings";
import {
  Components,
  findIcon,
  Modals,
  nativeClasses,
  openUserProfile,
  React,
} from "@webpack/common";

import { iconOrFallback, MissingComponents } from "./components";
import { settings } from "./settings";

const humanize = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase());

function OptionField({
  plugin,
  name,
  definition,
}: {
  plugin: PluginDefinition;
  name: string;
  definition: OptionDefinition;
}) {
  useSettings();
  const store = plugin.settings!.store as Record<string, any>;
  // What's typed in a number field, which isn't always a number yet.
  const [numberText, setNumberText] = React.useState(() => String(store[name] ?? ""));
  const update = (next: unknown) => {
    store[name] = next;
  };

  switch (definition.type) {
    case "boolean": {
      const Switch = Components.Switch();
      if (!Switch) return null;
      return (
        <Switch
          label={humanize(name)}
          description={definition.description}
          value={Boolean(store[name])}
          onChange={update}
        />
      );
    }
    case "select": {
      const Combobox = Components.Combobox();
      if (!Combobox) return null;
      return (
        <Combobox
          label={humanize(name)}
          description={definition.description}
          value={String(store[name])}
          options={definition.options.map((option) =>
            typeof option === "string" ? { label: option, value: option } : option,
          )}
          onChange={update}
        />
      );
    }
    case "number":
    case "string": {
      const Input = Components.Input();
      if (!Input) return null;
      return (
        <Input
          label={humanize(name)}
          footer={definition.description}
          type={definition.type === "number" ? "number" : "text"}
          value={definition.type === "number" ? numberText : String(store[name] ?? "")}
          onChange={(event: { currentTarget: HTMLInputElement }) => {
            const raw = event.currentTarget.value;
            if (definition.type === "string") return update(raw);
            const parsed = Number(raw);
            setNumberText(raw);
            if (raw.trim() !== "" && Number.isFinite(parsed)) update(parsed);
          }}
        />
      );
    }
  }
}

type PluginFilter = "all" | "enabled" | "disabled" | "configurable";

const FILTERS: Array<{
  value: PluginFilter;
  label: string;
  test: (plugin: PluginDefinition) => boolean;
}> = [
  { value: "all", label: "Show all", test: () => true },
  { value: "enabled", label: "Show enabled", test: (plugin) => isPluginEnabled(plugin) },
  { value: "disabled", label: "Show disabled", test: (plugin) => !isPluginEnabled(plugin) },
  {
    value: "configurable",
    label: "Show with settings",
    test: (plugin) => visibleOptions(plugin).length > 0,
  },
];

const EMPTY_MESSAGES: Record<PluginFilter, string> = {
  all: "No plugins are installed.",
  enabled: "No plugins are enabled.",
  disabled: "Every plugin is enabled.",
  configurable: "No plugins have settings.",
};

function visibleOptions(plugin: PluginDefinition): Array<[string, OptionDefinition]> {
  return Object.entries(
    (plugin.settings?.definitions ?? {}) as Record<string, OptionDefinition>,
  ).filter(([, definition]) => !definition.hidden);
}

// Laid out like the rows on Fluxer's Advanced settings tab.
const row = (name: string) => nativeClasses(`AdvancedSettingsTab.module__${name}___`);
const badge = (...variants: string[]) =>
  nativeClasses(
    "SettingsStatusBadge.module__badge___",
    ...variants.map((variant) => `SettingsStatusBadge.module__${variant}___`),
  );

function PluginSettingsModal({ plugin }: { plugin: PluginDefinition }) {
  const ModalRoot = Components.ModalRoot();
  const ModalHeader = Components.ModalHeader();
  const ModalContent = Components.ModalContent();
  const ModalContentLayout = Components.ModalContentLayout();
  if (!ModalRoot || !ModalHeader || !ModalContent || !ModalContentLayout) return null;
  const close = () => Modals()?.pop();
  return (
    <ModalRoot size="medium" onClose={close}>
      <ModalHeader title={`${plugin.name} settings`} onClose={close} />
      <ModalContent>
        <ModalContentLayout>
          {!isPluginEnabled(plugin) && (
            <p className={row("settingDescription")}>
              {plugin.name} is off. These settings apply when you turn it on.
            </p>
          )}
          <div className={row("controlStackCompact")}>
            {visibleOptions(plugin).map(([name, definition]) => (
              <OptionField key={name} plugin={plugin} name={name} definition={definition} />
            ))}
          </div>
        </ModalContentLayout>
      </ModalContent>
    </ModalRoot>
  );
}

function openPluginSettings(plugin: PluginDefinition): void {
  const modals = Modals();
  modals?.push(modals.modal(() => <PluginSettingsModal plugin={plugin} />));
}

function PluginRow({ plugin, needsReload }: { plugin: PluginDefinition; needsReload: boolean }) {
  const enabled = isPluginEnabled(plugin);
  const Switch = Components.Switch();
  const Button = Components.Button();
  const GearIcon = findIcon("GearIcon");
  if (!Switch || !Button) return null;

  return (
    <div className={row("settingRow")}>
      <div className={row("settingMain")}>
        <div className={row("settingTitleRow")}>
          <span className={row("settingTitle")}>{plugin.name}</span>
          {(plugin.required || needsReload) && (
            <span className={nativeClasses("SettingsStatusBadge.module__badges___")}>
              {plugin.required && <span className={badge("new")}>Required</span>}
              {needsReload && (
                <span className={`influx-badge-warning ${badge()}`}>Reload to apply</span>
              )}
            </span>
          )}
        </div>
        <p className={row("settingDescription")}>{plugin.description}</p>
        <p className={row("settingDescription")}>
          By{" "}
          {plugin.authors.map((author, index) => (
            <React.Fragment key={author.id}>
              {index > 0 && ", "}
              <button
                type="button"
                className={nativeClasses("CallMessage.module__callLink___")}
                onClick={() => void openUserProfile(author.id)}
              >
                {author.name}
              </button>
            </React.Fragment>
          ))}
        </p>
      </div>
      <div className={`influx-plugin-actions ${row("settingAction")}`}>
        {visibleOptions(plugin).length > 0 && (
          <Button
            variant="secondary"
            compact
            leftIcon={GearIcon && <GearIcon size={14} weight="bold" />}
            onClick={() => openPluginSettings(plugin)}
          >
            Configure
          </Button>
        )}
        <Switch
          ariaLabel={`${enabled ? "Disable" : "Enable"} ${plugin.name}`}
          value={enabled}
          disabled={plugin.required}
          onChange={(value: boolean) => setPluginEnabled(plugin.name, value)}
        />
      </div>
    </div>
  );
}

function matchesQuery(plugin: PluginDefinition, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return (
    !normalizedQuery ||
    [plugin.name, plugin.description, ...plugin.authors.map((author) => author.name)].some((text) =>
      text.toLowerCase().includes(normalizedQuery),
    )
  );
}

export function PluginsTab() {
  const [query, setQuery] = React.useState("");
  useSettings();

  const SettingsTabContainer = Components.SettingsTabContainer();
  const SettingsTabContent = Components.SettingsTabContent();
  const SettingsTabSection = Components.SettingsTabSection();
  const Input = Components.Input();
  const Combobox = Components.Combobox();
  const Button = Components.Button();
  const WarningAlert = Components.WarningAlert();
  const StatusSlate = Components.StatusSlate();
  if (
    !SettingsTabContainer ||
    !SettingsTabContent ||
    !SettingsTabSection ||
    !Input ||
    !Combobox ||
    !Button ||
    !WarningAlert ||
    !StatusSlate
  ) {
    return <MissingComponents />;
  }

  const all = Object.values(plugins).sort((first, second) => first.name.localeCompare(second.name));
  const activeFilter =
    FILTERS.find((option) => option.value === settings.store.pluginFilter) ?? FILTERS[0];
  const filter = activeFilter.value;
  const shown = all.filter((plugin) => activeFilter.test(plugin) && matchesQuery(plugin, query));
  const enabledCount = all.filter(isPluginEnabled).length;
  const needsReload = getPluginsNeedingReload();
  const SearchIcon = findIcon("MagnifyingGlassIcon");

  return (
    <SettingsTabContainer>
      <SettingsTabContent>
        {needsReload.length > 0 && (
          <WarningAlert
            title="Reload required"
            actions={
              <Button small onClick={() => location.reload()}>
                Reload
              </Button>
            }
          >
            Reload Fluxer to apply changes to {needsReload.join(", ")}.
          </WarningAlert>
        )}
        <SettingsTabSection
          title="Installed plugins"
          description={`Influx ${INFLUX_VERSION}. ${enabledCount} of ${all.length} plugins enabled.`}
        >
          <div className={row("section")}>
            <div className={nativeClasses("GuildAuditLogTab.module__filterRow___")}>
              <Input
                placeholder="Search plugins"
                aria-label="Search plugins"
                leftIcon={SearchIcon && <SearchIcon size={20} weight="bold" />}
                value={query}
                onChange={(event: { currentTarget: HTMLInputElement }) =>
                  setQuery(event.currentTarget.value)
                }
              />
              <Combobox
                aria-label="Filter plugins"
                value={filter}
                isSearchable={false}
                options={FILTERS.map((option) => ({
                  value: option.value,
                  label: `${option.label} (${all.filter(option.test).length})`,
                }))}
                onChange={(value: PluginFilter) => {
                  settings.store.pluginFilter = value;
                }}
              />
            </div>
            {shown.length > 0 && (
              <div className={row("itemList")}>
                {shown.map((plugin) => (
                  <PluginRow
                    key={plugin.name}
                    plugin={plugin}
                    needsReload={needsReload.includes(plugin.name)}
                  />
                ))}
              </div>
            )}
          </div>
          {shown.length === 0 && (
            <StatusSlate
              Icon={iconOrFallback(query.trim() ? "MagnifyingGlassIcon" : "PlugIcon")}
              title="No plugins to show"
              description={
                query.trim() ? `No plugins match "${query.trim()}".` : EMPTY_MESSAGES[filter]
              }
            />
          )}
        </SettingsTabSection>
      </SettingsTabContent>
    </SettingsTabContainer>
  );
}
