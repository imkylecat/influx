import { afterEach, beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import { Stores } from "@webpack/common";
import type { FluxerMessage } from "@webpack/fluxer";

import uwuifier, { uwuify } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

const random = Math.random;

beforeEach(() => {
  resetPatching(uwuifier);
  delete getPluginData(uwuifier.name).uwuEveryMessage;
});

afterEach(() => {
  Math.random = random;
});

describe("UwUifier", () => {
  it("replaces words and letters, stutters, and adds endings", () => {
    Math.random = () => 0.9;
    assert.equal(
      uwuify("Hello world, what a small llama.\n"),
      "hewwo wowwd, (ˆ ﻌ ˆ)♡ nyani a smow wwama. (ˆ ﻌ ˆ)♡\n",
    );
    Math.random = () => 0;
    assert.equal(uwuify("I love cute cats! Really"), "i w-wuv k-kawaii~ c-cats! rawr x3 w-weawwy");
  });

  it("adds /uwuify after /spoiler with the same message option", () => {
    // Shape of Fluxer's compiled useCommands list.
    const commandsModule = compile(
      'function(e){const D=[];e.exports=e=>[{type:"simple",name:"/tableflip",content:"flip",description:e._("flip")},' +
        '{type:"action",name:"/spoiler",description:e._("spoiler"),options:[{name:"message",description:e._("message"),type:"string",required:!0,allowEmpty:!1,choices:D}]},' +
        '{type:"action",name:"/tts",description:e._("tts"),options:[{name:"message",description:e._("message"),type:"string",required:!0,allowEmpty:!1,choices:D}]}]}',
    );
    const commands = runPatched(
      pendingFor(uwuifier),
      commandsModule,
    )({ _: (text: string) => text });
    assert.deepEqual(
      commands.map((command: { name: string }) => command.name),
      ["/tableflip", "/spoiler", "/uwuify", "/tts"],
    );
    assert.deepEqual(commands[2], {
      type: "action",
      name: "/uwuify",
      description: "Uwuifies your message.",
      options: commands[1].options,
    });
  });

  it("uwuifies the /uwuify command and, when chosen, every sent message", () => {
    // Excerpts of Fluxer's compiled command resolver, useTextareaSubmit and useMessageSubmission.
    const textareaModule = compile(
      'function(e){const M={useCallback:e=>e},aR=()=>!0,aB=(e,t)=>e[t],_=e=>e,aw={ls:e=>e},iT={error(){}};try{}catch(e){iT.error("Failed to execute command",e)}' +
        'function resolve(t,n){if("/me"===t||"/spoiler"===t||"/tts"===t){if(!aR(n,["message"]))return null;let e=aB(n,"message",!1);return null==e?null:"/me"===t?{type:"me",content:e}:"/spoiler"===t?{type:"spoiler",content:e}:{type:"tts",content:e}}return null}' +
        'function submit(I,A,N){if("me"===I.type||"spoiler"===I.type){let e=_(N);if(null!==A){let t=_(I.content);e="me"===I.type?`_${t}_`:`||${t}||`}else e=aw.ls(e);return e}return N}' +
        "e.exports={resolve,submit,sendMessage:(0,M.useCallback)((i,l,o=[],r,s)=>{var c;return i},[])}}",
    );
    const { resolve, submit, sendMessage } = runPatched(pendingFor(uwuifier), textareaModule);
    const command = resolve("/uwuify", { message: "Hello" });
    assert.deepEqual(command, { type: "uwuify", content: "Hello" });
    assert.equal(submit(command, {}, "/uwuify Hello"), "hewwo");
    assert.equal(submit(resolve("/me", { message: "Hello" }), {}, "/me Hello"), "_Hello_");
    assert.equal(sendMessage("Hello", false), "Hello");

    uwuifier.settings.store.uwuEveryMessage = true;
    assert.equal(submit(command, {}, "/uwuify Hello"), "Hello");
    assert.equal(sendMessage("Hello", false), "hewwo");
  });

  it("counts /uwuify as a command that sends a message", () => {
    // Shape of Fluxer's compiled doesCommandSendCurrentChannelMessage.
    const commandUtilitiesModule = compile(
      'function(e){e.exports=function(e){return"me"===e.type||"spoiler"===e.type||"tts"===e.type||"unknown"===e.type};' +
        'function nick(e){if(!e)throw Error("Cannot change nickname outside of a guild")}}',
    );
    const sendsMessage = runPatched(pendingFor(uwuifier), commandUtilitiesModule);
    assert.equal(sendsMessage({ type: "uwuify" }), true);
    assert.equal(sendsMessage({ type: "kick" }), false);
  });

  it("uwuifies changed edits when every message is uwuified", async () => {
    // Shape of Fluxer's compiled MessageCommands.edit.
    const messageCommandsModule = compile(
      "function(e){const eF={debug(){}};function eI(e){return function(){const t=e.apply(this,arguments);return Promise.resolve(t.next().value)}}" +
        "function eY(e,t,a,o,l,u){return eI(function*(){var d,m;eF.debug(`Editing message ${t} in channel ${e}`);return a})()}e.exports=eY}",
    );
    const edit = runPatched(pendingFor(uwuifier), messageCommandsModule);
    const findMessages = Stores.Messages;
    Stores.Messages = () =>
      ({ getMessage: () => ({ content: "Hello" }) as FluxerMessage }) as unknown as ReturnType<
        typeof findMessages
      >;
    try {
      assert.equal(await edit("1", "2", "Hello!"), "Hello!");
      uwuifier.settings.store.uwuEveryMessage = true;
      assert.equal(await edit("1", "2", "Hello!"), "hewwo!");
      assert.equal(await edit("1", "2", "Hello"), "Hello");
      assert.equal(await edit("1", "2", undefined), undefined);
    } finally {
      Stores.Messages = findMessages;
    }
  });
});
