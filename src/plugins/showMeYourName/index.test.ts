import { beforeEach, describe, it, spyOn } from "bun:test";
import assert from "node:assert/strict";

import showMeYourName from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(showMeYourName));

describe("ShowMeYourName", () => {
  it("adds the username after the cozy and compact author names", () => {
    const site = (flx: string) =>
      `(0,d.jsx)(tD,{user:v,message:r,guild:N,member:null!=O?O:void 0,className:eM.um,"data-flx":"${flx}"})`;
    const code =
      "function(e,t,n){const d={jsx:(c,p)=>p.user.username},tD=0,eM={um:0},N=null,O=null;" +
      "const v={username:'kim'},r={};" +
      `e.exports=[${site("channel.user-message.message-username--2")},${site("channel.compact-message-layout.compact-author-prefix.message-username")}]}`;
    const calls: unknown[] = [];
    const renderUsername = spyOn(showMeYourName, "renderUsername").mockImplementation(
      (author: any) => (calls.push(author.username), null),
    );
    try {
      runPatched(pendingFor(showMeYourName), compile(code));
      assert.deepEqual(calls, ["kim", "kim"]);
    } finally {
      renderUsername.mockRestore();
    }
  });
});
