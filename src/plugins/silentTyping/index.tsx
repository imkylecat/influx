import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, findIcon, React } from "@webpack/common";

const settings = definePluginSettings({
  active: {
    type: "boolean",
    description: "Hide your typing indicator. You can also toggle this from the chat bar.",
    default: true,
  },
});

function ChatBarButton() {
  const [active, setActive] = React.useState(settings.store.active);
  const TextareaButton = Components.TextareaButton();
  const KeyboardIcon = findIcon("KeyboardIcon");
  if (!TextareaButton || !KeyboardIcon) return null;
  return (
    <TextareaButton
      icon={KeyboardIcon}
      iconProps={active ? { weight: "fill" } : undefined}
      label={active ? "Silent typing: on" : "Silent typing: off"}
      isSelected={active}
      onClick={() => {
        settings.store.active = !active;
        setActive(!active);
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
        match: /postTyping\(\i\)\{/,
        replace: "$&if($self.settings.store.active)return;",
      },
    },
    {
      find: '"channel.textarea.textarea-buttons.button-container-dense"',
      replacement: {
        match:
          // Reuse the GIF and sticker buttons' guard, which hides them on mobile and in narrow chat bars.
          /(\(0,(\i)\.jsxs\)\("div",\{[^{}]*?"data-flx":"channel\.textarea\.textarea-buttons\.button-container-dense",children:\[)(!\i&&\i&&)/,
        replace: "$1$3(0,$2.jsx)($self.ChatBarButton,{}),$3",
      },
    },
  ],

  ChatBarButton,
});
