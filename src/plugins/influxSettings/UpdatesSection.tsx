import { useSettings } from "@api/Settings";
import {
  canInstallUpdates,
  checkForUpdates,
  installUpdate,
  pendingRestart,
  restartToUpdate,
} from "@api/Updater";
import { Components, openExternal, React } from "@webpack/common";

import { RELEASES_URL } from "../../shared/version";
import { settings } from "./settings";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; url: string }
  | { kind: "installing"; version: string }
  | { kind: "installed"; version: string }
  | { kind: "error"; message: string };

const CHANNEL_LABEL = INFLUX_DESKTOP
  ? INFLUX_DEVELOPMENT
    ? "Desktop, development build"
    : "Desktop"
  : "Browser extension";

const AUTO_UPDATE_DESCRIPTION = INFLUX_DESKTOP
  ? INFLUX_DEVELOPMENT
    ? "Not available for development builds. Update with git pull && bun run build."
    : "Download and install new Influx versions when Fluxer starts. They load the next time Fluxer restarts."
  : "Not available in the browser extension. Browsers only let extensions update through their store.";

function statusText(state: UpdateState): string | null {
  switch (state.kind) {
    case "upToDate":
      return "You're on the latest version.";
    case "available":
      return `Influx ${state.version} is available.`;
    case "installing":
      return `Installing Influx ${state.version}…`;
    case "error":
      return state.message;
    default:
      return null;
  }
}

export function UpdatesSection() {
  const [state, setState] = React.useState<UpdateState>(
    pendingRestart ? { kind: "installed", version: pendingRestart } : { kind: "idle" },
  );
  useSettings();
  const SettingsSection = Components.SettingsSection();
  const Switch = Components.Switch();
  const Button = Components.Button();
  const WarningAlert = Components.WarningAlert();
  const ExternalLink = Components.ExternalLink();
  if (!SettingsSection || !Switch || !Button || !WarningAlert || !ExternalLink) return null;

  const check = async () => {
    setState({ kind: "checking" });
    const result = await checkForUpdates();
    if (!result.ok) setState({ kind: "error", message: result.error });
    else if (result.pendingRestart) setState({ kind: "installed", version: result.pendingRestart });
    else if (result.available)
      setState({ kind: "available", version: result.latest, url: result.url });
    else setState({ kind: "upToDate" });
  };

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
        {state.kind === "available" && !canInstallUpdates && (
          <Button small fitContent onClick={() => openExternal(state.url)}>
            Get {state.version}
          </Button>
        )}
        {INFLUX_DESKTOP &&
          canInstallUpdates &&
          (state.kind === "available" || state.kind === "installing") && (
            <Button
              small
              fitContent
              submitting={state.kind === "installing"}
              onClick={async () => {
                setState({ kind: "installing", version: state.version });
                const result = await installUpdate();
                setState(
                  result.ok
                    ? { kind: "installed", version: result.version }
                    : { kind: "error", message: result.error },
                );
              }}
            >
              Update to {state.version}
            </Button>
          )}
      </>
    );

  return (
    <SettingsSection
      id="influx-updates"
      title="Updates"
      description={
        <>
          Influx {INFLUX_VERSION} ({CHANNEL_LABEL}). <output>{statusText(state)}</output>{" "}
          <ExternalLink href={RELEASES_URL}>All releases and changelogs</ExternalLink>
        </>
      }
      actions={actions}
    >
      <Switch
        label="Automatically update"
        description={AUTO_UPDATE_DESCRIPTION}
        value={canInstallUpdates && settings.store.autoUpdate}
        disabled={!canInstallUpdates}
        onChange={(value: boolean) => {
          settings.store.autoUpdate = value;
        }}
      />
      {INFLUX_DESKTOP && state.kind === "installed" && (
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
    </SettingsSection>
  );
}
