import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { describeRemoval, diffSnapshots, snapshotFromReady } from "./snapshot";

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
});
