import definePlugin from "@api/Plugins";
import { getPluginData, saveSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, Modals, React, showToast, Stores } from "@webpack/common";

export const MAX_NOTE_LENGTH = 4000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readNote(accountId: string, userId: string): string {
  const accounts = record(getPluginData("LocalNotes").notes);
  const note = record(accounts[accountId])[userId];
  return typeof note === "string" ? note : "";
}

export function writeNote(accountId: string, userId: string, note: string): void {
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(userId)) {
    throw new Error("Local notes require valid account and user IDs");
  }
  const data = getPluginData("LocalNotes");
  const accounts = { ...record(data.notes) };
  const notes = { ...record(accounts[accountId]) };
  if (note.trim()) notes[userId] = note.slice(0, MAX_NOTE_LENGTH);
  else delete notes[userId];
  if (Object.keys(notes).length) accounts[accountId] = notes;
  else delete accounts[accountId];
  data.notes = accounts;
  saveSettings();
}

function editorComponents() {
  const Root = Components.ModalRoot();
  const Header = Components.ModalHeader();
  const Content = Components.ModalContent();
  const Layout = Components.ModalContentLayout();
  const Footer = Components.ModalFooter();
  const Textarea = Components.Textarea();
  const Button = Components.Button();
  return Root && Header && Content && Layout && Footer && Textarea && Button
    ? { Root, Header, Content, Layout, Footer, Textarea, Button }
    : undefined;
}

function NoteModal({ accountId, userId }: { accountId: string; userId: string }) {
  const [note, setNote] = React.useState(() => readNote(accountId, userId));
  const parts = editorComponents();
  if (!parts) return null;
  const { Root, Header, Content, Layout, Footer, Textarea, Button } = parts;
  const close = () => Modals()?.pop();
  const save = (value: string) => {
    if (Stores.Users()?.currentUserId !== accountId) {
      showToast("error", "Your account changed. Reopen the local note to edit it.");
      close();
      return;
    }
    writeNote(accountId, userId, value);
    close();
  };
  return (
    <Root size="small" onClose={close}>
      <Header title="Local note" onClose={close} />
      <Content>
        <Layout>
          <Textarea
            label="Note"
            footer="Saved only in this browser or app for your account. Clearing local data removes it."
            placeholder="Write a private note about this user…"
            value={note}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setNote(event.currentTarget.value)
            }
            minRows={4}
            maxRows={12}
            maxLength={MAX_NOTE_LENGTH}
            showCharacterCount
            autoFocus
          />
        </Layout>
      </Content>
      <Footer>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="danger" disabled={!readNote(accountId, userId)} onClick={() => save("")}>
          Delete note
        </Button>
        <Button onClick={() => save(note)}>Save</Button>
      </Footer>
    </Root>
  );
}

export default definePlugin({
  name: "LocalNotes",
  description: "Adds private notes to user menus, saved only on this device for your account.",
  authors: [Contributor.Kairu],
  // This startup patch needs a reload to add or remove the menu entry.
  patches: [
    {
      find: '"ui.action-menu.user-context-menu.render-advanced-menu-group.copy-user-id-menu-item"',
      replacement: {
        match:
          // Influx expands \i into a JavaScript identifier pattern.
          // oxlint-disable-next-line no-useless-escape
          /(\(0,\i\.jsx\)\(\i(?:\.\i)?,\{user:(\i),onClose:(\i),"data-flx":"ui\.action-menu\.user-context-menu\.render-advanced-menu-group\.copy-user-id-menu-item"\}\))/,
        replace: "$1,$self.renderMenuItem($2,$3)",
      },
    },
  ],

  renderMenuItem(user: { id: string }, onClose: () => void) {
    const MenuItem = Components.MenuItem();
    if (!MenuItem || !Stores.Users()?.currentUserId) return null;
    return (
      <MenuItem
        onClick={() => {
          const accountId = Stores.Users()?.currentUserId;
          const modals = Modals();
          if (!accountId || !modals || !editorComponents()) {
            showToast("error", "Couldn't open local notes. Try updating Influx.");
            return;
          }
          onClose();
          modals.push(modals.modal(() => <NoteModal accountId={accountId} userId={user.id} />));
        }}
      >
        Local note
      </MenuItem>
    );
  },
});
