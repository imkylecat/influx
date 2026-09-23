import {
  getPluginsNeedingReload,
  isPluginEnabled,
  type PluginDef,
  plugins,
  setPluginEnabled,
} from "@api/Plugins";
import type { OptionDef } from "@api/Settings";
import { openUserProfile } from "@webpack/common";
import { SettingsPage, useSettingsComponents } from "./components";

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

function PluginCard({ plugin, onToggle }: { plugin: PluginDef; onToggle(): void }) {
  const [showOptions, setShowOptions] = React.useState(false);
  const enabled = isPluginEnabled(plugin);
  const optionEntries = Object.entries(
    (plugin.settings?.defs ?? {}) as Record<string, OptionDef>,
  ).filter(([, def]) => !def.hidden);
  const { Switch, Button } = useSettingsComponents();

  return (
    <div className="influx-plugin-card">
      <Switch
        label={plugin.name}
        description={plugin.description}
        value={enabled}
        disabled={plugin.required}
        onChange={(value: boolean) => {
          setPluginEnabled(plugin.name, value);
          onToggle();
        }}
      />
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
        {plugin.required && <span>Required</span>}
        {optionEntries.length > 0 && enabled && (
          <Button small variant="secondary" fitContent onClick={() => setShowOptions(!showOptions)}>
            {showOptions ? "Hide settings" : "Settings"}
          </Button>
        )}
      </div>
      {showOptions && enabled && (
        <div className="influx-plugin-options">
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
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);

  const { Container, Content, Section, Input, Button, WarningAlert } = useSettingsComponents();

  const all = Object.values(plugins).sort((a, b) => a.name.localeCompare(b.name));
  const shown = all.filter((plugin) => matchesQuery(plugin, query));
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
          <Input
            placeholder="Search plugins"
            aria-label="Search plugins"
            value={query}
            onChange={(e: { currentTarget: HTMLInputElement }) => setQuery(e.currentTarget.value)}
          />
          <div className="influx-plugin-list">
            {shown.map((plugin) => (
              <PluginCard key={plugin.name} plugin={plugin} onToggle={rerender} />
            ))}
            {shown.length === 0 && <div className="influx-empty">No plugins match "{query}".</div>}
          </div>
        </Section>
      </Content>
    </Container>
  );
}
