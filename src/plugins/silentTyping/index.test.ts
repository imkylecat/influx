import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import silentTyping from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching());

describe("SilentTyping", () => {
  it("adds its button to the chat bar behind the GIF button's guard", () => {
    // Shape of Fluxer's TextareaButtons render, trimmed to the guarded button group.
    const buttonsModule = compile(
      'function(e){const o={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>props};e.exports=function({channelId:h,isMobile:b,showAllButtons:t}){return(0,o.jsxs)("div",{className:"buttons",ref:null,"data-flx":"channel.textarea.textarea-buttons.button-container-dense",children:[!b&&t&&"gif","emoji"]})}}',
    );
    (globalThis as any).Influx.plugins.SilentTyping = { ChatBarButton: "ChatBarButton" };

    const render = runPatched(pendingFor(silentTyping), buttonsModule);
    assert.deepEqual(render({ channelId: "10", isMobile: false, showAllButtons: true }).children, [
      { type: "ChatBarButton", props: { channelId: "10" } },
      "gif",
      "emoji",
    ]);
    assert.deepEqual(render({ isMobile: true, showAllButtons: true }).children, [
      false,
      false,
      "emoji",
    ]);
    assert.deepEqual(render({ isMobile: false, showAllButtons: false }).children, [
      false,
      false,
      "emoji",
    ]);
  });

  it("stays silent except in the channels chosen to show typing", () => {
    // Shape of Fluxer's RollingTypingSender, which posts the typing indicator.
    const senderModule = compile(
      "function(e){const posted=[];class Sender{postTyping(e){posted.push(e);try{}catch(t){console.error(`Failed to send typing indicator to channel ${e}:`,t)}}}e.exports={sender:new Sender,posted}}",
    );
    resetPatching(silentTyping);
    const store = silentTyping.settings.store;
    store.active = true;
    store.showInChannels = "10, 11";
    const { sender, posted } = runPatched(pendingFor(silentTyping), senderModule);
    for (const id of ["9", "10", "11", "1"]) sender.postTyping(id);
    assert.deepEqual(posted, ["10", "11"]);
    store.active = false;
    sender.postTyping("9");
    assert.deepEqual(posted, ["10", "11", "9"]);
  });
});
