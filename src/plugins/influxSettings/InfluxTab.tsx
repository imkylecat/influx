import { INFLUX_SERVER_INVITE } from "@utils/constants";
import { React, openInvite } from "@webpack/common";
import { getInviteEmbed, SettingsPage, useSettingsComponents } from "./components";
import { UpdatesSection } from "./UpdatesSection";

const INVITE_CODE = new URL(INFLUX_SERVER_INVITE).pathname.split("/").filter(Boolean).pop()!;

export const InfluxTab = () => <SettingsPage>{() => <InfluxPage />}</SettingsPage>;

function InfluxPage() {
  const { Container, Content, Section, Button } = useSettingsComponents();
  const InviteEmbed = getInviteEmbed();

  return (
    <Container>
      <Content>
        <UpdatesSection />
        <Section
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
        </Section>
      </Content>
    </Container>
  );
}
