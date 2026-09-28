import { describe, it } from "bun:test";
import assert from "node:assert/strict";

import { patchFactory } from "../patcher/patchFactory";
import { errors, logger, run } from "../patcher/testing";
import type { ModuleFactory } from "../webpack/types";
import * as Gateway from "./Gateway";
import { type GatewayHandler, hookGatewayEvents, onGatewayEvents } from "./Gateway";

describe("Gateway", () => {
  it("runs listeners before Fluxer's handlers without changing what they receive", () => {
    const seen: unknown[] = [];
    const registry = new Map<string, GatewayHandler>([
      ["READY", (data, context) => seen.push(["READY", data, context])],
      ["MESSAGE_CREATE", (data) => seen.push(["MESSAGE_CREATE", data])],
    ]);
    hookGatewayEvents(registry);
    const stop = onGatewayEvents("Test", {
      READY: (data) => seen.push(["listener", data]),
      MESSAGE_CREATE: () => {
        throw new Error("listener failed");
      },
    });

    registry.get("READY")!({ user: { id: "me" } }, "context");
    assert.deepEqual(seen, [
      ["listener", { user: { id: "me" } }],
      ["READY", { user: { id: "me" } }, "context"],
    ]);

    seen.length = 0;
    registry.get("MESSAGE_CREATE")!({ id: "1" }, "context");
    assert.deepEqual(seen, [["MESSAGE_CREATE", { id: "1" }]], "a failing listener is contained");

    seen.length = 0;
    stop();
    registry.get("READY")!({}, "context");
    assert.deepEqual(seen, [["READY", {}, "context"]]);
  });

  it("hooks Fluxer's handler registry once it is filled", () => {
    // Shape of Fluxer's compiled gateway handler registry.
    const registryModule = new Function(
      'return function(e){let t=new Map;t.set("READY",()=>{}),t.set("SESSIONS_REPLACE",()=>{}),e.exports=t}',
    )() as ModuleFactory;
    errors.length = 0;
    (globalThis as any).Influx = { Gateway };
    const patched = patchFactory(1, registryModule, [Gateway.gatewayPatch], logger);
    assert.deepEqual(errors, []);
    const seen: unknown[] = [];
    const stop = onGatewayEvents("Test", { READY: (data) => seen.push(data) });
    run(patched).get("READY")("ready", "context");
    stop();
    assert.deepEqual(seen, ["ready"]);
  });
});
