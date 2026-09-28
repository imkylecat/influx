import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import noBlockedMessages from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(noBlockedMessages));

describe("NoBlockedMessages", () => {
  it("drops blocked messages before createChannelStream groups them", () => {
    // Excerpt of Fluxer's compiled createChannelStream.
    const streamModule = compile(
      "function(e,t,n){const u={DIVIDER:0,MESSAGE:1};" +
        'const k={MESSAGE_GROUP_BLOCKED:"MESSAGE_GROUP_BLOCKED"};const s={r:(a,b)=>true};' +
        "function h(e){let t,g=[];return e.forEach(e=>{let A;if(!t||!(0,s.r)(t,e.timestamp)){g.push({type:u.DIVIDER}),t=e.timestamp}g.push({type:u.MESSAGE,id:e.id})}),g}" +
        "e.exports=h}",
    );
    const createStream = runPatched(pendingFor(noBlockedMessages), streamModule);
    const stream = createStream([
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
