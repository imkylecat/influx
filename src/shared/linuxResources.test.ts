import { describe, expect, it } from "bun:test";
import path from "node:path";

import { linuxResourcesCandidates, resolveLinuxResourcesPath } from "./linuxResources";

describe("Linux Fluxer resource discovery", () => {
  it("includes native deb/rpm and Arch-style Linux resource locations", () => {
    const paths = linuxResourcesCandidates("/home/example", false);
    expect(paths).toContain("/opt/Fluxer/resources");
    expect(paths).toContain("/opt/fluxer/resources");
    expect(paths).toContain("/usr/lib/fluxer/resources");
    expect(paths).toContain("/usr/share/fluxer/resources");
    expect(paths).toContain("/home/example/.local/share/fluxer/resources");
    expect(paths).not.toContain("/opt/fluxer-canary/resources");
    expect(paths).not.toContain("/var/lib/flatpak/app/app.fluxer.Fluxer");
  });

  it("checks canary paths independently of the stable package", () => {
    const paths = linuxResourcesCandidates("/home/example", true);
    expect(paths).toContain("/opt/fluxer-canary/resources");
    expect(paths).toContain("/usr/lib/fluxer-canary/resources");
    expect(paths).not.toContain("/opt/Fluxer/resources");
  });

  it("accepts the exact resources folder", () => {
    const folder = "/tmp/test-Fluxer/resources";
    expect(resolveLinuxResourcesPath(folder, (candidate) => candidate === folder)).toBe(folder);
  });

  it("accepts an extracted application's root folder", () => {
    const root = "/tmp/Fluxer";
    expect(resolveLinuxResourcesPath(root, (candidate) => candidate === path.join(root, "resources")))
      .toBe(path.join(root, "resources"));
  });

  it("accepts a full path to app.asar, useful with find", () => {
    expect(resolveLinuxResourcesPath("/home/example/Downloads/Fluxer/resources/app.asar", () => false))
      .toBe("/home/example/Downloads/Fluxer/resources");
  });

  it("does not invent directories when none contain Fluxer", () => {
    expect(resolveLinuxResourcesPath("/nonexistent/Fluxer", () => false)).toBe("/nonexistent/Fluxer");
  });
});
