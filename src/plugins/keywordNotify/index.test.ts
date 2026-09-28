import { beforeEach, describe, it } from "bun:test";
import assert from "node:assert/strict";

import keywordNotify, { matchesKeywords } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(keywordNotify));

describe("KeywordNotify", () => {
  const store = keywordNotify.settings.store as Record<string, unknown>;
  beforeEach(() => {
    store.keywords = "cat, deploy failed, /colou?r/";
    store.wholeWords = true;
    store.caseSensitive = false;
  });

  it("matches whole words, phrases, and regular expressions", () => {
    assert.equal(matchesKeywords("The CAT is here"), true);
    assert.equal(matchesKeywords("new category"), false, "whole words only");
    assert.equal(matchesKeywords("prod: deploy failed again"), true);
    assert.equal(matchesKeywords("what color is it"), true);
    assert.equal(matchesKeywords("nothing to see"), false);
    store.wholeWords = false;
    assert.equal(matchesKeywords("new category"), true);
  });

  it("highlights keyword hits with Fluxer's mention class", () => {
    const rowModule = compile(
      "function(e,t,n){const eM={L8:'mentioned'};" +
        'e.exports=(C,b)=>[!C&&b.isMentioned()&&eM.L8,"channel.message.article.alt-click"]}',
    );
    const classes = runPatched(pendingFor(keywordNotify), rowModule);
    const row = (content: string) => ({
      content,
      author: { id: "2" },
      isMentioned: () => false,
    });
    assert.equal(classes(false, row("a cat appears"))[0], "mentioned");
    assert.equal(classes(false, row("a dog appears"))[0], false);
  });
});
