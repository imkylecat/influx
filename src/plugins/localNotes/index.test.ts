import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";

import localNotes, { MAXIMUM_NOTE_LENGTH, readNote, writeNote } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

describe("LocalNotes", () => {
  beforeEach(() => {
    delete getPluginData("LocalNotes").notes;
  });

  it("keeps notes separate by account and user, and preserves multiline text", () => {
    writeNote("1", "10", "First line\nSecond line");
    writeNote("2", "10", "Different account");
    writeNote("1", "20", "Different user");
    assert.equal(readNote("1", "10"), "First line\nSecond line");
    assert.equal(readNote("2", "10"), "Different account");
    assert.equal(readNote("1", "20"), "Different user");
    assert.equal(readNote("3", "10"), "");
    // The settings payload can be saved and reloaded as JSON.
    getPluginData("LocalNotes").notes = JSON.parse(
      JSON.stringify(getPluginData("LocalNotes").notes),
    );
    assert.equal(readNote("1", "10"), "First line\nSecond line");
  });

  it("updates and deletes only the selected note", () => {
    writeNote("1", "10", "Old");
    writeNote("1", "20", "Keep");
    writeNote("1", "10", "New");
    assert.equal(readNote("1", "10"), "New");
    writeNote("1", "10", " \n ");
    assert.equal(readNote("1", "10"), "");
    assert.equal(readNote("1", "20"), "Keep");
    writeNote("1", "20", "");
    assert.deepEqual(getPluginData("LocalNotes").notes, {});
  });

  it("handles malformed stored values and enforces the length limit", () => {
    getPluginData("LocalNotes").notes = { "1": { "10": 123 }, "2": null };
    assert.equal(readNote("1", "10"), "");
    assert.equal(readNote("2", "10"), "");
    writeNote("2", "10", "x".repeat(MAXIMUM_NOTE_LENGTH + 1));
    assert.equal(readNote("2", "10").length, MAXIMUM_NOTE_LENGTH);
    assert.throws(() => writeNote("", "10", "No account"));
    assert.throws(() => writeNote("1", "__proto__", "Invalid user"));
  });

  it("adds the local action beside Copy User ID without replacing it", () => {
    const factory = compile(
      'function(module){const i={jsx:(type,props)=>({type,props})},I={K:"copy"};module.exports=(e,t)=>[(0,i.jsx)(I.K,{user:e,onClose:t,"data-flx":"ui.action-menu.user-context-menu.render-advanced-menu-group.copy-user-id-menu-item"})]}',
    );
    resetPatching({
      ...localNotes,
      renderMenuItem: (user: unknown, onClose: unknown) => ({ user, onClose }),
    });
    const pending = pendingFor(localNotes);
    const renderItems = runPatched(pending, factory);
    assert.equal(pending.length, 1, "only the profile patch is left");
    const user = { id: "10" };
    const close = () => {};
    const items = renderItems(user, close);
    assert.equal(items[0].type, "copy");
    assert.deepEqual(items[1], { user, onClose: close });
  });

  it("shows a second note editor on profiles that saves locally", () => {
    // Shape of Fluxer's compiled UserNoteEditor and the ProfileContent that renders it.
    const factory = compile(
      "function(module){const saved=[],i={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},$={x6:'Trans'},r={_:e=>e.message},ea={h:'textarea'},eo={y:(e,t)=>saved.push([e,t])},H={$:(...e)=>e.join(' ')},D={},s=!1,m={current:{note:''}},l=()=>{};" +
        'let el={id:"KiJn9B",message:"Note"},eu={id:"hx3d1y",message:"Click to add a note"},' +
        'ec=(({userId:e,initialNote:t,autoFocus:n,noteRef:a})=>{let u=t;return(0,i.jsxs)("div",{className:D.ZV,"data-flx":"user.user-profile-modal.user-note-editor.div",children:[(0,i.jsx)("span",{className:D.xu,"data-flx":"user.user-profile-modal.user-note-editor.span",children:(0,i.jsx)($.x6,{id:"KiJn9B",message:"Note"})}),(0,i.jsx)(ea.h,{ref:a,"aria-label":r._(el),className:(0,H.$)(D.tb,D._j,s?D.jd:D.EN),maxLength:256,maxRows:8,minRows:2,onBlur:()=>{u!==m.current.note&&eo.y(e,u),l(!1)},placeholder:s?void 0:r._(eu),value:u,"data-flx":"user.user-profile-modal.user-note-editor.textarea-autosize.set-note"})]})});' +
        'let ep=({user:t,userNote:n,autoFocusNote:a,noteRef:r})=>[(0,i.jsx)(ec,{userId:t.id,initialNote:n,autoFocus:a,noteRef:r,"data-flx":"user.user-profile-modal.profile-content.user-note-editor"})];' +
        "module.exports={ProfileContent:ep,saved}}",
    );
    resetPatching({
      ...localNotes,
      renderProfileNote: (userId: string, Editor: unknown) => ({ userId, Editor }),
    });
    const { ProfileContent, saved } = runPatched(pendingFor(localNotes), factory);
    const [native, local] = ProfileContent({ user: { id: "10" }, userNote: "Server note" });
    assert.equal(local.userId, "10");
    assert.equal(local.Editor, native.type);

    const [label, field] = native.type({ userId: "10", initialNote: "Server note" }).props.children;
    assert.equal(label.props.children.type, "Trans");
    assert.equal(field.props.maxLength, 256);
    assert.equal(field.props.placeholder, "Click to add a note");
    field.props.onBlur();
    assert.deepEqual(saved, [["10", "Server note"]]);

    const notes: string[] = [];
    const influxNote = {
      label: "Local note",
      placeholder: "Click to add a local note",
      maximumLength: MAXIMUM_NOTE_LENGTH,
      save: (note: string) => notes.push(note),
    };
    const [localLabel, localField] = local.Editor({
      userId: "10",
      initialNote: "Only here",
      influxNote,
    }).props.children;
    assert.equal(localLabel.props.children, "Local note");
    assert.equal(localField.props["aria-label"], "Local note");
    assert.equal(localField.props.maxLength, MAXIMUM_NOTE_LENGTH);
    assert.equal(localField.props.placeholder, "Click to add a local note");
    localField.props.onBlur();
    assert.deepEqual(notes, ["Only here"]);
    assert.equal(saved.length, 1, "the local note is never sent to Fluxer");
  });
});
