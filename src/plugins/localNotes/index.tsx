import definePlugin from "@api/Plugins";
import { definePluginSettings, getPluginData, saveSettings, useSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Components, findIcon, Modals, React, showToast, Stores } from "@webpack/common";
import type { ComponentType } from "react";

export const MAXIMUM_NOTE_LENGTH = 4000;

const settings = definePluginSettings({
  showOnProfiles: {
    type: "boolean",
    description: "Show the local note on user profiles, under Fluxer's own note.",
    default: true,
  },
});

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
  if (note.trim()) notes[userId] = note.slice(0, MAXIMUM_NOTE_LENGTH);
  else delete notes[userId];
  if (Object.keys(notes).length) accounts[accountId] = notes;
  else delete accounts[accountId];
  data.notes = accounts;
  saveSettings();
}

function saveNote(accountId: string, userId: string, note: string): void {
  if (Stores.Users()?.currentUserId === accountId) writeNote(accountId, userId, note);
  else showToast("error", "Your account changed. Reopen the local note to edit it.");
}

function ProfileNote({ userId, Editor }: { userId: string; Editor: ComponentType<any> }) {
  useSettings();
  const accountId = Stores.Users()?.currentUserId;
  if (!settings.store.showOnProfiles || !accountId) return null;
  return (
    <Editor
      userId={userId}
      initialNote={readNote(accountId, userId)}
      influxNote={{
        label: "Local note",
        placeholder: "Click to add a local note",
        maximumLength: MAXIMUM_NOTE_LENGTH,
        save: (note: string) => saveNote(accountId, userId, note),
      }}
    />
  );
}

function NoteModal({ accountId, userId }: { accountId: string; userId: string }) {
  const [note, setNote] = React.useState(() => readNote(accountId, userId));
  const close = () => Modals()?.pop();
  const save = (value: string) => {
    saveNote(accountId, userId, value);
    close();
  };
  return (
    <Components.ModalRoot size="small" onClose={close}>
      <Components.ModalHeader title="Local note" onClose={close} />
      <Components.ModalContent>
        <Components.ModalContentLayout>
          <Components.Textarea
            label="Note"
            footer={
              <Components.ModalDescription>
                Saved only in this browser or app for your account. Clearing local data removes it.
              </Components.ModalDescription>
            }
            placeholder="Write a private note about this user…"
            value={note}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setNote(event.currentTarget.value)
            }
            minRows={4}
            maxRows={12}
            maxLength={MAXIMUM_NOTE_LENGTH}
            showCharacterCount
            autoFocus
          />
        </Components.ModalContentLayout>
      </Components.ModalContent>
      <Components.ModalFooter>
        <Components.Button variant="secondary" onClick={close}>
          Cancel
        </Components.Button>
        <Components.Button
          variant="danger"
          disabled={!readNote(accountId, userId)}
          onClick={() => save("")}
        >
          Delete note
        </Components.Button>
        <Components.Button onClick={() => save(note)}>Save</Components.Button>
      </Components.ModalFooter>
    </Components.ModalRoot>
  );
}

export default definePlugin({
  name: "LocalNotes",
  description:
    "Adds private notes to user menus and profiles, saved only on this device for your account.",
  authors: [Contributor.Kairu],
  settings,
  patches: [
    {
      find: '"user.user-profile-modal.user-note-editor.div"',
      replacement: [
        {
          match: /\(\{userId:\i,initialNote:\i,autoFocus:\i,noteRef:\i(?=\}\)=>)/,
          replace: "$&,influxNote:influxNote",
        },
        {
          match:
            /("data-flx":"user\.user-profile-modal\.user-note-editor\.span",children:)(\(0,\i\.jsx\)\(\i\.\i,\{[^{}]*\}\))/,
          replace: "$1influxNote?influxNote.label:$2",
        },
        {
          match:
            /("aria-label":)(\i\._\(\i\))(,className:[^{}]{0,120}?,maxLength:)(\d+)(?=,maxRows:)/,
          replace: "$1(influxNote?influxNote.label:$2)$3influxNote?influxNote.maximumLength:$4",
        },
        {
          match: /(onBlur:\(\)=>\{\i!==\i\.current\.note&&)(\i\.\i\(\i,(\i)\))/,
          replace: "$1(influxNote?influxNote.save($3):$2)",
        },
        {
          match: /(placeholder:\i\?void 0:)(\i\._\(\i\))(?=,value:)/,
          replace: "$1(influxNote?influxNote.placeholder:$2)",
        },
        {
          match:
            /\(0,\i\.jsx\)\((\i),\{userId:(\i\.id),initialNote:\i,autoFocus:\i,noteRef:\i,"data-flx":"user\.user-profile-modal\.profile-content\.user-note-editor"\}\)/,
          replace: "$&,$self.renderProfileNote($2,$1)",
        },
      ],
    },
    {
      find: '"ui.action-menu.user-context-menu.render-advanced-menu-group.copy-user-id-menu-item"',
      replacement: {
        match:
          /(\(0,\i\.jsx\)\(\i(?:\.\i)?,\{user:(\i),onClose:(\i),"data-flx":"ui\.action-menu\.user-context-menu\.render-advanced-menu-group\.copy-user-id-menu-item"\}\))/,
        replace: "$1,$self.renderMenuItem($2,$3)",
      },
    },
  ],

  renderProfileNote(userId: string, Editor: ComponentType<any>) {
    return (
      <Components.ErrorBoundary fallback={null}>
        <ProfileNote userId={userId} Editor={Editor} />
      </Components.ErrorBoundary>
    );
  },

  renderMenuItem(user: { id: string }, onClose: () => void) {
    const NoteIcon = findIcon("NotePencilIcon");
    if (!Stores.Users()?.currentUserId) return null;
    return (
      <Components.MenuItem
        icon={NoteIcon && <NoteIcon size="1rem" weight="fill" />}
        onClick={() => {
          const accountId = Stores.Users()?.currentUserId;
          const modals = Modals();
          if (!accountId || !modals) {
            showToast("error", "Couldn't open local notes. Try updating Influx.");
            return;
          }
          onClose();
          modals.push(modals.modal(() => <NoteModal accountId={accountId} userId={user.id} />));
        }}
      >
        Local note
      </Components.MenuItem>
    );
  },
});
