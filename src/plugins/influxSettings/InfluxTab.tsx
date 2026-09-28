import { INFLUX_SERVER_INVITE } from "@utils/constants";
import { Components, openInvite, React } from "@webpack/common";

import { getInviteEmbed, MissingComponents } from "./components";
import { UpdatesSection } from "./UpdatesSection";

const INVITE_CODE = new URL(INFLUX_SERVER_INVITE).pathname.split("/").filter(Boolean).pop()!;

export function InfluxTab() {
  const SettingsTabContainer = Components.SettingsTabContainer();
  const SettingsTabContent = Components.SettingsTabContent();
  const SettingsTabSection = Components.SettingsTabSection();
  const Button = Components.Button();
  const InviteEmbed = getInviteEmbed();
  if (!SettingsTabContainer || !SettingsTabContent || !SettingsTabSection || !Button) {
    return <MissingComponents />;
  }

  return (
    <SettingsTabContainer>
      <SettingsTabContent>
        <UpdatesSection />
        <SettingsTabSection
          title="Influx community"
          description="Join the Influx server on Fluxer to get help, suggest plugins, and follow development."
          actions={
            !InviteEmbed && (
              <Button small fitContent onClick={() => openInvite(INFLUX_SERVER_INVITE)}>
                Join the Influx server
              </Button>
            )
          }
        >
          {InviteEmbed && <InviteEmbed code={INVITE_CODE} />}
        </SettingsTabSection>
      </SettingsTabContent>
    </SettingsTabContainer>
  );
}
