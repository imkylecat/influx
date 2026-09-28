import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, Modals, React, showToast, Stores } from "@webpack/common";

export const HONEYPOT_CHANNEL_IDS: readonly string[] = ["1513407003270057984"];

const settings = definePluginSettings({
  blockHoneypotChannels: {
    type: "boolean",
    description: "Block messages to known honeypot channels, even if you confirm sending.",
    default: true,
  },
  confirmChannels: {
    type: "string",
    description: "Require confirmation in these channel IDs, separated by commas or spaces.",
    default: "",
  },
  confirmAll: {
    type: "boolean",
    description: "Require confirmation for every message, including direct messages.",
    default: false,
  },
});

export function sendPolicy(channelId: string): "block" | "confirm" | "allow" {
  if (settings.store.blockHoneypotChannels && HONEYPOT_CHANNEL_IDS.includes(channelId)) {
    return "block";
  }
  return settings.store.confirmAll ||
    settings.store.confirmChannels.split(/[\s,]+/).includes(channelId)
    ? "confirm"
    : "allow";
}

const pending = new Map<string, () => void>();

function Confirmation({
  channelId,
  finish,
}: {
  channelId: string;
  finish: (confirmed: boolean) => void;
}) {
  // Escape, the close button, and dismissal must cancel the waiting send too.
  React.useEffect(() => () => finish(false), [finish]);
  const ConfirmModal = Components.ConfirmModal();
  if (!ConfirmModal) return null;
  const channel = Stores.Channels()?.getChannel(channelId);
  const destination = channel?.name ? `#${channel.name}` : `channel ${channelId}`;
  return (
    <ConfirmModal
      title="Send message?"
      description={`Send this message to ${destination}? Cancelling leaves it unsent.`}
      primaryText="Send"
      secondaryText="Cancel"
      onPrimary={() => finish(true)}
      onSecondary={() => finish(false)}
    />
  );
}

export default definePlugin({
  name: "SendConfirmation",
  description: "Confirms sends in selected channels and blocks known honeypot channels.",
  authors: [Contributor.Kairu],
  settings,
  patches: [
    {
      find: "Enqueueing message for channel",
      replacement: [
        {
          // Guard the shared send command before uploads or queueing, including forwards and retries.
          match: /(?=if\(!(\i\.\i)\.consumeLocalSendReservation\((\i),(\i)\.nonce\)\))/,
          replace:
            "if(!(yield $self.authorize($2,$3.nonce))){$1.rejectLocalRateLimitedSend($2,$3.nonce,$3.hasAttachments);return null;}",
        },
        {
          // Block normal composer sends before Fluxer clears the draft or creates an optimistic message.
          match: /return (\i\.\i)\.reserveLocalSend\((\i),(\i)\)/,
          replace: "return !$self.blocked($2)&&$1.reserveLocalSend($2,$3)",
        },
      ],
    },
  ],

  blocked(channelId: string): boolean {
    if (sendPolicy(channelId) !== "block") return false;
    showToast("error", "Message blocked: this is a known honeypot channel.");
    return true;
  },

  async authorize(channelId: string, nonce: string): Promise<boolean> {
    if (this.blocked(channelId)) return false;
    if (sendPolicy(channelId) === "allow") return true;
    const accountId = Stores.Users()?.currentUserId;
    const modals = Modals();
    if (!accountId || !modals || !Components.ConfirmModal()) {
      showToast("error", "Couldn't open send confirmation. Your message was not sent.");
      return false;
    }
    const key = `influx-send-confirmation:${channelId}:${nonce}`;
    if (pending.has(key)) return false;
    const confirmed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        pending.delete(key);
        resolve(value);
      };
      pending.set(key, () => {
        finish(false);
        modals.popWithKey(key);
      });
      try {
        modals.pushWithKey(
          modals.modal(() => <Confirmation channelId={channelId} finish={finish} />),
          key,
        );
      } catch (error) {
        finish(false);
        console.error("[Influx] Couldn't open send confirmation", error);
        showToast("error", "Couldn't open send confirmation. Your message was not sent.");
      }
    });
    // Recheck after waiting: account and protection settings may have changed while the modal was open.
    return confirmed && Stores.Users()?.currentUserId === accountId && !this.blocked(channelId);
  },

  stop() {
    for (const cancel of pending.values()) cancel();
  },
});
