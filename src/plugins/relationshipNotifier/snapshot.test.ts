import { describe, it } from "bun:test";
import assert from "node:assert/strict";

import { describeRemoval, diffSnapshots, groupName, snapshotFromReady } from "./snapshot";

describe("RelationshipNotifier while away", () => {
  it("reports friends, requests, and servers that disappeared between sessions", () => {
    const before = snapshotFromReady({
      relationships: [
        { id: "1", type: 1, user: { username: "alex", global_name: "Alex" } },
        { id: "2", type: 3, user: { username: "sam" } },
        { id: "3", type: 4, user: { username: "kim" } },
        { id: "4", type: 1, user: { username: "jo" } },
      ],
      guilds: [
        { id: "g1", properties: { name: "Kept" } },
        { id: "g2", properties: { name: "Gone" } },
        { id: "g3", unavailable: true },
      ],
    });
    const after = snapshotFromReady(
      {
        // sam's request became a friendship, jo was blocked: neither is a removal.
        relationships: [
          { id: "2", type: 1, user: { username: "sam" } },
          { id: "4", type: 2, user: { username: "jo" } },
        ],
        guilds: [
          { id: "g1", properties: { name: "Kept" } },
          { id: "g3", unavailable: true },
        ],
      },
      before,
    );
    assert.deepEqual(
      diffSnapshots(before, after).map((removal) => describeRemoval(removal, true)),
      [
        "Alex (@alex) removed you as a friend while you were away.",
        "@kim declined your friend request while you were away.",
        "You were removed from Gone while you were away.",
      ],
    );
  });

  it("reports group chats that disappeared, but not direct messages", () => {
    const user = { id: "me" };
    const before = snapshotFromReady({
      user,
      private_channels: [
        { id: "c1", type: 3, name: " Book club " },
        { id: "c2", type: 3, recipients: [{ id: "1", global_name: "Alex" }, { id: "me" }] },
        { id: "c3", type: 3, name: "Kept" },
        { id: "c4", type: 1, recipients: [{ id: "2", username: "sam" }] },
      ],
    });
    const after = snapshotFromReady({ user, private_channels: [{ id: "c3", type: 3 }] }, before);
    assert.deepEqual(
      diffSnapshots(before, after).map((removal) => describeRemoval(removal, true)),
      [
        "You were removed from Book club while you were away.",
        "You were removed from the group chat with Alex while you were away.",
      ],
    );
    assert.equal(
      describeRemoval({ kind: "group", id: "c5", name: null }, false),
      "You're no longer in a group chat.",
    );
  });

  it("doesn't report group chats against a snapshot saved before they were tracked", () => {
    const before = snapshotFromReady({});
    const after = snapshotFromReady({ private_channels: [] }, before);
    assert.equal(before.groups, undefined);
    assert.deepEqual(diffSnapshots(before, after), []);
    assert.deepEqual(diffSnapshots({ ...before, groups: { c1: "Gone" } }, before), []);
  });

  it("names an unnamed group after its members, as Fluxer does up to four", () => {
    const recipients = ["1", "2", "3", "4", "5"].map((id) => ({ id, username: `user${id}` }));
    assert.equal(
      groupName({ id: "c1", type: 3, name: "", recipients: recipients.slice(0, 2) }, "9"),
      "the group chat with user1, user2",
    );
    assert.equal(groupName({ id: "c1", type: 3, recipients }, "9"), null);
    assert.equal(groupName({ id: "c1", type: 3, recipients: [{ id: "9" }] }, "9"), null);
  });
});
