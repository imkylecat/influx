import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import callTimer from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(callTimer));

describe("CallTimer", () => {
  it("adds the timer under the channel name, above the connection ID", () => {
    // Shape of Fluxer's voice panel, trimmed to the rows under the status.
    const panelModule = compile(
      "function(e,t,n){const o={jsx:(type,props)=>type===Influx.plugins.CallTimer.CallTimer?'timer':props['data-flx'],jsxs:(type,props)=>props},w_={Hd:'info',J3:'source',wt:'id'};" +
        'e.exports=(j,P)=>(0,o.jsxs)("div",{className:w_.Hd,"data-flx":"voice.voice-connection-status.voice-connection-status-inner.connection-info",children:[' +
        '(0,o.jsx)("div",{className:w_.J3,"data-flx":"voice.voice-connection-status.voice-connection-status-inner.channel-source-row"}),' +
        'j&&P&&(0,o.jsxs)("div",{className:w_.wt,"data-flx":"voice.voice-connection-status.voice-connection-status-inner.connection-id-row",children:[]})]})}',
    );
    const render = runPatched(pendingFor(callTimer), panelModule);
    assert.deepEqual(render(false, "").children, [
      "voice.voice-connection-status.voice-connection-status-inner.channel-source-row",
      "timer",
      false,
    ]);
    assert.equal(render(true, "abc").children[1], "timer");
    assert.equal(render(true, "abc").children[2].className, "id");
  });

  it("adds the timer to channel list items, before the user count", () => {
    // Shape of Fluxer's channel list item, trimmed to the badges beside the channel name.
    const itemModule = compile(
      "function(e,t,n){const i={jsx:(type,props)=>type===Influx.plugins.CallTimer.ChannelTimer?props:props['data-flx']},r={Ne:'count'},B=0;" +
        'e.exports=(t,t1,t3,t0,t5)=>[t5&&"badge",t1&&!(t3&&t0)&&null!=t.userLimit&&(0,i.jsx)("div",{className:r.Ne,"data-flx":"app.channel-item.voice-user-count",children:(0,i.jsx)(B,{userLimit:t.userLimit,"data-flx":"app.channel-item.voice-channel-user-count"})})]}',
    );
    const render = runPatched(pendingFor(callTimer), itemModule);
    assert.deepEqual(render({ id: "600", userLimit: 5 }, true, false, false, true), [
      "badge",
      { channelId: "600" },
      "app.channel-item.voice-user-count",
    ]);
    assert.deepEqual(render({ id: "601", userLimit: null }, false, false, false, false), [
      false,
      { channelId: "601" },
      false,
    ]);
  });
});
