import { INFLUX_SERVER_INVITE_CODE } from "@utils/constants";
import { Components, openInvite, React } from "@webpack/common";

import { InviteEmbed } from "./components";
import { UpdatesSection } from "./UpdatesSection";

export function InfluxTab() {
  return (
    <Components.SettingsTabContainer>
      <Components.SettingsTabContent>
        <UpdatesSection />
        <Components.SettingsSection
          id="influx-community"
          title="Influx community"
          description="Join the Influx server on Fluxer to get help, suggest plugins, and follow development."
          actions={
            !InviteEmbed && (
              <Components.Button
                small
                fitContent
                onClick={() => openInvite(INFLUX_SERVER_INVITE_CODE)}
              >
                Join the Influx server
              </Components.Button>
            )
          }
        >
          {InviteEmbed && <InviteEmbed code={INFLUX_SERVER_INVITE_CODE} />}
        </Components.SettingsSection>
      </Components.SettingsTabContent>
    </Components.SettingsTabContainer>
  );
}
