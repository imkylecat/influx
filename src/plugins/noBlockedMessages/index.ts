import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import type { FluxerMessage } from "@webpack/fluxer";

const settings = definePluginSettings({
  hideReplies: {
    type: "boolean",
    description: "Also hide messages that reply to someone you blocked.",
    default: false,
  },
});

export default definePlugin({
  name: "NoBlockedMessages",
  description:
    'Hides messages from people you blocked, instead of collapsing them into "blocked messages".',
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      // createChannelStream, which builds the channel and unread-preview message lists.
      find: 'MESSAGE_GROUP_BLOCKED:"MESSAGE_GROUP_BLOCKED"',
      replacement: {
        match: /(\.forEach\((\i)=>\{)(let \i;if\(!\i\|\|!\(0,\i\.\i\)\(\i,\2\.timestamp\)\))/,
        replace: "$1if($self.shouldHide($2))return;$3",
      },
    },
  ],

  shouldHide(message: FluxerMessage): boolean {
    if (message.blocked) return true;
    return settings.store.hideReplies && message.referencedMessage?.blocked === true;
  },
});
