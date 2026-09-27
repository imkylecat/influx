import assert from "node:assert/strict";
import { beforeEach, describe, it } from "bun:test";
import type { ModuleFactory } from "@webpack/types";
import showMeYourName from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";
import { errors, logger, pendingFor, resetPatching, run } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(showMeYourName));

describe("ShowMeYourName", () => {
  it("adds the username after the cozy and compact author names", () => {
    const site = (flx: string) =>
      `(0,d.jsx)(tD,{user:v,message:r,guild:N,member:null!=O?O:void 0,className:eM.um,"data-flx":"${flx}"})`;
    const code =
      "return function(e,t,n){const d={jsx:(c,p)=>p.user.username},tD=0,eM={um:0},N=null,O=null;" +
      "const v={username:'kim'},r={};" +
      `e.exports=[${site("channel.user-message.message-username--2")},${site("channel.compact-message-layout.compact-author-prefix.message-username")}]}`;
    const module = new Function(code)() as ModuleFactory;
    const calls: unknown[] = [];
    const original = showMeYourName.renderUsername;
    showMeYourName.renderUsername = (author: any) => (calls.push(author.username), null);
    try {
      const patched = patchFactory(1, module, pendingFor(showMeYourName), logger);
      assert.deepEqual(errors, []);
      run(patched);
      assert.deepEqual(calls, ["kim", "kim"]);
    } finally {
      showMeYourName.renderUsername = original;
    }
  });
});
