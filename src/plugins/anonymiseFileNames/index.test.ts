import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import type { ModuleFactory } from "@webpack/types";

import anonymiseFileNames, { anonymiseName } from ".";
import { patchFactory } from "../../renderer/patcher/patchFactory";
import { errors, logger, pendingFor, resetPatching, run } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(anonymiseFileNames));

describe("AnonymiseFileNames", () => {
  it("keeps the extension and spoiler prefix", () => {
    assert.equal(anonymiseName("holiday photo.PNG", "abc"), "abc.PNG");
    assert.equal(anonymiseName("SPOILER_secret.jpg", "abc"), "SPOILER_abc.jpg");
    assert.equal(anonymiseName("backup.tar.gz", "abc"), "abc.tar.gz");
    assert.equal(anonymiseName("README", "abc"), "abc");
  });

  it("renames files passed to CloudUpload.addFiles", async () => {
    // Shape of Fluxer's compiled CloudUpload.addFiles.
    const uploadModule = new Function(
      "return function(e,t,n){function v(g){return function(){const it=g.apply(this,arguments);return new Promise(r=>{(function step(x){const s=it.next(x);s.done?r(s.value):Promise.resolve(s.value).then(step)})()})}}" +
        "class U{createAttachments(e,t){return Promise.resolve(t.map(f=>f.name))}addFiles(e,t){return v(function*(){if(0===t.length)return[];let n=yield this.createAttachments(e,t);return n}).call(this)}}" +
        "e.exports=new U}",
    )() as ModuleFactory;
    const patched = patchFactory(1, uploadModule, pendingFor(anonymiseFileNames), logger);
    assert.notEqual(patched, uploadModule);
    assert.deepEqual(errors, []);
    const names: string[] = await run(patched).addFiles("1", [new File(["x"], "me.png")]);
    assert.equal(names.length, 1);
    assert.match(names[0], /^[A-Za-z0-9]{8}\.png$/);
  });
});
