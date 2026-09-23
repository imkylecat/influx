import {
  getPluginsNeedingReload,
  isPluginEnabled,
  type PluginDef,
  plugins,
  setPluginEnabled,
} from "@api/Plugins";
import type { OptionDef } from "@api/Settings";
import { React, openUserProfile } from "@webpack/common";
import { SettingsPage, useSettingsComponents } from "./components";
import { settings } from "./settings";

const humanize = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function OptionField({ plugin, name, def }: { plugin: PluginDef; name: string; def: OptionDef }) {
  const store = plugin.settings!.store as Record<string, any>;
  const [value, setValue] = React.useState(store[name]);
  const update = (next: unknown) => {
    store[name] = next;
    setValue(next);
  };
  const { Switch, Input, Combobox } = useSettingsComponents();

  switch (def.type) {
    case "boolean":
      return (
        <Switch
          label={humanize(name)}
          description={def.description}
          value={Boolean(value)}
          onChange={update}
        />
      );
    case "select":
      return (
        <Combobox
          label={humanize(name)}
          description={def.description}
          value={String(value)}
          options={def.options.map((option) =>
            typeof option === "string" ? { label: option, value: option } : option,
          )}
          onChange={update}
        />
      );
    case "number":
    case "string":
      return (
        <Input
          label={humanize(name)}
          footer={def.description}
          type={def.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          onChange={(e: { currentTarget: HTMLInputElement }) => {
            const raw = e.currentTarget.value;
            if (def.type === "string") return update(raw);
            const parsed = Number(raw);
            setValue(raw);
            if (raw.trim() !== "" && Number.isFinite(parsed)) store[name] = parsed;
          }}
        />
      );
  }
}

type PluginFilter = "all" | "enabled" | "disabled" | "configurable";

const FILTERS: Array<{ value: PluginFilter; label: string; test(plugin: PluginDef): boolean }> = [
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

function visibleOptions(plugin: PluginDef): Array<[string, OptionDef]> {
  return Object.entries((plugin.settings?.defs ?? {}) as Record<string, OptionDef>).filter(
    ([, def]) => !def.hidden,
  );
}

function PluginCard({
  plugin,
  needsReload,
  onToggle,
}: {
  plugin: PluginDef;
  needsReload: boolean;
  onToggle(): void;
}) {
  const [showOptions, setShowOptions] = React.useState(false);
  const enabled = isPluginEnabled(plugin);
  const optionEntries = visibleOptions(plugin);
  const { Switch, Button } = useSettingsComponents();

  const classes = ["influx-plugin-card"];
  if (showOptions) classes.push("influx-plugin-card-expanded");

  return (
    <div className={classes.join(" ")}>
      <div className="influx-plugin-header">
        <div className="influx-plugin-title">
          <span className="influx-plugin-name">{plugin.name}</span>
          {plugin.required && <span className="influx-tag">Required</span>}
          {needsReload && <span className="influx-tag influx-tag-warning">Reload to apply</span>}
        </div>
        <Switch
          ariaLabel={`${enabled ? "Disable" : "Enable"} ${plugin.name}`}
          value={enabled}
          disabled={plugin.required}
          onChange={(value: boolean) => {
            setPluginEnabled(plugin.name, value);
            onToggle();
          }}
        />
      </div>
      <p className="influx-plugin-description">{plugin.description}</p>
      <div className="influx-plugin-meta">
        <span>
          By{" "}
          {plugin.authors.map((author, i) => (
            <React.Fragment key={author.id}>
              {i > 0 && ", "}
              <button
                type="button"
                className="influx-author"
                onClick={() => void openUserProfile(author.id)}
              >
                {author.name}
              </button>
            </React.Fragment>
          ))}
        </span>
        {optionEntries.length > 0 && (
          <Button small variant="secondary" fitContent onClick={() => setShowOptions(!showOptions)}>
            {showOptions ? "Hide settings" : "Settings"}
          </Button>
        )}
      </div>
      {showOptions && (
        <div className="influx-plugin-options">
          {!enabled && (
            <span className="influx-field-description">
              {plugin.name} is off. These settings apply when you turn it on.
            </span>
          )}
          {optionEntries.map(([name, def]) => (
            <OptionField key={name} plugin={plugin} name={name} def={def} />
          ))}
        </div>
      )}
    </div>
  );
}

function matchesQuery(plugin: PluginDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [plugin.name, plugin.description, ...plugin.authors.map((a) => a.name)].some((text) =>
      text.toLowerCase().includes(q),
    )
  );
}

export const PluginsTab = () => <SettingsPage>{() => <PluginsPage />}</SettingsPage>;

function PluginsPage() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilterState] = React.useState<PluginFilter>(
    () =>
      (FILTERS.some((f) => f.value === settings.store.pluginFilter)
        ? settings.store.pluginFilter
        : "all") as PluginFilter,
  );
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);

  const { Container, Content, Section, Input, Combobox, Button, WarningAlert } =
    useSettingsComponents();

  const setFilter = (value: PluginFilter) => {
    settings.store.pluginFilter = value;
    setFilterState(value);
  };

  const all = Object.values(plugins).sort((a, b) => a.name.localeCompare(b.name));
  const activeFilter = FILTERS.find((f) => f.value === filter) ?? FILTERS[0];
  const shown = all.filter((plugin) => activeFilter.test(plugin) && matchesQuery(plugin, query));
  const enabledCount = all.filter(isPluginEnabled).length;
  const needsReload = getPluginsNeedingReload();

  return (
    <Container>
      <Content>
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
        <Section
          title="Installed plugins"
          description={`Influx v${window.Influx.version}. ${enabledCount} of ${all.length} plugins enabled.`}
        >
          <div className="influx-plugin-toolbar">
            <div className="influx-plugin-search">
              <Input
                placeholder="Search plugins"
                aria-label="Search plugins"
                value={query}
                onChange={(e: { currentTarget: HTMLInputElement }) =>
                  setQuery(e.currentTarget.value)
                }
              />
            </div>
            <div className="influx-plugin-filter">
              <Combobox
                aria-label="Filter plugins"
                value={filter}
                isSearchable={false}
                options={FILTERS.map((f) => ({
                  value: f.value,
                  label: `${f.label} (${all.filter(f.test).length})`,
                }))}
                onChange={(value: PluginFilter) => setFilter(value)}
              />
            </div>
          </div>
          <div className="influx-plugin-list">
            {shown.map((plugin) => (
              <PluginCard
                key={plugin.name}
                plugin={plugin}
                needsReload={needsReload.includes(plugin.name)}
                onToggle={rerender}
              />
            ))}
          </div>
          {shown.length === 0 && (
            <div className="influx-empty">
              {query.trim() ? `No plugins match "${query.trim()}".` : EMPTY_MESSAGES[filter]}
            </div>
          )}
        </Section>
      </Content>
    </Container>
  );
}
