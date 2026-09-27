import assert from "node:assert/strict";
import { beforeEach, describe, it } from "bun:test";
import type { ModuleFactory } from "@webpack/types";
import noBlockedMessages from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";
import { errors, logger, pendingFor, resetPatching, run } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(noBlockedMessages));

describe("NoBlockedMessages", () => {
  it("drops blocked messages before createChannelStream groups them", () => {
    // Excerpt of Fluxer's compiled createChannelStream.
    const streamModule = new Function(
      "return function(e,t,n){const u={DIVIDER:0,MESSAGE:1};" +
        'const k={MESSAGE_GROUP_BLOCKED:"MESSAGE_GROUP_BLOCKED"};const s={r:(a,b)=>true};' +
        "function h(e){let t,g=[];return e.forEach(e=>{let A;if(!t||!(0,s.r)(t,e.timestamp)){g.push({type:u.DIVIDER}),t=e.timestamp}g.push({type:u.MESSAGE,id:e.id})}),g}" +
        "e.exports=h}",
    )() as ModuleFactory;
    const patched = patchFactory(1, streamModule, pendingFor(noBlockedMessages), logger);
    assert.deepEqual(errors, []);
    const stream = run(patched)([
      { id: "1", timestamp: 1 },
      { id: "2", timestamp: 2, blocked: true },
      { id: "3", timestamp: 3, referencedMessage: { blocked: true } },
    ]);
    assert.deepEqual(
      stream.filter((item: any) => item.id).map((item: any) => item.id),
      ["1", "3"],
      "replies stay unless hideReplies is on",
    );
  });
});
