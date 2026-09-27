import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import type { ModuleFactory } from "@webpack/types";

import sendConfirmation, { HONEYPOT_CHANNEL_IDS, sendPolicy } from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";

beforeEach(() => {
  sendConfirmation.settings.pluginName = sendConfirmation.name;
  const data = getPluginData(sendConfirmation.name);
  delete data.blockHoneypotChannels;
  delete data.channelIds;
  delete data.confirmAll;
});

describe("SendConfirmation", () => {
  it("blocks the supplied honeypot by default and lets other channels send normally", () => {
    assert.deepEqual(HONEYPOT_CHANNEL_IDS, ["1513407003270057984"]);
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "block");
    assert.equal(sendPolicy("123"), "allow");
  });

  it("matches complete channel IDs and prioritizes blocking over confirmation", () => {
    const data = getPluginData(sendConfirmation.name);
    data.channelIds = "123, 456\n789 1513407003270057984";
    for (const id of ["123", "456", "789"]) assert.equal(sendPolicy(id), "confirm");
    assert.equal(sendPolicy("12"), "allow");
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "block");
    data.blockHoneypotChannels = false;
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "confirm");
    data.channelIds = "";
    assert.equal(sendPolicy(HONEYPOT_CHANNEL_IDS[0]), "allow");
    data.confirmAll = true;
    assert.equal(sendPolicy("999"), "confirm");
  });

  it("refuses protected sends when the native confirmation UI is unavailable", async () => {
    getPluginData(sendConfirmation.name).confirmAll = true;
    assert.equal(await sendConfirmation.authorize("123", "nonce"), false);
  });

  it("gates sends before reservations and uploads, and preserves cancellation recovery", async () => {
    // Shape of Fluxer's shared MessageCommands send/reserve functions, including generator downleveling.
    const factory = new Function(`return function(module){
      function ec(fn){return function(){const iterator=fn.apply(this,arguments);return new Promise((resolve,reject)=>{function step(value){let next;try{next=iterator.next(value)}catch(error){reject(error);return}if(next.done)resolve(next.value);else Promise.resolve(next.value).then(step,reject)}step()})}}
      const events=[];
      const Q={A:{consumeLocalSendReservation:(...args)=>(events.push(["consume",...args]),true),rejectLocalRateLimitedSend:(...args)=>events.push(["recover",...args]),reserveLocalSend:(...args)=>(events.push(["reserve",...args]),true)}};
      function send(e,t){return ec(function*(){if(!Q.A.consumeLocalSendReservation(e,t.nonce))return Q.A.rejectLocalRateLimitedSend(e,t.nonce,t.hasAttachments),null;events.push(["upload",t]);events.push(["Enqueueing message for channel",e]);return t})()}
      function reserve(e,t){return Q.A.reserveLocalSend(e,t)}
      module.exports={send,reserve,events};
    }`)() as ModuleFactory;
    const errors: unknown[] = [];
    const patched = patchFactory(
      1,
      factory,
      sendConfirmation.patches.map((p) => ({ ...p, plugin: sendConfirmation.name })),
      { error: (...args) => errors.push(args) },
    );
    assert.notEqual(patched, factory);
    assert.deepEqual(errors, []);
    const previous = (globalThis as any).Influx;
    let approve = false;
    try {
      (globalThis as any).Influx = {
        plugins: {
          SendConfirmation: {
            blocked: (id: string) => sendPolicy(id) === "block",
            authorize: async () => approve,
          },
        },
      };
      const module = { exports: {} as any };
      patched(module as any, {}, (() => {}) as any);
      const { send, reserve, events } = module.exports;
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
    } finally {
      (globalThis as any).Influx = previous;
    }
  });
});
