import { beforeEach, describe, it, spyOn } from "bun:test";
import assert from "node:assert/strict";

import platformIndicators from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";
import showMeYourName from "../showMeYourName";

beforeEach(() => resetPatching(platformIndicators, showMeYourName));

const jsx =
  "{jsx:(c,p)=>c===Influx.plugins.PlatformIndicators.PlatformIndicator?p:c===tD?'name':'tag'}";

describe("PlatformIndicators", () => {
  it("adds the icon before the bot tag in the member list", () => {
    const code =
      `function(e,t,n){const o=${jsx},tD=0,iN={A:2},Su={o:1},Sm={a1:0},l={id:"7",bot:true,system:false},s="5",_="idle";` +
      'e.exports=[(0,o.jsx)(iN.A,{user:l,size:32,guildId:s,status:_,"data-flx":"channel.member-list-item.status-aware-avatar"}),l.bot&&(0,o.jsx)(Su.o,{className:Sm.a1,system:l.system,"data-flx":"channel.member-list-item.user-tag"})]}';
    assert.deepEqual(runPatched(pendingFor(platformIndicators), compile(code)), [
      "tag",
      {
        user: { id: "7", bot: true, system: false },
        guildId: "5",
        status: "idle",
        place: "memberList",
      },
      "tag",
    ]);
  });

  it("passes the avatar its status badge", () => {
    const code =
      'function(e,t,n){const i={jsx:(c,p)=>p},s={e:0},e2={id:"7"},C="idle",I=true,v=false,z=32,f="5";' +
      'e.exports=(0,i.jsx)(s.e,{user:e2,size:z,status:C,isMobileStatus:I,guildId:f,animateStatusCutout:v,"data-flx":"ui.status-aware-avatar.avatar"})}';
    const calls: unknown[][] = [];
    const avatarBadge = spyOn(platformIndicators, "avatarBadge").mockImplementation(
      (...values: unknown[]) => (calls.push(values), { customStatusBadgeLabel: "badge" } as any),
    );
    try {
      const props = runPatched(pendingFor(platformIndicators), compile(code));
      assert.deepEqual(calls, [[{ id: "7" }, "5", "idle"]]);
      assert.equal(props.customStatusBadgeLabel, "badge");
      assert.equal(props.size, 32);
    } finally {
      avatarBadge.mockRestore();
    }
  });

  it("passes the avatar in chat its badge", () => {
    const code =
      'function(e,t,n){const d={jsx:(c,p)=>p},tX={e:0},e2={id:"7"},i=40,a="",r=false,n2="1";' +
      'e.exports=(0,d.jsx)(tX.e,{user:e2,size:i,className:a,forceAnimate:r,guildId:n2,"data-user-id":e2.id,"data-guild-id":n2,"data-flx":"channel.message-avatar.avatar"})}';
    const calls: unknown[][] = [];
    const messageAvatarBadge = spyOn(platformIndicators, "messageAvatarBadge").mockImplementation(
      (...values: unknown[]) => (calls.push(values), { customStatusBadgeLabel: "badge" } as any),
    );
    try {
      const props = runPatched(pendingFor(platformIndicators), compile(code));
      assert.deepEqual(calls, [[{ id: "7" }, "1"]]);
      assert.equal(props.customStatusBadgeLabel, "badge");
      assert.equal(props.size, 40);
    } finally {
      messageAvatarBadge.mockRestore();
    }
  });

  const messageCode =
    `function(e,t,n){const d=${jsx},tD=0,eM={um:0},N=null,O=null,v={id:"7",username:"kim"},r={webhookId:"1"};` +
    'e.exports=[(0,d.jsx)(tD,{user:v,message:r,guild:N,member:null!=O?O:void 0,className:eM.um,"data-flx":"channel.user-message.message-username--2"})]}';
  const expected = [
    "name",
    null,
    { user: { id: "7", username: "kim" }, message: { webhookId: "1" }, place: "messages" },
  ];

  it("adds the icon after the author name and ShowMeYourName's username", () => {
    const patches = [...pendingFor(showMeYourName), ...pendingFor(platformIndicators)];
    assert.deepEqual(runPatched(patches, compile(messageCode)), expected);
  });

  it("keeps that order when its patch runs before ShowMeYourName's", () => {
    const patches = [...pendingFor(platformIndicators), ...pendingFor(showMeYourName)];
    assert.deepEqual(runPatched(patches, compile(messageCode)), expected);
  });
});
