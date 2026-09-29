import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import { Stores } from "@webpack/common";

import sendConfirmation, { HONEYPOT_CHANNEL_IDS, sendPolicy } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => {
  const data = getPluginData(sendConfirmation.name);
  delete data.blockHoneypotChannels;
  delete data.confirmChannels;
  delete data.confirmServers;
  delete data.confirmAll;
});

describe("SendConfirmation", () => {
  it("blocks the supplied honeypots by default and lets other channels send normally", () => {
    assert.deepEqual(HONEYPOT_CHANNEL_IDS, ["1513407003270057984", "1545829681800949760"]);
    for (const id of HONEYPOT_CHANNEL_IDS) assert.equal(sendPolicy(id), "block");
    assert.equal(sendPolicy("123"), "allow");
  });

  it("matches complete channel IDs and prioritizes blocking over confirmation", () => {
    const data = getPluginData(sendConfirmation.name);
    data.confirmChannels = "123, 456\n789 1513407003270057984";
    for (const id of ["123", "456", "789"]) assert.equal(sendPolicy(id), "confirm");
    assert.equal(sendPolicy("12"), "allow");
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "block");
    data.blockHoneypotChannels = false;
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "confirm");
    data.confirmChannels = "";
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "allow");
    data.confirmAll = true;
    assert.equal(sendPolicy("999"), "confirm");
  });

  it("confirms every channel of a chosen server", () => {
    const findChannels = Stores.Channels;
    const servers: Record<string, string> = { "123": "50", "456": "51" };
    Stores.Channels = () => ({ getChannel: (id) => ({ guildId: servers[id] }) });
    try {
      getPluginData(sendConfirmation.name).confirmServers = "50, 52";
      assert.equal(sendPolicy("123"), "confirm");
      assert.equal(sendPolicy("456"), "allow");
      assert.equal(sendPolicy("789"), "allow", "a direct message has no server");
    } finally {
      Stores.Channels = findChannels;
    }
  });

  it("refuses protected sends when the native confirmation UI is unavailable", async () => {
    getPluginData(sendConfirmation.name).confirmAll = true;
    assert.equal(await sendConfirmation.authorize("123", "nonce"), false);
  });

  it("gates sends before reservations and uploads, and preserves cancellation recovery", async () => {
    // Shape of Fluxer's shared MessageCommands send/reserve functions, including generator downleveling.
    const factory = compile(`function(module){
      function ec(fn){return function(){const iterator=fn.apply(this,arguments);return new Promise((resolve,reject)=>{function step(value){let next;try{next=iterator.next(value)}catch(error){reject(error);return}if(next.done)resolve(next.value);else Promise.resolve(next.value).then(step,reject)}step()})}}
      const events=[];
      const Q={A:{consumeLocalSendReservation:(...args)=>(events.push(["consume",...args]),true),rejectLocalRateLimitedSend:(...args)=>events.push(["recover",...args]),reserveLocalSend:(...args)=>(events.push(["reserve",...args]),true)}};
      function send(e,t){return ec(function*(){if(!Q.A.consumeLocalSendReservation(e,t.nonce))return Q.A.rejectLocalRateLimitedSend(e,t.nonce,t.hasAttachments),null;events.push(["upload",t]);events.push(["Enqueueing message for channel",e]);return t})()}
      function reserve(e,t){return Q.A.reserveLocalSend(e,t)}
      module.exports={send,reserve,events};
    }`);
    let approve = false;
    resetPatching({
      ...sendConfirmation,
      blocked: (id: string) => sendPolicy(id) === "block",
      authorize: async () => approve,
    });
    const { send, reserve, events } = runPatched(pendingFor(sendConfirmation), factory);
    assert.equal(reserve(HONEYPOT_CHANNEL_IDS[0], "1"), false);
    assert.deepEqual(events, []);
    const message = {
      nonce: "1",
      content: "Keep this",
      hasAttachments: true,
      stickers: [{ id: "5" }],
    };
    assert.equal(await send("123", message), null);
    assert.deepEqual(events, [["recover", "123", "1", true]]);
    events.length = 0;
    approve = true;
    assert.equal(await send("123", message), message);
    assert.deepEqual(events, [
      ["consume", "123", "1"],
      ["upload", message],
      ["Enqueueing message for channel", "123"],
    ]);
    events.length = 0;
    assert.equal(reserve("123", "2"), true);
    assert.deepEqual(events, [["reserve", "123", "2"]]);
  });
});
