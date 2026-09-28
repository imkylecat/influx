import { INFLUX_SERVER_INVITE_CODE } from "@utils/constants";
import { Components, openInvite, React } from "@webpack/common";

import { InviteEmbed, MissingComponents } from "./components";
import { UpdatesSection } from "./UpdatesSection";

export function InfluxTab() {
  const SettingsTabContainer = Components.SettingsTabContainer();
  const SettingsTabContent = Components.SettingsTabContent();
  const SettingsSection = Components.SettingsSection();
  const Button = Components.Button();
  if (!SettingsTabContainer || !SettingsTabContent || !SettingsSection || !Button) {
    return <MissingComponents />;
  }

  return (
    <SettingsTabContainer>
      <SettingsTabContent>
        <UpdatesSection />
        <SettingsSection
          id="influx-community"
          title="Influx community"
          description="Join the Influx server on Fluxer to get help, suggest plugins, and follow development."
          actions={
            !InviteEmbed && (
              <Button small fitContent onClick={() => openInvite(INFLUX_SERVER_INVITE_CODE)}>
                Join the Influx server
              </Button>
            )
          }
        >
          {InviteEmbed && <InviteEmbed code={INFLUX_SERVER_INVITE_CODE} />}
        </SettingsSection>
      </SettingsTabContent>
    </SettingsTabContainer>
  );
}
