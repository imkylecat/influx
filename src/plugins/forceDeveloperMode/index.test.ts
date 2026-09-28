import { beforeEach, describe, it, mock } from "bun:test";
import assert from "node:assert/strict";

import * as common from "@webpack/common";

import forceDeveloperMode from ".";
import {
  compile,
  pendingFor,
  resetPatching,
  run,
  runPatched,
} from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(forceDeveloperMode));

describe("ForceDeveloperMode", () => {
  it("makes isDeveloper true without staff or the 7-tap unlock", () => {
    // Excerpt of Fluxer's compiled DeveloperMode store.
    const storeModule = compile(
      "function(e,t,n){const a={A:{currentUser:null}};" +
        "e.exports=new class{constructor(){this.manuallyEnabled=!1}" +
        "get isDeveloper(){var e,t;return null!=(t=a.A.currentUser)&&null!=(e=t.isStaff)&&!!e.call(t)||this.manuallyEnabled}}}",
    );
    assert.equal(run(storeModule).isDeveloper, false);
    assert.equal(runPatched(pendingFor(forceDeveloperMode), storeModule).isDeveloper, true);
  });
});

describe("ForceDeveloperMode staff", () => {
  it("makes only the current user staff, and only when the setting is on", () => {
    void mock.module("@webpack/common", () => ({
      ...common,
      Stores: { ...common.Stores, Users: () => ({ currentUserId: "1" }) },
    }));
    // Excerpt of Fluxer's compiled UserRecord.
    const userModule = compile(
      "function(e,t,n){e.exports=class{constructor(e){this.id=e.id;this._isStaff=e.is_staff;this.flags=0}" +
        "isStaff(){var e;return null!=(e=this._isStaff)?e:(this.flags&1)!=0}}}",
    );
    const User = runPatched(pendingFor(forceDeveloperMode), userModule);
    const store = forceDeveloperMode.settings.store as Record<string, unknown>;

    store.forceStaff = false;
    assert.equal(new User({ id: "1", is_staff: false }).isStaff(), false);
    store.forceStaff = true;
    assert.equal(new User({ id: "1", is_staff: false }).isStaff(), true);
    assert.equal(new User({ id: "2", is_staff: false }).isStaff(), false);
  });
});
