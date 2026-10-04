import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import userVoiceShow from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";
import platformIndicators from "../platformIndicators";
import showMeYourName from "../showMeYourName";

beforeEach(() => resetPatching(userVoiceShow, platformIndicators, showMeYourName));

const jsx =
  "{jsx:(type,props)=>type===Influx.plugins.UserVoiceShow.VoiceChannelIndicator?props:type===Influx.plugins.PlatformIndicators?.PlatformIndicator?'platform':props['data-flx']??props}";

describe("UserVoiceShow", () => {
  it("adds the indicator next to the name in profile popouts", () => {
    const cardModule = compile(
      `function(e,t,n){const i=${jsx},a={o:0},l={fC:0,NW:0},A=false;` +
        'e.exports=n=>({className:l.fC,"data-flx":"user.profile.profile-card.profile-card-user-info.badge-container",children:(n.bot||A)&&(0,i.jsx)(a.o,{className:l.NW,system:n.system,"data-flx":"user.profile.profile-card.profile-card-user-info.user-tag-wrapper"})}).children}',
    );
    const render = runPatched(pendingFor(userVoiceShow), cardModule);
    assert.deepEqual(render({ id: "7", bot: false }), [{ userId: "7", isProfile: true }, false]);
    assert.deepEqual(render({ id: "8", bot: true, system: false }), [
      { userId: "8", isProfile: true },
      "user.profile.profile-card.profile-card-user-info.user-tag-wrapper",
    ]);
  });

  it("adds the indicator next to the name in full profiles", () => {
    const profileModule = compile(
      `function(e,t,n){const i=${jsx},eb={o:0},D={a1:0};` +
        'e.exports=(e,o)=>[o,e.bot&&(0,i.jsx)(eb.o,{className:D.a1,system:e.system,size:"lg","data-flx":"user.user-profile-modal.user-info.user-tag"})]}',
    );
    const render = runPatched(pendingFor(userVoiceShow), profileModule);
    assert.deepEqual(render({ id: "7", bot: false }, "Kim"), [
      "Kim",
      { userId: "7", isProfile: true },
      false,
    ]);
  });

  it("adds the indicator before the bot tag in the member list, beside the platform icon", () => {
    const memberModule = compile(
      `function(e,t,n){const o=${jsx},Sp={o:0},Sh={a1:0},s="5",_="idle";` +
        'e.exports=l=>[(0,o.jsx)(Sp.o,{user:l,guildId:s,status:_,"data-flx":"channel.member-list-item.status-aware-avatar"}),l.bot&&(0,o.jsx)(Sp.o,{className:Sh.a1,system:l.system,"data-flx":"channel.member-list-item.user-tag"})]}',
    );
    const patches = [...pendingFor(platformIndicators), ...pendingFor(userVoiceShow)];
    assert.deepEqual(runPatched(patches, memberModule)({ id: "7", bot: false }), [
      "channel.member-list-item.status-aware-avatar",
      "platform",
      { userId: "7" },
      false,
    ]);
  });

  it("adds the indicator to both layouts of a direct message row, and skips groups", () => {
    const row = (suffix: string) =>
      `!n&&h&&(0,o.jsx)(Sp.o,{className:En.IC,system:null==a?void 0:a.system,"data-flx":"channel.direct-message.dm-list-item.dm-item-user-tag${suffix}"})`;
    const directMessageModule = compile(
      `function(e,t,n){const o=${jsx},Sp={o:0},En={IC:0};` +
        `e.exports=(a,n,h)=>[${row("")},${row("--2")}]}`,
    );
    const render = runPatched(pendingFor(userVoiceShow), directMessageModule);
    assert.deepEqual(render({ id: "7" }, false, false), [
      { userId: "7" },
      false,
      { userId: "7" },
      false,
    ]);
    assert.deepEqual(render(undefined, true, false)[0], { userId: undefined });
  });

  it("adds the indicator as the first action of a friend's row", () => {
    const friendModule = compile(
      `function(e,t,n){const o=${jsx},Rc="ActionButton";` +
        "e.exports=e=>{let{userId:i,relationshipType:l,openProfile:r}=e,D=[{tooltip:'Message',icon:'chat'}];" +
        'return D.length&&{children:D.map((e,t)=>(0,o.jsx)(Rc,{tooltip:e.tooltip,onClick:e.onClick,className:e.className,danger:e.danger,"data-flx":"channel.friends.friend-list-item.action-button.click",children:e.icon},t))}.children}}',
    );
    const render = runPatched(pendingFor(userVoiceShow), friendModule);
    assert.deepEqual(render({ userId: "7", relationshipType: 1 }), [
      { userId: "7", ActionButton: "ActionButton" },
      ["channel.friends.friend-list-item.action-button.click"],
    ]);
  });

  const messageCode =
    `function(e,t,n){const d=${jsx},t9=0,eF={um:0},M=null,O=null,v={id:"7",username:"kim"},r={webhookId:null};` +
    'e.exports=[(0,d.jsx)(t9,{user:v,message:r,guild:M,member:null!=O?O:void 0,className:eF.um,"data-flx":"channel.user-message.message-username--2"})]}';

  it("adds the indicator after the author name in messages, after what other plugins add", () => {
    const plugins = [showMeYourName, platformIndicators, userVoiceShow];
    for (const order of [plugins, plugins.toReversed()]) {
      const [name, username, platform, indicator] = runPatched(
        order.flatMap(pendingFor),
        compile(messageCode),
      );
      assert.equal(name, "channel.user-message.message-username--2");
      assert.equal(username, null);
      assert.equal(platform, "platform");
      assert.deepEqual(indicator, { userId: "7", isMessage: true });
      resetPatching(userVoiceShow, platformIndicators, showMeYourName);
    }
  });
});
