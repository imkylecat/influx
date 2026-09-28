import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import silentTyping from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching());

describe("SilentTyping", () => {
  it("adds its button to the chat bar behind the GIF button's guard", () => {
    // Shape of Fluxer's TextareaButtons render, trimmed to the guarded button group.
    const buttonsModule = compile(
      'function(e){const o={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>props};e.exports=function({isMobile:b,showAllButtons:t}){return(0,o.jsxs)("div",{className:"buttons",ref:null,"data-flx":"channel.textarea.textarea-buttons.button-container-dense",children:[!b&&t&&"gif","emoji"]})}}',
    );
    (globalThis as any).Influx.plugins.SilentTyping = { ChatBarButton: "ChatBarButton" };

    const render = runPatched(pendingFor(silentTyping), buttonsModule);
    assert.deepEqual(render({ isMobile: false, showAllButtons: true }).children, [
      { type: "ChatBarButton", props: {} },
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
});
