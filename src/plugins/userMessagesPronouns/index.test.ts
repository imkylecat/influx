import { beforeEach, describe, it, spyOn } from "bun:test";
import assert from "node:assert/strict";

import userMessagesPronouns from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(userMessagesPronouns));

const jsx =
  "(c,p)=>c===Influx.plugins.UserMessagesPronouns.Pronouns?p:typeof c==='string'?p.children??'copy':'time'";

describe("UserMessagesPronouns", () => {
  const timestamp = (suffix: string) =>
    `(0,d.jsxs)(eF.g,{date:r.timestamp,className:eQ.oL,"data-flx":"channel.user-message.message-timestamp${suffix}",children:[(0,d.jsx)("span",{className:eQ.BK,"aria-hidden":"true","data-flx":"channel.user-message.author-dash-separator${suffix}",children:" — "}),_]})`;
  const code =
    `function(e,t,n){const d={jsx:${jsx},jsxs:${jsx}},eF={g:0},eQ={oL:0,BK:0,AY:0,U6:0},_="now",r={id:"1",timestamp:0};` +
    `e.exports={headers:[[${timestamp("")}],[${timestamp("--2")}],[${timestamp("--3")}]],` +
    'CompactAuthorPrefix:function({message:e,author:t}){return[(0,d.jsxs)("span",{className:eQ.AY,"data-flx":"channel.compact-message-layout.compact-author-prefix.message-author-part",children:["name"]}),(0,d.jsxs)("span",{className:eQ.U6,"data-flx":"channel.compact-message-layout.compact-author-prefix.copy-only--2",children:[":"," "]})]}}}';
  const patched = () => runPatched(pendingFor(userMessagesPronouns).slice(0, 1), compile(code));

  it("adds the pronouns after the time in message headers", () => {
    assert.deepEqual(patched().headers, [
      ["time"],
      ["time", { message: { id: "1", timestamp: 0 } }],
      ["time", { message: { id: "1", timestamp: 0 } }],
    ]);
  });

  it("adds the pronouns after the name in compact mode", () => {
    assert.deepEqual(patched().CompactAuthorPrefix({ message: { id: "2" }, author: {} }), [
      ["name"],
      { message: { id: "2" } },
      [":", " "],
    ]);
  });

  it("refreshes the profiles Fluxer drops", () => {
    const code =
      "function(e,t,n){e.exports=new class{handleProfileInvalidate(e,t){this.calls.push('invalidate')}" +
      'handleProfileCreate(e){if(!e.userId)return void this.logger.warn("Attempted to set invalid profile:",e)}' +
      "handleProfilesClear(){this.calls.push('clear')}calls=[]}}";
    const calls: unknown[][] = [];
    const refreshProfiles = spyOn(userMessagesPronouns, "refreshProfiles").mockImplementation(
      (...values: unknown[]) => void calls.push(values),
    );
    try {
      const store = runPatched(pendingFor(userMessagesPronouns).slice(1), compile(code));
      store.handleProfileInvalidate("7", "5");
      store.handleProfilesClear();
      assert.deepEqual(calls, [["7"], []]);
      assert.deepEqual(store.calls, ["invalidate", "clear"]);
    } finally {
      refreshProfiles.mockRestore();
    }
  });
});
