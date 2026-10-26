import { describe, it, expect } from "bun:test";

import { reloadAfterPluginChange } from "./reload";

describe("Influx settings: apply plugin changes", () => {
  it("persists settings first, then uses Fluxer's native desktop relaunch", async () => {
    const events: string[] = [];
    await reloadAfterPluginChange({
      isDesktop: true,
      persistSettings: () => events.push("save"),
      nativeRelaunch: async () => { events.push("desktop-relaunch"); },
      browserReload: () => events.push("unsafe-page-reload"),
    });
    expect(events).toEqual(["save", "desktop-relaunch"]);
  });

  it("retains browser page reloads outside the desktop app", async () => {
    const events: string[] = [];
    await reloadAfterPluginChange({
      isDesktop: false,
      persistSettings: () => events.push("save"),
      browserReload: () => events.push("browser-reload"),
    });
    expect(events).toEqual(["save", "browser-reload"]);
  });

  it("does not fall back to unsafe in-page reload if native bridge is missing", async () => {
    const events: string[] = [];
    await expect(reloadAfterPluginChange({
      isDesktop: true,
      persistSettings: () => events.push("save"),
      browserReload: () => events.push("unsafe-page-reload"),
    })).rejects.toThrow("restart bridge is unavailable");
    expect(events).toEqual(["save"]);
  });

  it("reports a failed native relaunch without reloading the current document", async () => {
    const events: string[] = [];
    await expect(reloadAfterPluginChange({
      isDesktop: true,
      persistSettings: () => events.push("save"),
      nativeRelaunch: async () => { throw new Error("native ipc rejected"); },
      browserReload: () => events.push("unsafe-page-reload"),
    })).rejects.toThrow("native ipc rejected");
    expect(events).toEqual(["save"]);
  });

  it("does not relaunch if settings cannot be saved", async () => {
    const events: string[] = [];
    await expect(reloadAfterPluginChange({
      isDesktop: true,
      persistSettings: () => { throw new Error("save failed"); },
      nativeRelaunch: async () => { events.push("desktop-relaunch"); },
      browserReload: () => events.push("unsafe-page-reload"),
    })).rejects.toThrow("save failed");
    expect(events).toEqual([]);
  });
});
