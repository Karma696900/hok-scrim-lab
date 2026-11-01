// One address per language: /fr/heroes is the French page of /heroes; English has no prefix.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LANGUAGES } from "./i18n.js";
import { alternates, localePath, splitLanguage } from "./locale-path.js";

describe("the language of an address", () => {
  test("a known prefix is the language, the rest is the page", () => {
    assert.deepEqual(splitLanguage("/fr/heroes"), { language: "fr", path: "/heroes" });
    assert.deepEqual(splitLanguage("/fr"), { language: "fr", path: "/" });
    assert.deepEqual(splitLanguage("/fr/"), { language: "fr", path: "/" });
    assert.deepEqual(splitLanguage("/ar/tier-list/jungle"), {
      language: "ar",
      path: "/tier-list/jungle"
    });
  });

  test("no prefix, an unknown one or English: no language, the address is unchanged", () => {
    assert.deepEqual(splitLanguage("/heroes"), { language: null, path: "/heroes" });
    assert.deepEqual(splitLanguage("/"), { language: null, path: "/" });
    assert.deepEqual(splitLanguage("/zz/heroes"), { language: null, path: "/zz/heroes" });
    assert.deepEqual(splitLanguage("/en/heroes"), { language: null, path: "/en/heroes" });
    // a page whose name starts like a language is not a language
    assert.deepEqual(splitLanguage("/french"), { language: null, path: "/french" });
  });

  test("localePath puts the prefix back, English stays bare", () => {
    assert.equal(localePath("/heroes", "fr"), "/fr/heroes");
    assert.equal(localePath("/", "fr"), "/fr");
    assert.equal(localePath("/heroes", "en"), "/heroes");
    assert.equal(localePath("/heroes", null), "/heroes");
    assert.equal(localePath("/heroes", "zz"), "/heroes");
  });

  test("the round trip keeps the page, in every language", () => {
    for (const { code } of LANGUAGES) {
      for (const path of ["/", "/heroes", "/items/12", "/tier-list/mid"]) {
        const split = splitLanguage(localePath(path, code));
        assert.equal(split.path, path, `${code} ${path}`);
        assert.equal(split.language, code === "en" ? null : code);
      }
    }
  });

  test("alternates name the page once per language", () => {
    const list = alternates("/heroes");
    assert.equal(list.length, LANGUAGES.length);
    assert.deepEqual(
      list.find(entry => entry.language === "en"),
      {
        language: "en",
        path: "/heroes"
      }
    );
    assert.deepEqual(
      list.find(entry => entry.language === "ar"),
      {
        language: "ar",
        path: "/ar/heroes"
      }
    );
  });
});
