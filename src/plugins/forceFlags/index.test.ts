import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import type { ModuleFactory } from "@webpack/types";

import forceFlags, { parseOverrides } from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";
import { errors, logger, pendingFor, resetPatching, run } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(forceFlags));

describe("ForceFlags", () => {
  const store = forceFlags.settings.store as Record<string, unknown>;
  beforeEach(() => {
    forceFlags.settings.pluginName = "ForceFlags";
  });

  it("parses overrides per ID", () => {
    const parsed = parseOverrides(" 1: +staff -SPAMMER; 2:+PARTNER, 64 ; nonsense");
    assert.deepEqual(parsed.get("1"), { add: ["STAFF"], remove: ["SPAMMER"] });
    assert.deepEqual(parsed.get("2"), { add: ["PARTNER"], remove: [] });
    assert.equal(parsed.size, 2);
  });

  it("overrides flags in Fluxer's UserRecord", () => {
    // Excerpt of Fluxer's compiled UserRecord constructor.
    const userModule = new Function(
      "return function(e,t,n){e.exports=class{constructor(e){var l;this.id=e.id,this.flags=e.flags,this.mentionFlags=null!=(l=e.mention_flags)?l:0}}}",
    )() as ModuleFactory;
    const patched = patchFactory(1, userModule, pendingFor(forceFlags), logger);
    assert.deepEqual(errors, []);
    const User = run(patched);
    store.userFlags = "1: +STAFF +PARTNER -SPAMMER; 2: +8";
    assert.equal(new User({ id: "1", flags: 64 }).flags, 1 | 4);
    assert.equal(new User({ id: "2", flags: 0 }).flags, 8);
    assert.equal(new User({ id: "3", flags: 64 }).flags, 64);
  });

  it("overrides features in Fluxer's GuildRecord", () => {
    // Excerpt of Fluxer's compiled GuildRecord constructor.
    const guildModule = new Function(
      "return function(e,t,n){e.exports=class{constructor(e){this.id=e.id,this.features=new Set(e.features),this.ownerId=e.owner_id}}}",
    )() as ModuleFactory;
    const patched = patchFactory(1, guildModule, pendingFor(forceFlags), logger);
    assert.deepEqual(errors, []);
    const Guild = run(patched);
    store.guildFeatures = "1: +VANITY_URL -DISCOVERABLE";
    assert.deepEqual(
      [...new Guild({ id: "1", features: ["DISCOVERABLE", "VERIFIED"] }).features],
      ["VERIFIED", "VANITY_URL"],
    );
    assert.deepEqual(
      [...new Guild({ id: "2", features: ["DISCOVERABLE"] }).features],
      ["DISCOVERABLE"],
    );
  });
});
