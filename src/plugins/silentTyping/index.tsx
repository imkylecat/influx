import definePlugin from "@api/Plugins";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { idListIncludes } from "@utils/idList";
import { Components, findIcon, React } from "@webpack/common";

const settings = definePluginSettings({
  active: {
    type: "boolean",
    description: "Hide your typing indicator. You can also toggle this from the chat bar.",
    default: true,
  },
  showInChannels: {
    type: "string",
    description:
      "Always show that you're typing in these channel IDs, separated by commas or spaces.",
    default: "",
  },
});

function isSilent(channelId: string | undefined): boolean {
  return settings.store.active && !idListIncludes(settings.store.showInChannels, channelId);
}

function ChatBarButton({ channelId }: { channelId?: string }) {
  useSettings();
  const { active } = settings.store;
  const silent = isSilent(channelId);
  const TextareaButton = Components.TextareaButton();
  const KeyboardIcon = findIcon("KeyboardIcon");
  if (!TextareaButton || !KeyboardIcon) return null;
  const state = silent ? "on" : active ? "off in this channel" : "off";
  return (
    <TextareaButton
      icon={KeyboardIcon}
      iconProps={silent ? { weight: "fill" } : undefined}
      label={`Silent typing: ${state}`}
      isSelected={silent}
      onClick={() => {
        settings.store.active = !active;
      }}
    />
  );
}

export default definePlugin({
  name: "SilentTyping",
  description: "Stops Fluxer from telling others that you're typing.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: "Failed to send typing indicator to channel",
      replacement: {
        match: /postTyping\((\i)\)\{/,
        replace: "$&if($self.isSilent($1))return;",
      },
    },
    {
      find: '"channel.textarea.textarea-buttons.button-container-dense"',
      replacement: {
        match:
          // Reuse the GIF and sticker buttons' guard, which hides them on mobile and in narrow chat bars.
          /(\(0,(\i)\.jsxs\)\("div",\{[^{}]*?"data-flx":"channel\.textarea\.textarea-buttons\.button-container-dense",children:\[)(!\i&&\i&&)/,
        replace: (_, head: string, jsx: string, guard: string, offset: number, code: string) => {
          // The component takes its channel as a prop, named where it unpacks them.
          const props = code.lastIndexOf("channelId:", offset);
          const channelId = /^channelId:([\w$]+)/.exec(code.slice(props, props + 40))?.[1];
          return `${head}${guard}(0,${jsx}.jsx)($self.ChatBarButton,{channelId:${channelId}}),${guard}`;
        },
      },
    },
  ],

  isSilent,
  ChatBarButton,
});
