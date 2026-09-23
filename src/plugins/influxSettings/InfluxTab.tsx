import { INFLUX_SERVER_INVITE } from "@utils/constants";
import { React, openInvite } from "@webpack/common";
import { SettingsPage, useSettingsComponents } from "./components";
import { UpdatesSection } from "./UpdatesSection";

export const InfluxTab = () => <SettingsPage>{() => <InfluxPage />}</SettingsPage>;

function InfluxPage() {
  const { Container, Content, Section, Button } = useSettingsComponents();

  return (
    <Container>
      <Content>
        <UpdatesSection />
        <Section
          title="Influx community"
          description="Join the Influx server on Fluxer to get help, suggest plugins, and follow development."
        >
          <div className="influx-community-row">
            <Button fitContent onClick={() => openInvite(INFLUX_SERVER_INVITE)}>
              Join the Influx server
            </Button>
            <span className="influx-field-description">
              {INFLUX_SERVER_INVITE.replace("https://", "")}
            </span>
          </div>
        </Section>
      </Content>
    </Container>
  );
}
