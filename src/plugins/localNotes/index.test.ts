import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import type { ModuleFactory } from "@webpack/types";

import localNotes, { MAXIMUM_NOTE_LENGTH, readNote, writeNote } from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";

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
    const factory = new Function(
      'return function(module){const i={jsx:(type,props)=>({type,props})},I={K:"copy"};module.exports=(e,t)=>[(0,i.jsx)(I.K,{user:e,onClose:t,"data-flx":"ui.action-menu.user-context-menu.render-advanced-menu-group.copy-user-id-menu-item"})]}',
    )() as ModuleFactory;
    const errors: unknown[] = [];
    const pending = localNotes.patches.map((patch) => ({ ...patch, plugin: localNotes.name }));
    const patched = patchFactory(1, factory, pending, {
      error: (...values) => errors.push(values),
    });
    assert.notEqual(patched, factory);
    assert.deepEqual(errors, []);
    assert.equal(pending.length, 0);
    const previous = (globalThis as any).Influx;
    try {
      (globalThis as any).Influx = {
        plugins: {
          LocalNotes: { renderMenuItem: (user: unknown, onClose: unknown) => ({ user, onClose }) },
        },
      };
      const module = { exports: null as any };
      patched(module as any, {}, (() => {}) as any);
      const user = { id: "10" };
      const close = () => {};
      const items = module.exports(user, close);
      assert.equal(items[0].type, "copy");
      assert.deepEqual(items[1], { user, onClose: close });
    } finally {
      (globalThis as any).Influx = previous;
    }
  });
});
