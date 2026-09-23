import { openExternal, React } from "@webpack/common";
import {
  canInstallUpdates,
  checkForUpdates,
  getPendingRestart,
  installUpdate,
  RELEASES_URL,
  restartToUpdate,
  updateChannel,
} from "@api/Updater";
import { useSettingsComponents } from "./components";
import { settings } from "./settings";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; url: string }
  | { kind: "installing"; version: string; url: string }
  | { kind: "installed"; version: string }
  | { kind: "error"; message: string };

const CHANNEL_LABELS = {
  desktop: "Desktop",
  "desktop-dev": "Desktop, development build",
  browser: "Browser extension",
};

export function UpdatesSection() {
  const { Section, Switch, Button, WarningAlert, ExternalLink } = useSettingsComponents();
  const pending = getPendingRestart();
  const [state, setState] = React.useState<UpdateState>(
    pending ? { kind: "installed", version: pending } : { kind: "idle" },
  );
  const [autoUpdate, setAutoUpdate] = React.useState(settings.store.autoUpdate);

  const check = async () => {
    setState({ kind: "checking" });
    const result = await checkForUpdates();
    if (!result.ok) setState({ kind: "error", message: result.error });
    else if (result.pendingRestart) setState({ kind: "installed", version: result.pendingRestart });
    else if (result.available)
      setState({ kind: "available", version: result.latest, url: result.url });
    else setState({ kind: "upToDate" });
  };

  const install = async (version: string, url: string) => {
    setState({ kind: "installing", version, url });
    const result = await installUpdate();
    setState(
      result.ok
        ? { kind: "installed", version: result.version }
        : { kind: "error", message: result.error },
    );
  };

  const autoUpdateDescription =
    updateChannel === "desktop"
      ? "Download and install new Influx versions when Fluxer starts. They load the next time Fluxer restarts."
      : updateChannel === "desktop-dev"
        ? "Not available for development builds. Update with git pull && bun run build."
        : "Not available in the browser extension. Browsers only let extensions update through their store.";

  const status =
    state.kind === "upToDate"
      ? "You're on the latest version."
      : state.kind === "available"
        ? `Influx ${state.version} is available.`
        : state.kind === "installing"
          ? `Installing Influx ${state.version}…`
          : state.kind === "error"
            ? state.message
            : null;

  const actions =
    state.kind === "installed" ? null : (
      <>
        <Button
          small
          variant="secondary"
          fitContent
          submitting={state.kind === "checking"}
          onClick={check}
        >
          Check for updates
        </Button>
        {(state.kind === "available" || state.kind === "installing") &&
          (canInstallUpdates ? (
            <Button
              small
              fitContent
              submitting={state.kind === "installing"}
              onClick={() => install(state.version, state.url)}
            >
              Update to {state.version}
            </Button>
          ) : (
            <Button small fitContent onClick={() => openExternal(state.url)}>
              Get {state.version}
            </Button>
          ))}
      </>
    );

  return (
    <Section
      title="Updates"
      description={
        <>
          Influx {INFLUX_VERSION} ({CHANNEL_LABELS[updateChannel]}).{" "}
          <span role="status">{status}</span>
        </>
      }
      actions={actions}
    >
      <div className="influx-updates">
        <Switch
          label="Automatically update"
          description={autoUpdateDescription}
          value={canInstallUpdates && autoUpdate}
          disabled={!canInstallUpdates}
          onChange={(value: boolean) => {
            settings.store.autoUpdate = value;
            setAutoUpdate(value);
          }}
        />
        {state.kind === "installed" && (
          <WarningAlert
            title="Restart required"
            actions={
              <Button small onClick={restartToUpdate}>
                Restart Fluxer
              </Button>
            }
          >
            Influx {state.version} is installed. Restart Fluxer to start using it.
          </WarningAlert>
        )}
        <ExternalLink href={RELEASES_URL}>All releases and changelogs</ExternalLink>
      </div>
    </Section>
  );
}
