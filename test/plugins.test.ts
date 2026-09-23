import assert from "node:assert/strict";
import { beforeEach, describe, it } from "bun:test";
import anonymiseFileNames, { anonymiseName } from "../src/plugins/anonymiseFileNames";
import messageLogger from "../src/plugins/messageLogger";
import { patchFactory } from "../src/renderer/patcher/patchFactory";
import type { ModuleFactory, Patch } from "../src/renderer/webpack/types";

const errors: unknown[][] = [];
const logger = { error: (...args: unknown[]) => errors.push(args) };

function run(factory: ModuleFactory): any {
  const module = { exports: {} as any };
  factory.call(module.exports, module, module.exports, (() => {}) as any);
  return module.exports;
}

const pendingFor = (plugin: { name: string; patches: Patch[] | Omit<Patch, "plugin">[] }) =>
  plugin.patches.map((p) => ({ ...p, plugin: plugin.name }) as Patch);

beforeEach(() => {
  errors.length = 0;
  (globalThis as any).Influx = {
    plugins: { MessageLogger: messageLogger, AnonymiseFileNames: anonymiseFileNames },
  };
});

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

interface FakeMessage {
  id: string;
  content: string;
  flags: number;
  state: string;
  timestamp: Date;
  editedTimestamp: Date | null;
  author: { id: string };
  withUpdates(updates: Partial<FakeMessage>): FakeMessage;
}

function message(id: string, content: string, flags = 0): FakeMessage {
  return {
    id,
    content,
    flags,
    state: "SENT",
    timestamp: new Date(0),
    editedTimestamp: null,
    author: { id: "author" },
    withUpdates(updates) {
      return { ...this, ...updates };
    },
  };
}

class FakeChannelMessages {
  constructor(readonly messages: Map<string, FakeMessage>) {}
  has(id: string) {
    return this.messages.has(id);
  }
  get(id: string) {
    return this.messages.get(id);
  }
  update(id: string, updater: (m: FakeMessage) => FakeMessage) {
    const next = new Map(this.messages);
    next.set(id, updater(this.messages.get(id)!));
    return new FakeChannelMessages(next);
  }
  remove(id: string) {
    return this.removeIds([id]);
  }
  removeIds(ids: string[]) {
    const next = new Map(this.messages);
    for (const id of ids) next.delete(id);
    return new FakeChannelMessages(next);
  }
  nextAfter() {
    return null;
  }
  withPatch() {
    return this;
  }
}

// Shape of Fluxer's compiled MessagingMessages store, with ChannelMessages as s.W.
const storeModule = new Function(
  "return function(e,t,n){const s={W:null};" +
    "class M{commitMessages(e){s.W.current=e}notifyChange(){}" +
    "handleMessageDelete(e){let t=s.W.get(e.channelId);if(!(null==t?void 0:t.has(e.id)))return!1;let n=t;n=n.remove(e.id);return this.commitMessages(n),this.notifyChange(),!0}" +
    "handleMessageDeleteBulk(e){let t=s.W.get(e.channelId);if(!t)return!1;let n=t.removeIds(e.ids);if(n===t)return!1;return this.commitMessages(n),this.notifyChange(),!0}" +
    "handleMessageUpdate(e){let t=e.message.id,n=e.message.channel_id,i=s.W.get(n);if(!(null==i?void 0:i.has(t)))return!1;let a=i.update(t,t=>t.withUpdates(e.message));return this.commitMessages(a),this.notifyChange(),!0}}" +
    "e.exports={store:new M,channels:s}}",
)() as ModuleFactory;

describe("MessageLogger", () => {
  function setup() {
    const pending = pendingFor(messageLogger);
    const patched = patchFactory(1, storeModule, pending, logger);
    assert.deepEqual(errors, []);
    assert.equal(pending.length, 3, "only the render patches are left for other modules");
    const { store, channels } = run(patched);
    channels.W = {
      current: new FakeChannelMessages(
        new Map([
          ["1", message("1", "hello")],
          ["2", message("2", "world")],
        ]),
      ),
      get() {
        return this.current;
      },
    };
    return { store, channels: channels.W };
  }

  it("marks deleted messages instead of removing them", () => {
    const { store, channels } = setup();
    assert.equal(store.handleMessageDelete({ channelId: "c", id: "1" }), true);
    const kept = channels.current.get("1");
    assert.ok(kept, "message is still in the store");
    assert.equal(messageLogger.isDeleted(kept), true);
    assert.equal(messageLogger.isDeleted(channels.current.get("2")), false);
  });

  it("marks bulk-deleted messages", () => {
    const { store, channels } = setup();
    store.handleMessageDeleteBulk({ channelId: "c", ids: ["1", "2"] });
    assert.equal(messageLogger.isDeleted(channels.current.get("1")), true);
    assert.equal(messageLogger.isDeleted(channels.current.get("2")), true);
  });

  it("still removes messages that were never sent", () => {
    const { store, channels } = setup();
    channels.current = channels.current.update("1", (m: FakeMessage) =>
      m.withUpdates({ state: "FAILED" }),
    );
    store.handleMessageDelete({ channelId: "c", id: "1" });
    assert.equal(channels.current.get("1"), undefined);
  });

  it("records the previous content when a message is edited", () => {
    const { store, channels } = setup();
    store.handleMessageUpdate({ message: { id: "2", channel_id: "c", content: "world!" } });
    assert.equal(channels.current.get("2").content, "world!");
    (globalThis as any).React ??= { createElement: (...args: unknown[]) => args };
    const Markdown = () => null;
    const rendered: any = messageLogger.renderEdits(channels.current.get("2"), Markdown, {});
    assert.ok(rendered, "past edits render");
  });
});

describe("RelationshipNotifier banner", () => {
  it("finds Fluxer's nagbar parts in the nagbar module", async () => {
    const { nagbarPartsSource } = await import("../src/plugins/relationshipNotifier/banner");
    // Excerpt of Fluxer's compiled software-encoder nagbar.
    const code =
      '(0,o.jsx)(ai,{isMobile:n,backgroundColor:r7.gZ[r7.as.ENCODER].backgroundColor,textColor:r7.gZ[r7.as.ENCODER].textColor,dismissible:!0,onDismiss:mf.A.dismiss,"data-flx":"voice.software-encoder-nagbar.nagbar",' +
      'children:(0,o.jsx)(r8,{isMobile:n,message:e._(bm),onDismiss:mf.A.dismiss,actions:(0,o.jsx)(ar,{isMobile:n,onClick:mf.A.dismiss,"data-flx":"voice.software-encoder-nagbar.dismiss",children:e._(bp)})})})';
    assert.equal(
      nagbarPartsSource(code, "t.enabled"),
      "{Nagbar:ai,tones:r7.gZ,Content:r8,Button:ar,isMobile:!!(t.enabled)}",
    );
    assert.equal(
      nagbarPartsSource("", "t.enabled"),
      "{Nagbar:null,tones:null,Content:null,Button:null,isMobile:!!(t.enabled)}",
    );
  });
});

describe("RelationshipNotifier while away", () => {
  it("reports friends, requests, and servers that disappeared between sessions", async () => {
    const { describeRemoval, diffSnapshots, snapshotFromReady } =
      await import("../src/plugins/relationshipNotifier/snapshot");
    const before = snapshotFromReady({
      relationships: [
        { id: "1", type: 1, user: { username: "alex", global_name: "Alex" } },
        { id: "2", type: 3, user: { username: "sam" } },
        { id: "3", type: 4, user: { username: "kim" } },
        { id: "4", type: 1, user: { username: "jo" } },
      ],
      guilds: [
        { id: "g1", properties: { name: "Kept" } },
        { id: "g2", properties: { name: "Gone" } },
        { id: "g3", unavailable: true },
      ],
    });
    const after = snapshotFromReady(
      {
        // sam's request became a friendship, jo was blocked: neither is a removal.
        relationships: [
          { id: "2", type: 1, user: { username: "sam" } },
          { id: "4", type: 2, user: { username: "jo" } },
        ],
        guilds: [
          { id: "g1", properties: { name: "Kept" } },
          { id: "g3", unavailable: true },
        ],
      },
      before,
    );
    assert.deepEqual(
      diffSnapshots(before, after).map((removal) => describeRemoval(removal, true)),
      [
        "Alex (@alex) removed you as a friend while you were away.",
        "@kim declined your friend request while you were away.",
        "You were removed from Gone while you were away.",
      ],
    );
  });

  it("wraps Fluxer's gateway handlers without changing what they receive", async () => {
    const plugin = (await import("../src/plugins/relationshipNotifier")).default;
    const seen: unknown[] = [];
    const registry = new Map<string, (data: any, context: unknown) => void>([
      ["READY", (data, context) => seen.push(["READY", data, context])],
      ["MESSAGE_CREATE", (data) => seen.push(["MESSAGE_CREATE", data])],
    ]);
    const original = registry.get("MESSAGE_CREATE");
    plugin.wrapGatewayHandlers(registry);
    assert.equal(registry.get("MESSAGE_CREATE"), original, "unrelated events are left alone");
    registry.get("READY")!({ user: { id: "me" } }, "ctx");
    assert.deepEqual(seen, [["READY", { user: { id: "me" } }, "ctx"]]);
  });
});
