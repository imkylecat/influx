import assert from "node:assert/strict";
import { beforeEach, describe, it } from "bun:test";
import { canonicalizeMatch, patchFactory } from "../src/renderer/patcher/patchFactory";
import silentTyping from "../src/plugins/silentTyping";
import type { ModuleFactory, Patch } from "../src/renderer/webpack/types";

const typingModule = new Function(
  "return " +
    "function(e,t,n){class r{constructor(){this.sent=[]}postTyping(e){try{this.sent.push(e)}catch(t){console.error(`Failed to send typing indicator to channel ${e}:`,t)}}}" +
    "e.exports=new r}",
)() as ModuleFactory;

function run(factory: ModuleFactory): any {
  const module = { exports: {} as any };
  factory.call(module.exports, module, module.exports, (() => {}) as any);
  return module.exports;
}

const errors: unknown[][] = [];
const logger = { error: (...args: unknown[]) => errors.push(args) };

beforeEach(() => {
  errors.length = 0;
  (globalThis as any).Influx = { plugins: {} };
});

describe("canonicalizeMatch", () => {
  it("expands \\i to an identifier pattern", () => {
    const re = canonicalizeMatch(/postTyping\(\i\)/) as RegExp;
    assert.ok(re.test("postTyping(e)"));
    assert.ok(re.test("postTyping($a1)"));
    assert.ok(!re.test("postTyping(e.channelId)"));
  });

  it("leaves an escaped backslash followed by i alone", () => {
    assert.equal((canonicalizeMatch(/a\\i/) as RegExp).source, "a\\\\i");
  });
});

describe("patchFactory", () => {
  it("applies SilentTyping and consults $self at runtime", () => {
    const pending: Patch[] = silentTyping.patches.map((p) => ({ ...p, plugin: silentTyping.name }));
    let suppress = true;
    (globalThis as any).Influx.plugins.SilentTyping = { shouldSuppress: () => suppress };

    const patched = patchFactory(1, typingModule, pending, logger);
    assert.notEqual(patched, typingModule);
    assert.equal(pending.length, 0, "single-module patch is consumed");

    const sender = run(patched);
    sender.postTyping("123");
    assert.deepEqual(sender.sent, []);
    suppress = false;
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

  it("keeps `all` patches pending for other modules", () => {
    const pending: Patch[] = [
      {
        plugin: "X",
        all: true,
        find: "postTyping",
        replacement: { match: "this.sent=[]", replace: "this.sent=[1]" },
      },
    ];
    patchFactory(1, typingModule, pending, logger);
    assert.equal(pending.length, 1);
  });
});
