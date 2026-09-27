import { beforeEach, describe, it, mock } from "bun:test";
import assert from "node:assert/strict";

import * as common from "@webpack/common";
import type { ModuleFactory } from "@webpack/types";

import forceDeveloperMode from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";
import { errors, logger, pendingFor, resetPatching, run } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(forceDeveloperMode));

describe("ForceDeveloperMode", () => {
  it("makes isDeveloper true without staff or the 7-tap unlock", () => {
    // Excerpt of Fluxer's compiled DeveloperMode store.
    const storeModule = new Function(
      "return function(e,t,n){const a={A:{currentUser:null}};" +
        "e.exports=new class{constructor(){this.manuallyEnabled=!1}" +
        "get isDeveloper(){var e,t;return null!=(t=a.A.currentUser)&&null!=(e=t.isStaff)&&!!e.call(t)||this.manuallyEnabled}}}",
    )() as ModuleFactory;
    assert.equal(run(storeModule).isDeveloper, false);
    const patched = patchFactory(1, storeModule, pendingFor(forceDeveloperMode), logger);
    assert.deepEqual(errors, []);
    assert.equal(run(patched).isDeveloper, true);
  });
});

describe("ForceDeveloperMode staff", () => {
  it("makes only the current user staff, and only when the setting is on", () => {
    mock.module("@webpack/common", () => ({
      ...common,
      Stores: { ...common.Stores, Users: () => ({ currentUserId: "1" }) },
    }));
    // Excerpt of Fluxer's compiled UserRecord.
    const userModule = new Function(
      "return function(e,t,n){e.exports=class{constructor(e){this.id=e.id;this._isStaff=e.is_staff;this.flags=0}" +
        "isStaff(){var e;return null!=(e=this._isStaff)?e:(this.flags&1)!=0}}}",
    )() as ModuleFactory;
    const patched = patchFactory(1, userModule, pendingFor(forceDeveloperMode), logger);
    assert.deepEqual(errors, []);
    const User = run(patched);
    const store = forceDeveloperMode.settings.store as Record<string, unknown>;
    forceDeveloperMode.settings.pluginName = "ForceDeveloperMode";

    store.forceStaff = false;
    assert.equal(new User({ id: "1", is_staff: false }).isStaff(), false);
    store.forceStaff = true;
    assert.equal(new User({ id: "1", is_staff: false }).isStaff(), true);
    assert.equal(new User({ id: "2", is_staff: false }).isStaff(), false);
  });
});
