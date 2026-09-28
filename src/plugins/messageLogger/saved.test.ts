import { describe, it } from "bun:test";
import assert from "node:assert/strict";

import type { MessageWire } from "@webpack/fluxer";

import { compareIds, mergeDeleted, publicUser, readSavedLogs } from "./saved";

const wire = (id: string): MessageWire => ({
  id,
  channel_id: "c",
  author: { id: "1", username: "alex" },
});
const ids = (messages: MessageWire[]) => messages.map((message) => message.id);
// Fluxer loads pages newest first.
const page = (...loaded: string[]) => ({ channelId: "c", messages: loaded.map(wire) });
const saved = ["5", "15", "25", "35", "100"].map(wire);

describe("MessageLogger saved logs", () => {
  it("orders IDs as numbers", () => {
    assert.ok(compareIds("9", "10") < 0);
    assert.ok(compareIds("1513407003270057984", "999999999999999999") > 0);
    assert.equal(compareIds("42", "42"), 0);
  });

  it("restores everything in a page that holds the whole channel", () => {
    assert.deepEqual(ids(mergeDeleted(page("30", "20", "10"), saved, {})), [
      "100",
      "35",
      "30",
      "25",
      "20",
      "15",
      "10",
      "5",
    ]);
    assert.deepEqual(ids(mergeDeleted(page(), saved, {})), ["100", "35", "25", "15", "5"]);
  });

  it("leaves messages past the end of a page to the page that follows", () => {
    const newest = { ...page("30", "20"), hasMoreBefore: true };
    assert.deepEqual(ids(mergeDeleted(newest, saved, {})), ["100", "35", "30", "25", "20"]);
    const around = { ...page("30", "20"), hasMoreBefore: true, hasMoreAfter: true };
    assert.deepEqual(ids(mergeDeleted(around, saved, {})), ["30", "25", "20"]);
    assert.equal(mergeDeleted({ ...page(), hasMoreBefore: true }, saved, {}).length, 0);
  });

  it("fills the gap between a page and the messages on screen", () => {
    const older = { ...page("12", "10"), isBefore: true, hasMoreBefore: true };
    assert.deepEqual(ids(mergeDeleted(older, saved, { oldest: "20", newest: "30" })), [
      "15",
      "12",
      "10",
    ]);
    const oldest = { ...page("12", "10"), isBefore: true };
    assert.deepEqual(ids(mergeDeleted(oldest, saved, { oldest: "20", newest: "30" })), [
      "15",
      "12",
      "10",
      "5",
    ]);
    const newer = { ...page("40", "32"), isAfter: true };
    assert.deepEqual(ids(mergeDeleted(newer, saved, { oldest: "20", newest: "30" })), [
      "100",
      "40",
      "35",
      "32",
    ]);
  });

  it("keeps Fluxer's copy of a message it still sends", () => {
    const loaded = page("25", "20");
    const merged = mergeDeleted(loaded, [{ ...wire("25"), flags: 1 << 30 }], {});
    assert.deepEqual(merged, loaded.messages);
  });

  it("keeps only the public details of a user", () => {
    const user = { id: "1", username: "alex", avatar: null, email: "alex@example.com", bio: "Hi" };
    assert.deepEqual(publicUser(user), { id: "1", username: "alex", avatar: null });
  });

  it("drops saved logs it can't read", () => {
    const edit = { content: "before", timestamp: new Date(0) };
    assert.deepEqual(readSavedLogs(undefined), { deleted: [], edits: [] });
    assert.deepEqual(readSavedLogs({ deleted: "no", edits: {} }), { deleted: [], edits: [] });
    assert.deepEqual(
      readSavedLogs({
        deleted: [wire("1"), null, { id: 2 }, { id: "3" }],
        edits: [["1", [edit]], ["2", [{ content: "before", timestamp: "then" }]], [3, []], null],
      }),
      { deleted: [wire("1")], edits: [["1", [edit]]] },
    );
  });
});
