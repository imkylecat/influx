import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import type { Patch } from "@webpack/types";

import silentTyping from "../../plugins/silentTyping";
import { canonicalizeMatch, patchFactory } from "./patchFactory";
import { compile, errors, logger, pendingFor, resetPatching, run } from "./testing";

const typingModule = compile(
  "function(e,t,n){class r{constructor(){this.sent=[]}postTyping(e){try{this.sent.push(e)}catch(t){console.error(`Failed to send typing indicator to channel ${e}:`,t)}}}" +
    "e.exports=new r}",
);

beforeEach(() => resetPatching());

describe("canonicalizeMatch", () => {
  it("expands \\i to an identifier pattern", () => {
    const pattern = canonicalizeMatch(/postTyping\(\i\)/);
    assert.ok(pattern.test("postTyping(e)"));
    assert.ok(pattern.test("postTyping($a1)"));
    assert.ok(!pattern.test("postTyping(e.channelId)"));
  });

  it("leaves an escaped backslash followed by i alone", () => {
    assert.equal(canonicalizeMatch(/a\\i/).source, "a\\\\i");
  });
});

describe("patchFactory", () => {
  it("applies SilentTyping and consults $self at runtime", () => {
    const pending = pendingFor(silentTyping);
    const store = { active: true };
    (globalThis as any).Influx.plugins.SilentTyping = { settings: { store } };

    const patched = patchFactory(1, typingModule, pending, logger);
    assert.notEqual(patched, typingModule);
    assert.deepEqual(
      pending.map((patch) => patch.find),
      ['"channel.textarea.textarea-buttons.button-container-dense"'],
      "single-module patch is consumed; the chat bar patch waits for its module",
    );

    const sender = run(patched);
    sender.postTyping("123");
    assert.deepEqual(sender.sent, []);
    store.active = false;
    sender.postTyping("456");
    assert.deepEqual(sender.sent, ["456"]);
    assert.deepEqual(errors, []);
  });

  it("returns the original factory when no patch matches", () => {
    const pending: Patch[] = [
      { plugin: "X", find: "not in this module", replacement: { match: "a", replace: "b" } },
    ];
    assert.equal(patchFactory(1, typingModule, pending, logger), typingModule);
    assert.equal(pending.length, 1, "unmatched patch stays pending");
  });

  it("rolls back a whole patch when one replacement has no effect", () => {
    const pending: Patch[] = [
      {
        plugin: "X",
        find: "postTyping",
        replacement: [
          { match: "this.sent=[]", replace: 'this.sent=["x"]' },
          { match: "does not exist", replace: "" },
        ],
      },
    ];
    const patched = patchFactory(1, typingModule, pending, logger);
    assert.equal(patched, typingModule);
    assert.equal(errors.length, 1);
  });

  it("rolls back a patch that produces invalid code but keeps earlier good ones", () => {
    const pending: Patch[] = [
      {
        plugin: "Good",
        find: "postTyping",
        replacement: { match: "this.sent=[]", replace: 'this.sent=["good"]' },
      },
      {
        plugin: "Bad",
        find: "postTyping",
        replacement: { match: "class r{", replace: "class r{{{" },
      },
    ];
    const sender = run(patchFactory(1, typingModule, pending, logger));
    assert.deepEqual(sender.sent, ["good"]);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /Bad failed/);
  });
});
