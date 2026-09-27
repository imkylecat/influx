import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { nagbarPartsSource } from "./banner";

describe("RelationshipNotifier banner", () => {
  it("finds Fluxer's nagbar parts in the nagbar module", () => {
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
