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

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setActive(active: boolean): void {
  settings.store.active = active;
  for (const listener of listeners) listener();
}

function ChatBarButton() {
  const active = React.useSyncExternalStore(subscribe, () => settings.store.active);
  const TextareaButton = Components.TextareaButton();
  const KeyboardIcon = findIcon("KeyboardIcon");
  if (!TextareaButton || !KeyboardIcon) return null;
  return (
    <TextareaButton
      icon={KeyboardIcon}
      iconProps={active ? { weight: "fill" } : undefined}
      label={active ? "Silent typing: on" : "Silent typing: off"}
      isSelected={active}
      onClick={() => setActive(!active)}
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
        // oxlint-disable-next-line no-useless-escape
        match: /postTyping\(\i\)\{/,
        replace: "$&if($self.shouldSuppress())return;",
      },
    },
    {
      find: '"channel.textarea.textarea-buttons.button-container-dense"',
      replacement: {
        match:
          // Reuse the GIF and sticker buttons' guard, which hides them on mobile and in narrow chat bars.
          // oxlint-disable-next-line no-useless-escape
          /("channel\.textarea\.textarea-buttons\.button-container-dense",children:\[)(!\i&&\i&&)/,
        replace: "$1$2$self.renderChatBarButton(),$2",
      },
    },
  ],

  shouldSuppress(): boolean {
    return settings.store.active;
  },

  renderChatBarButton() {
    return <ChatBarButton />;
  },
});
