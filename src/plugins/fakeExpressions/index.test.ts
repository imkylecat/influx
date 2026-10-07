import { afterAll, beforeAll, beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import { getPluginData } from "@api/Settings";
import { Stores } from "@webpack/common";
import type { FluxerChannel } from "@webpack/fluxer";
import { moduleCache } from "@webpack/patchWebpack";

import fakeExpressions, { parseFakeExpression } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

const MEDIA = "https://media.example";
const EMOJI_LINK = `${MEDIA}/emojis/5001.webp?size=48&animated=true&name=wave`;
const STICKER_LINK = `${MEDIA}/stickers/6001.webp?size=160&name=hello`;
const AVAILABLE = "{canUse:!0,isLockedByPremium:!1,isLockedByPermission:!1}";
const i18n = { _: () => "" };

const emojis: Record<string, object> = {
  "5001": { id: "5001", guildId: "100", name: "wave", animated: true },
  "5002": { id: "5002", guildId: "200", name: "local", animated: false },
};
const stickers: Record<string, object> = {
  "6001": { id: "6001", guildId: "100", name: "hello", animated: false },
  "6002": { id: "6002", guildId: "200", name: "home", animated: true },
};
const channels: Record<string, object> = {
  "300": { id: "300", guildId: "200", isPrivate: () => false },
  "301": { id: "301", isPrivate: () => true },
};
const channel = channels["300"] as FluxerChannel;

// Shape of Fluxer's ExpressionPermissionUtils, for an account without Plutonium.
const availabilityModule = compile(
  `function(e,t,n){const s={default:{can:()=>!1}},u={xB:{USE_EXTERNAL_EMOJIS:1n,USE_EXTERNAL_STICKERS:2n}};` +
    "function f(e,t,n){return b(e,t,n,null)}" +
    `function b(e,t,n,a){var r;if(!t.guildId)return${AVAILABLE};let g=null!=(r=null==n?void 0:n.guildId)?r:a;if(!g)return{canUse:!1,isLockedByPremium:!0,isLockedByPermission:!1};if(t.guildId===g)return${AVAILABLE};if(!s.default.can(u.xB.USE_EXTERNAL_EMOJIS,{guildId:g}))return{canUse:!1,isLockedByPremium:!1,isLockedByPermission:!0};return{canUse:!1,isLockedByPremium:!0,isLockedByPermission:!1}}` +
    `function y(e,t,n){if(!t.guildId)return${AVAILABLE};if(!(null==n?void 0:n.guildId))return{canUse:!1,isLockedByPremium:!0,isLockedByPermission:!1};if(t.guildId===n.guildId)return${AVAILABLE};if(!s.default.can(u.xB.USE_EXTERNAL_STICKERS,{guildId:n.guildId}))return{canUse:!1,isLockedByPremium:!1,isLockedByPermission:!0};return{canUse:!1,isLockedByPremium:!0,isLockedByPermission:!1}}` +
    "e.exports={f,b,y}}",
);

// Runs functions that Fluxer's build turned from async into generators.
const asyncRunner =
  "function ec(fn){return function(){const iterator=fn.apply(this,arguments);return new Promise((resolve,reject)=>{function step(value){let next;try{next=iterator.next(value)}catch(error){reject(error);return}if(next.done)resolve(next.value);else Promise.resolve(next.value).then(step,reject)}step()})}}";

const originalStores = { ...Stores };
let availability: Record<"f" | "b" | "y", (...values: any[]) => { canUse: boolean }>;

beforeAll(() => {
  resetPatching(fakeExpressions);
  availability = runPatched(pendingFor(fakeExpressions), availabilityModule);
  moduleCache.set("fake-expressions-availability", { exports: availability });
  Stores.Emojis = () => ({ getEmojiById: (id) => emojis[id] as any });
  Stores.Stickers = () => ({ getStickerById: (id) => (stickers[id] as any) ?? null });
  Stores.Channels = () => ({ getChannel: (id) => channels[id] as FluxerChannel });
  Stores.RuntimeConfig = () => ({ mediaEndpoint: MEDIA });
  Stores.Permission = () => ({ can: () => false });
});

afterAll(() => {
  Object.assign(Stores, originalStores);
  moduleCache.delete("fake-expressions-availability");
});

beforeEach(() => {
  resetPatching(fakeExpressions);
  const data = getPluginData(fakeExpressions.name);
  for (const key of Object.keys(data)) delete data[key];
  data.disableEmbedPermissionCheck = true;
});

describe("FakeExpressions", () => {
  it("unlocks emojis and stickers in chat, and keeps Fluxer's rules where they can't be faked", () => {
    const { f, b, y } = availability;
    assert.equal(f(i18n, emojis["5001"], channel).canUse, true);
    assert.equal(f(i18n, emojis["5001"], channels["301"]).canUse, true);
    assert.equal(b(i18n, emojis["5001"], null, "200").canUse, true);
    assert.equal(f(i18n, emojis["5001"], null).canUse, false, "a profile or status has no channel");
    assert.equal(y(i18n, stickers["6001"], channel).canUse, true);
    fakeExpressions.withNativeRules(() => {
      assert.equal(f(i18n, emojis["5001"], channel).canUse, false);
      assert.equal(f(i18n, emojis["5002"], channel).canUse, true);
      assert.equal(y(i18n, stickers["6001"], channel).canUse, false);
    });

    const store = fakeExpressions.settings.store;
    store.enableEmojiBypass = false;
    store.enableStickerBypass = false;
    assert.equal(f(i18n, emojis["5001"], channel).canUse, false);
    assert.equal(y(i18n, stickers["6001"], channel).canUse, false);
  });

  it("offers only usable emojis as quick reactions", () => {
    (globalThis as any).fakeExpressionsCheck = availability.f;
    // Shape of the method in Fluxer's Emoji store.
    const emojiStoreModule = compile(
      "function(e,t,n){const g={ao:globalThis.fakeExpressionsCheck},_={Ru:{}};e.exports=class{getQuickReactionEmojis(e,t){let n=[],a=new Set,r=(i,r)=>{!r||a.has(i)||n.length>=t||(0,g.ao)(_.Ru,r,e).canUse&&(a.add(i),n.push(r))};for(let i of this.frecent)r(i.id,i);return n}}}",
    );
    const EmojiStore = runPatched(pendingFor(fakeExpressions), emojiStoreModule);
    const store = Object.assign(new EmojiStore(), { frecent: Object.values(emojis) });
    assert.deepEqual(store.getQuickReactionEmojis(channel, 3), [emojis["5002"]]);
  });

  it("sends locked emojis and stickers as links, and leaves usable ones alone", async () => {
    const message = {
      content: "hi <a:wave:5001> and <:local:5002>! \\<a:wave:5001> <:unknown:777>",
      stickers: [
        { id: "6001", name: "hello", animated: false },
        { id: "6002", name: "home", animated: true },
      ],
    };
    assert.equal(await fakeExpressions.preSend("300", message), true);
    assert.equal(
      message.content,
      `hi [wave](${EMOJI_LINK}) and <:local:5002>! \\<a:wave:5001> <:unknown:777> [hello](${STICKER_LINK})`,
    );
    assert.deepEqual(message.stickers, [{ id: "6002", name: "home", animated: true }]);

    const store = fakeExpressions.settings.store;
    store.useHyperLinks = false;
    store.emojiSize = "96";
    assert.equal(
      await fakeExpressions.preEdit("301", "see<a:wave:5001>"),
      `see ${MEDIA}/emojis/5001.webp?size=96&animated=true&name=wave`,
    );
    assert.equal(await fakeExpressions.preEdit("300", "nothing here"), "nothing here");
    assert.equal(await fakeExpressions.preEdit("300", undefined), undefined);

    store.enableEmojiBypass = false;
    store.enableStickerBypass = false;
    const untouched = { content: "<a:wave:5001>", stickers: [{ ...message.stickers[0] }] };
    assert.equal(await fakeExpressions.preSend("300", untouched), true);
    assert.deepEqual(untouched, { content: "<a:wave:5001>", stickers: [message.stickers[0]] });
  });

  it("prepares messages and edits before Fluxer sends them, and can cancel both", async () => {
    // Shape of Fluxer's shared MessageCommands send and edit functions.
    const factory = compile(`function(module){${asyncRunner}
      const events=[],F={debug(){}};
      const Q={A:{consumeLocalSendReservation:()=>!0,rejectLocalRateLimitedSend:(...values)=>events.push(["recover",...values])}};
      function send(e,t){return ec(function*(){if(!Q.A.consumeLocalSendReservation(e,t.nonce))return Q.A.rejectLocalRateLimitedSend(e,t.nonce,t.hasAttachments),null;let r={content:t.content,stickers:t.stickers};F.debug(\`Enqueueing message for channel \${e}\`);return r})()}
      function edit(e,t,a,o,l,u){return ec(function*(){var d,m;F.debug(\`Editing message \${t} in channel \${e}\`);return{content:a}})()}
      module.exports={send,edit,events};
    }`);
    const { send, edit, events } = runPatched(pendingFor(fakeExpressions), factory);
    const sticker = { id: "6001", name: "hello", animated: false };
    assert.deepEqual(await send("300", { nonce: "1", content: "", stickers: [sticker] }), {
      content: `[hello](${STICKER_LINK})`,
      stickers: [],
    });
    assert.deepEqual(await edit("300", "9", "<a:wave:5001>"), { content: `[wave](${EMOJI_LINK})` });

    resetPatching({ ...fakeExpressions, preSend: async () => false, preEdit: async () => false });
    assert.equal(await send("300", { nonce: "2", content: "x", hasAttachments: true }), null);
    assert.deepEqual(events, [["recover", "300", "2", true]]);
    assert.equal(await edit("300", "9", "x"), null);
  });

  it("recognizes only links to this instance's emojis and stickers", () => {
    assert.deepEqual(parseFakeExpression(EMOJI_LINK), {
      kind: "emoji",
      id: "5001",
      name: "wave",
      animated: true,
    });
    assert.deepEqual(parseFakeExpression(`${MEDIA}/stickers/7.webp`), {
      kind: "sticker",
      id: "7",
      name: null,
      animated: false,
    });
    assert.equal(parseFakeExpression("https://cdn.example/emojis/5001.webp"), null);
    assert.equal(parseFakeExpression(`${MEDIA}/avatars/5001/abc.webp`), null);
    assert.equal(parseFakeExpression("not a link"), null);
  });

  it("shows fake emoji links as emojis and drops fake sticker links", () => {
    // Shape of Fluxer's MarkdownParseCache, with a parser that only knows links and text.
    const parseModule = compile(
      "function(e,t,n){const i={t:e=>e},a={s:class{constructor(e){this.content=e}parse(){return{nodes:this.content.split(/( )/).filter(Boolean).map(e=>{let t=/^\\[.+\\]\\((.+)\\)$/.exec(e);return t||e.startsWith('http')?{type:'Link',url:t?t[1]:e,escaped:!1}:{type:'Text',content:e}})}}}};let r=new Map;function s({content:e,context:t}){let n=`${t}\\0${e}`,o=r.get(n);if(void 0!==o)return o;let l=(0,i.t)(t),u=new a.s(e,l).parse();return r.set(n,u),u}e.exports=s}",
    );
    const parse = runPatched(pendingFor(fakeExpressions), parseModule);
    const nodes = (content: string) => parse({ content, context: 0 }).nodes;
    const emoji = {
      type: "Emoji",
      kind: { kind: "Custom", name: "wave", id: "5001", animated: true },
      fake: true,
    };
    const link = { type: "Link", url: EMOJI_LINK, escaped: false };

    assert.deepEqual(nodes(EMOJI_LINK), [emoji]);
    assert.deepEqual(nodes(`[anything](${EMOJI_LINK})`), [emoji]);
    assert.deepEqual(nodes(`[hello](${STICKER_LINK})`), []);
    assert.equal(
      parse({ content: EMOJI_LINK, context: 0 }),
      parse({ content: EMOJI_LINK, context: 0 }),
    );
    assert.deepEqual(nodes(`${MEDIA}/emojis/9.webp?name=gone`)[0].kind, {
      kind: "Custom",
      name: "gone",
      id: "9",
      animated: false,
    });
    assert.deepEqual(nodes(`hi ${EMOJI_LINK}`), [
      { type: "Text", content: "hi" },
      { type: "Text", content: " " },
      link,
    ]);

    const store = fakeExpressions.settings.store;
    store.transformCompoundSentence = true;
    assert.deepEqual(nodes(`hi ${EMOJI_LINK}`).at(-1), emoji);
    store.transformEmojis = false;
    assert.deepEqual(nodes(EMOJI_LINK), [link]);
  });

  it("shows fake sticker links as stickers and hides the previews of fake links", () => {
    const jsx = "{jsx:(type,props)=>props}";
    // Shape of the sticker and embed lists in Fluxer's MessageAttachments.
    const attachmentsModule = compile(
      `function(e,t,n){const a=${jsx},rW={ye:0},sN=0,rg=0,l=!1,n2=()=>{};` +
        'e.exports=t=>[t.stickers&&t.stickers.length>0&&(0,a.jsx)("div",{className:rW.ye,"data-flx":"channel.message-attachments.stickers-container",children:t.stickers.map(i=>(0,a.jsx)(sN,{sticker:i,message:t,"data-flx":"channel.message-attachments.sticker-item"},i.id))}),' +
        't.embeds.map((e,i)=>{let r=`${e.id}-${i}`;return(0,a.jsx)(rg,{embed:e,message:t,embedIndex:i,onDelete:n2,isPreview:l,"data-flx":"channel.message-attachments.embed"},r)})]}',
    );
    const render = runPatched(pendingFor(fakeExpressions), attachmentsModule);
    const image = (url: string) => ({ id: "1", type: "image", url });
    const shown = (content: string, embeds: object[] = [], stickers?: object[]) => {
      const [stickerList, embedList] = render({ content, embeds, stickers });
      return {
        stickers: stickerList ? stickerList.children.map((item: any) => item.sticker) : [],
        embeds: embedList.filter(Boolean).length,
      };
    };
    const fakeSticker = { id: "6001", name: "hello", animated: false, fake: true };

    assert.deepEqual(shown(`[hello](${STICKER_LINK})`, [image(STICKER_LINK)]), {
      stickers: [fakeSticker],
      embeds: 0,
    });
    assert.deepEqual(shown(`${MEDIA}/stickers/7.webp?animated=true&name=new`), {
      stickers: [{ id: "7", name: "new", animated: true, fake: true }],
      embeds: 0,
    });
    assert.deepEqual(shown(EMOJI_LINK, [image(EMOJI_LINK)]), { stickers: [], embeds: 0 });
    assert.deepEqual(shown(`look ${STICKER_LINK}`, [image(STICKER_LINK)]), {
      stickers: [],
      embeds: 1,
    });
    assert.deepEqual(shown("https://example.com/cat.png", [image("https://example.com/cat.png")]), {
      stickers: [],
      embeds: 1,
    });
    const real = { id: "6002", name: "home", animated: true };
    assert.deepEqual(shown("hello", [], [real]), { stickers: [real], embeds: 0 });

    const store = fakeExpressions.settings.store;
    store.transformCompoundSentence = true;
    assert.deepEqual(shown(`look ${STICKER_LINK}`, [image(STICKER_LINK)]), {
      stickers: [fakeSticker],
      embeds: 0,
    });
    store.transformStickers = false;
    assert.deepEqual(shown(STICKER_LINK, [image(STICKER_LINK)]), { stickers: [], embeds: 1 });
  });

  it("says in the info card that an emoji or sticker is fake", () => {
    const jsx = "{jsx:(type,props)=>props,jsxs:(type,props)=>props}";
    // Shape of Fluxer's ExpressionInfoCard.
    const cardModule = compile(
      `function(m,t,n){const i=${jsx},l={},o={_:e=>e},F={emoji:"From another server.",sticker:"From another server."};` +
        'm.exports=function(e){let c="default_emoji"===e.kind?null:e.kind,d="default_emoji"===e.kind?null:e.expressionId;return(0,i.jsxs)("div",{className:l.Nr,"data-flx":"expressions.expression-info-card.card",children:[(0,i.jsxs)("div",{className:l.Gd,children:[(0,i.jsxs)("div",{className:l.g5,children:[(0,i.jsx)("span",{className:l.UU,"data-flx":"expressions.expression-info-card.name",children:d}),(0,i.jsx)("span",{className:l.h_,"data-flx":"expressions.expression-info-card.description",children:null==c?o._("Default"):o._(F[c])})]})]}),null!=c]})}}',
    );
    const card = runPatched(pendingFor(fakeExpressions), cardModule);
    const description = (props: object) => card(props).children[0].children[0].children[1].children;
    assert.equal(description({ kind: "emoji", expressionId: "5001" }), "From another server.");
    assert.equal(
      description({ kind: "sticker", expressionId: "6001", influxFake: true }),
      "From another server. This is a fake sticker and looks like a real sticker only for you. People without the plugin see a link.",
    );

    // Shape of the info cards that Fluxer's sticker item and emoji renderer open.
    const stickerModule = compile(
      `function(m,t,n){const a=${jsx},si={N:0},h=null,p="url";` +
        'm.exports=e=>({renderCard:({onClose:t})=>{var n;return(0,a.jsx)(si.N,{kind:"sticker",expressionId:e.id,guildId:null!=(n=null==h?void 0:h.guildId)?n:null,displayName:e.name,previewUrl:p,onClose:t,"data-flx":"channel.message-attachments.sticker-item.expression-info-card"})}})}',
    );
    const stickerItem = runPatched(pendingFor(fakeExpressions), stickerModule);
    assert.equal(stickerItem({ id: "6001", fake: true }).renderCard({}).influxFake, true);
    assert.equal(stickerItem({ id: "6002" }).renderCard({}).influxFake, undefined);

    const emojiModule = compile(
      `function(m,t,n){const i=${jsx},T={N:0},X=null,B="url";` +
        'm.exports=function({node:e,id:t,options:n}){let A={id:e.kind.id,name:e.kind.name};return{renderCard:({onClose:e})=>null!=A.id?(0,i.jsx)(T.N,{kind:"emoji",expressionId:A.id,guildId:null!=X?X:null,displayName:A.name,previewUrl:B,onClose:e,"data-flx":"messaging.markdown.renderers.emoji-renderer.expression-info-card.custom"}):null}}}',
    );
    const emojiRenderer = runPatched(pendingFor(fakeExpressions), emojiModule);
    const node = { kind: { id: "5001", name: "wave" }, fake: true };
    assert.equal(emojiRenderer({ node }).renderCard({ onClose() {} }).influxFake, true);
  });
});
