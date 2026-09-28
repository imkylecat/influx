import { beforeEach, describe, it, mock } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import * as common from "@webpack/common";

import messageLogger from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(messageLogger));

interface FakeMessage {
  id: string;
  channelId: string;
  guildId: string;
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
    channelId: "c",
    guildId: "g",
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
}

// Shape of Fluxer's compiled MessagingMessages store, with ChannelMessages as s.W.
const storeModule = compile(
  "function(e,t,n){const s={W:null};" +
    "class M{commitMessages(e){s.W.current=e}notifyChange(){}" +
    "handleMessageDelete(e){let t=s.W.get(e.channelId);if(!(null==t?void 0:t.has(e.id)))return!1;let n=t;n=n.remove(e.id);return this.commitMessages(n),this.notifyChange(),!0}" +
    "handleMessageDeleteBulk(e){let t=s.W.get(e.channelId);if(!t)return!1;let n=t.removeIds(e.ids);if(n===t)return!1;return this.commitMessages(n),this.notifyChange(),!0}" +
    'handleMessageUpdate(e){let t=e.message.id,n=e.message.channel_id,i=s.W.get(n);if(!(null==i?void 0:i.has(t)))return!1;let a=i.update(t,t=>"EDITING"===t.state&&void 0===e.message.state?t.withUpdates(Object.assign({},e.message,{state:"SENT"})):t.withUpdates(e.message));return this.commitMessages(a),this.notifyChange(),!0}' +
    'handleOptimisticEdit(e){var t,n;let{channelId:i,messageId:a,content:r}=e,o=s.W.get(i);if(!o)return null;let l=o.get(a);if(!l)return null;let u={originalContent:l.content},c=o.update(a,e=>e.withUpdates({content:r,state:"EDITING"}));return this.commitMessages(c),this.notifyChange(),u}' +
    'handleEditRollback(e){let{channelId:t,messageId:n,originalContent:i}=e,r=s.W.get(t);if(!(null==r?void 0:r.has(n)))return;let o=r.update(n,e=>e.withUpdates({content:i,state:"SENT"}));this.commitMessages(o),this.notifyChange()}}' +
    "e.exports={store:new M,channels:s}}",
);

describe("MessageLogger", () => {
  beforeEach(() => {
    const data = getPluginData(messageLogger.name);
    delete data.ignoreUsers;
    delete data.ignoreChannels;
    delete data.ignoreServers;
  });

  // Renders a message's past edits with a stand-in React, returning null when there are none.
  function renderPastEdits(message: FakeMessage): unknown {
    void mock.module("@webpack/common", () => ({
      ...common,
      React: {
        createElement: (type: unknown, props: object | null, ...children: unknown[]) => ({
          type,
          props: { ...props, children },
        }),
        useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
      },
    }));
    return messageLogger.PastEdits({ message: message as any, Markdown: () => null, options: {} });
  }

  function setup() {
    const pending = pendingFor(messageLogger);
    const { store, channels } = runPatched(pending, storeModule);
    assert.equal(pending.length, 7, "only the patches for other modules are left");
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

  it("tags deleted rows", () => {
    const rowModule = compile(
      "function(e,t,n){" +
        'e.exports=(b,ty)=>({"data-flx-edited":null!=b.editedTimestamp?"true":void 0,"data-flx-compact":void 0,className:ty,ref:null})}',
    );
    const props = runPatched(pendingFor(messageLogger), rowModule);
    assert.equal(props(message("1", "hi"), "row")["data-influx-deleted"], undefined);
    assert.equal(props(message("1", "hi", 1 << 30), "row")["data-influx-deleted"], "true");
  });

  it("gives deleted messages Fluxer's failed-message text class", () => {
    const textModule = compile(
      "function(e,t,n){" +
        'let U={cm:{FAILED:"FAILED"}},eM={b$:"failed"},nx={SENT:"sent"};' +
        'e.exports=(r,F)=>{let T=r.state===U.cm.FAILED?F?eM.b$:void 0:nx[r.state];return{className:T,"data-flx":"channel.user-message.message-text--2"}}}',
    );
    const textProps = runPatched(pendingFor(messageLogger), textModule);
    assert.equal(textProps(message("1", "hi"), true).className, "sent");
    assert.equal(textProps(message("1", "hi", 1 << 30), true).className, "failed");
  });

  it("doesn't log ignored users, channels, or servers", () => {
    const data = getPluginData(messageLogger.name);
    for (const [key, value] of [
      ["ignoreUsers", "9, author"],
      ["ignoreChannels", "9 c"],
      ["ignoreServers", "g"],
    ]) {
      const { store, channels } = setup();
      data[key] = value;
      store.handleMessageDelete({ channelId: "c", id: "1" });
      assert.equal(channels.current.get("1"), undefined, `${key} skips the message`);
      delete data[key];
    }
    const { store, channels } = setup();
    data.ignoreChannels = "c2";
    store.handleMessageDelete({ channelId: "c", id: "1" });
    assert.equal(messageLogger.isDeleted(channels.current.get("1")), true, "IDs match exactly");
  });

  it("records the previous content when a message is edited", () => {
    const { store, channels } = setup();
    assert.equal(renderPastEdits(channels.current.get("2")), null);
    store.handleMessageUpdate({
      message: { id: "2", channel_id: "c", content: "world!" },
    });
    assert.equal(channels.current.get("2").content, "world!");
    assert.match(JSON.stringify(renderPastEdits(channels.current.get("2"))), /"content":"world"/);
  });

  it("records your own edits once, and forgets them if saving fails", () => {
    const { store, channels } = setup();
    channels.current = channels.current.update("1", (m: FakeMessage) =>
      m.withUpdates({ content: "first" }),
    );
    store.handleOptimisticEdit({ channelId: "c", messageId: "1", content: "second" });
    // Fluxer's server confirms the edit with the content already shown.
    store.handleMessageUpdate({ message: { id: "1", channel_id: "c", content: "second" } });
    assert.equal(channels.current.get("1").state, "SENT");
    const shown = JSON.stringify(renderPastEdits(channels.current.get("1")));
    assert.equal(shown.match(/"content":/g)?.length, 1, "one past edit");
    assert.match(shown, /"content":"first"/);

    store.handleOptimisticEdit({ channelId: "c", messageId: "1", content: "third" });
    store.handleEditRollback({ channelId: "c", messageId: "1", originalContent: "second" });
    assert.equal(channels.current.get("1").content, "second");
    const afterRollback = JSON.stringify(renderPastEdits(channels.current.get("1")));
    assert.doesNotMatch(afterRollback, /"content":"second"/, "the failed edit isn't kept");
    assert.match(afterRollback, /"content":"first"/);
  });

  it("gives deleted messages read-only permissions", () => {
    // Shape of Fluxer's compiled message permissions, where a is its read-only channel check.
    const permissionsModule = compile(
      "function(e,t,n){const tN={A:{isBlocked:()=>!1}},u={sC:c=>!!c.readOnly};" +
        'function tW(e){return!1}const modal="channel.message-action-utils.request-message-pin.confirm-modal";' +
        "e.exports=function(e,t){let n=!t.guildId,i=tN.A.isBlocked(e.author.id),a=(0,u.sC)(t),o=tW(e);return{canSendMessages:!o&&!a,canEditMessage:!a}}}",
    );
    const permissions = runPatched(pendingFor(messageLogger), permissionsModule);
    const channel = { guildId: "g" };
    assert.deepEqual(permissions(message("1", "hi"), channel), {
      canSendMessages: true,
      canEditMessage: true,
    });
    assert.deepEqual(permissions(message("1", "hi", 1 << 30), channel), {
      canSendMessages: false,
      canEditMessage: false,
    });
    assert.equal(permissions(message("1", "hi"), { readOnly: true }).canSendMessages, false);
  });

  it("keeps only local actions in a deleted message's menu", () => {
    // Shape of Fluxer's compiled message action groups.
    const groupsModule = compile(
      'function(e,t,n){const i={jsx:(t,p)=>p},a={ul:e=>!0},m={},B={reply:"reply",copyMessageId:"message_copy_id",reportMessage:"report_message"},ea=()=>{};' +
        'e.exports=e=>{let l=[{items:[{id:B.reply},{id:B.copyMessageId},{label:"Retry"}]}];' +
        'return(0,a.ul)(e)&&l.push({items:[{id:B.reportMessage,icon:(0,i.jsx)(m.ll,{size:20,"data-flx":"channel.message-action-menu.groups.report-message-icon"}),label:"Report",onClick:ea,danger:!0}]}),l}}',
    );
    const groups = runPatched(pendingFor(messageLogger), groupsModule);
    const ids = (fakeMessage: FakeMessage) =>
      groups(fakeMessage).map((group: any) => group.items.map((item: any) => item.id));
    assert.deepEqual(ids(message("1", "hi")), [
      ["reply", "message_copy_id", undefined],
      ["report_message"],
    ]);
    assert.deepEqual(ids(message("1", "hi", 1 << 30)), [["message_copy_id"], []]);
  });

  it("adds its menu items after the danger group", () => {
    // Shape of Fluxer's compiled message context menu.
    const menuModule = compile(
      'function(e,t,n){const i={jsx:(t,p)=>p,jsxs:(t,p)=>p},x={r:"group"},T={G:"submenu"};' +
        'e.exports=(e,eG,D)=>[eG?(0,i.jsxs)(x.r,{"data-flx":"ui.action-menu.message-context-menu.render-danger-group.menu-group",children:[(0,i.jsx)(T.G,{render:()=>(0,i.jsx)(ee,{reactions:[],channelId:e.channelId,messageId:e.id,' +
        '"data-flx":"ui.action-menu.message-context-menu.render-danger-group.remove-reactions-submenu"}),"data-flx":"ui.action-menu.message-context-menu.render-danger-group.menu-item-submenu"}),eG]}):null,D]}',
    );
    (globalThis as any).Influx.plugins.MessageLogger = {
      renderMenuItems: (fakeMessage: FakeMessage) => `items for ${fakeMessage.id}`,
    };
    const menu = runPatched(pendingFor(messageLogger), menuModule);
    const children = menu(message("1", "hi"), "delete", "stickers");
    assert.equal(children.length, 3);
    assert.equal(children[1], "items for 1");
    assert.equal(children[2], "stickers");
  });
});
