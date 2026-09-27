import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import relationshipNotifier from ".";

describe("RelationshipNotifier while away", () => {
  it("wraps Fluxer's gateway handlers without changing what they receive", () => {
    const seen: unknown[] = [];
    const registry = new Map<string, (data: any, context: unknown) => void>([
      ["READY", (data, context) => seen.push(["READY", data, context])],
      ["MESSAGE_CREATE", (data) => seen.push(["MESSAGE_CREATE", data])],
    ]);
    const original = registry.get("MESSAGE_CREATE");
    relationshipNotifier.wrapGatewayHandlers(registry);
    assert.equal(registry.get("MESSAGE_CREATE"), original, "unrelated events are left alone");
    registry.get("READY")!({ user: { id: "me" } }, "ctx");
    assert.deepEqual(seen, [["READY", { user: { id: "me" } }, "ctx"]]);
  });
});
