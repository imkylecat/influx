import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import forceFlags, { parseOverrides, toggleOverride } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(forceFlags));

describe("ForceFlags", () => {
  const store = forceFlags.settings.store as Record<string, unknown>;

  it("parses overrides per ID", () => {
    const parsed = parseOverrides(" 1: +staff -SPAMMER; 2:+PARTNER, 64 ; nonsense");
    assert.deepEqual(parsed.get("1"), { add: ["STAFF"], remove: ["SPAMMER"] });
    assert.deepEqual(parsed.get("2"), { add: ["PARTNER"], remove: [] });
    assert.equal(parsed.size, 2);
  });

  it("toggles one override without touching the others", () => {
    const text = "1: +STAFF -SPAMMER; 2: +PARTNER";
    assert.equal(toggleOverride(text, "1", "STAFF", false), "1: -SPAMMER; 2: +PARTNER");
    assert.equal(toggleOverride(text, "1", "SPAMMER", true), "1: +STAFF; 2: +PARTNER");
    assert.equal(toggleOverride(text, "2", "PARTNER", false), "1: +STAFF -SPAMMER");
    assert.equal(
      toggleOverride(text, "1", "BUG_HUNTER", true),
      "1: +STAFF +BUG_HUNTER -SPAMMER; 2: +PARTNER",
    );
    assert.equal(toggleOverride("", "3", "VERIFIED", false), "3: -VERIFIED");
  });

  it("adds Force flags after Copy User ID in each user menu", () => {
    const stub = { ...forceFlags, renderUserMenu: (user: unknown) => ({ forceFlags: user }) };
    resetPatching(stub);
    for (const menu of [
      "ui.action-menu.user-context-menu.render-advanced-menu-group",
      "ui.action-menu.guild-member-context-menu",
      "ui.action-menu.group-dm-context-menu.group-dm-member-context-menu",
    ]) {
      // Excerpt of the menu's last group in Fluxer's compiled code.
      const menuModule = compile(
        `function(e,t,n){const i={jsx:(type,props)=>props.children??type};e.exports=(u,c)=>(0,i.jsx)("group",{children:[(0,i.jsx)("copy",{user:u,onClose:c,"data-flx":"${menu}.copy-user-id-menu-item"}),"after"]})}`,
      );
      const user = { id: "1" };
      assert.deepEqual(
        runPatched(pendingFor(forceFlags), menuModule)(user, () => {}),
        ["copy", { forceFlags: user }, "after"],
      );
    }
  });

  it("adds Force features to the end of the server menu", () => {
    const stub = {
      ...forceFlags,
      renderServerMenu: (guild: unknown) => ({ forceFeatures: guild }),
    };
    resetPatching(stub);
    // Excerpt of Fluxer's compiled GuildContextMenu.
    const menuModule = compile(
      'function(e,t,n){const i={jsx:(type,props)=>props.children??type,jsxs:(type,props)=>props.children,Fragment:"fragment"};e.exports=({guild:g,onClose:c})=>(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("renderer",{"data-flx":"ui.action-menu.guild-context-menu.data-menu-renderer"}),(0,i.jsx)("group",{"data-flx":"ui.action-menu.guild-context-menu.menu-group",children:(0,i.jsx)("mute",{guild:g,onClose:c,"data-flx":"ui.action-menu.guild-context-menu.mute-community-menu-item"})})]})}',
    );
    const guild = { id: "1" };
    assert.deepEqual(runPatched(pendingFor(forceFlags), menuModule)({ guild, onClose: () => {} }), [
      "renderer",
      "mute",
      { forceFeatures: guild },
    ]);
  });

  it("overrides flags in Fluxer's UserRecord, even on existing users", () => {
    // Excerpt of Fluxer's compiled UserRecord.
    const userModule = compile(
      'function(e,t,n){function c(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}e.exports=class{constructor(e){var l;c(this,"id",void 0),c(this,"flags",void 0),this.id=e.id,this.flags=e.flags,this.mentionFlags=null!=(l=e.mention_flags)?l:0}withUpdates(e){var g;return new this.constructor({id:this.id,flags:null!=(g=e.flags)?g:this.flags,mention_flags:"mention_flags"in e?e.mention_flags:this.mentionFlags||void 0})}toJSON(){return{id:this.id,flags:this.flags,mention_flags:this.mentionFlags||void 0}}}}',
    );
    const User = runPatched(pendingFor(forceFlags), userModule);
    store.userFlags = "1: +STAFF +PARTNER -SPAMMER; 2: +8";
    const user = new User({ id: "1", flags: 64 });
    assert.equal(user.flags, 1 | 4);
    assert.equal(new User({ id: "2", flags: 0 }).flags, 8);
    assert.equal(new User({ id: "3", flags: 64 }).flags, 64);
    store.userFlags = "1: +STAFF";
    assert.equal(user.flags, 1 | 64);
    assert.equal(user.toJSON().flags, 64);
    assert.equal(user.withUpdates({}).flags, 1 | 64);
    store.userFlags = "";
    assert.equal(user.withUpdates({}).flags, 64);
  });

  it("overrides features in Fluxer's GuildRecord", () => {
    // Excerpt of Fluxer's compiled GuildRecord constructor.
    const guildModule = compile(
      "function(e,t,n){e.exports=class{constructor(e){this.id=e.id,this.features=new Set(e.features),this.ownerId=e.owner_id}}}",
    );
    const Guild = runPatched(pendingFor(forceFlags), guildModule);
    store.serverFeatures = "1: +VANITY_URL -DISCOVERABLE";
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
