// Translations: formatting, language choice, and that every catalog covers every key used by the
// code with the same placeholders.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  chooseLanguage,
  createTranslator,
  directionOf,
  format,
  fromAcceptLanguage,
  LANGUAGES,
  matchLanguage
} from "./i18n.js";
import { collectKeys } from "../../scripts/i18n/keys.mjs";

const keys = collectKeys();
const placeholders = text =>
  [...String(text).matchAll(/\{(\w+)\s*[,}]/g)]
    .map(match => match[1])
    .sort()
    .join(",");

describe("message format", () => {
  test("variables, plurals and the number inside a plural", () => {
    assert.equal(format("Hello {name}", { name: "Ana" }), "Hello Ana");
    const message = "{count, plural, one {# game} other {# games}}";
    assert.equal(format(message, { count: 1 }, "en"), "1 game");
    assert.equal(format(message, { count: 5 }, "en"), "5 games");
    assert.equal(
      format("{count, plural, one {# jeu} other {# jeux}}", { count: 0 }, "fr"),
      "0 jeu"
    );
  });
  test("Russian and Arabic plural categories", () => {
    const ru = "{count, plural, one {# игра} few {# игры} many {# игр} other {# игры}}";
    assert.deepEqual(
      [1, 3, 5, 21].map(count => format(ru, { count }, "ru")),
      ["1 игра", "3 игры", "5 игр", "21 игра"]
    );
    const ar =
      "{count, plural, zero {لا شيء} one {واحد} two {اثنان} few {# قليل} many {# كثير} other {#}}";
    assert.equal(format(ar, { count: 2 }, "ar"), "اثنان");
    assert.equal(format(ar, { count: 3 }, "ar"), "3 قليل");
  });
  test("a missing variable stays visible instead of silently vanishing", () => {
    assert.equal(format("Hi {who}", {}), "Hi {who}");
  });
  test("the source text is the fallback", () => {
    assert.equal(createTranslator("fr", {})("Sign in"), "Sign in");
    assert.equal(createTranslator("fr", { "Sign in": "Se connecter" })("Sign in"), "Se connecter");
  });
});

describe("language choice", () => {
  test("browser tags map to the supported languages", () => {
    assert.equal(matchLanguage("pt-BR"), "pt");
    assert.equal(matchLanguage("zh-Hans-CN"), "zh");
    assert.equal(matchLanguage("in"), "id");
    assert.equal(matchLanguage("nb"), null);
  });
  test("Accept-Language is read by quality, then by order", () => {
    assert.equal(fromAcceptLanguage("nb,fr;q=0.8,en;q=0.5"), "fr");
    assert.equal(fromAcceptLanguage("en;q=0.2,de;q=0.9"), "de");
    assert.equal(fromAcceptLanguage("xx,yy"), null);
    assert.equal(fromAcceptLanguage("fr;q=0"), null);
    assert.equal(fromAcceptLanguage("x".repeat(5000)), null);
  });
  test("a saved choice wins over the browser; English is the last resort", () => {
    assert.equal(chooseLanguage({ saved: "ja", acceptLanguage: "fr" }), "ja");
    assert.equal(chooseLanguage({ saved: "xx", acceptLanguage: "fr" }), "fr");
    assert.equal(chooseLanguage({ acceptLanguage: "xx" }), "en");
  });
  test("Arabic is right-to-left, the others are not", () => {
    assert.deepEqual(
      LANGUAGES.filter(language => directionOf(language.code) === "rtl").map(
        language => language.code
      ),
      ["ar"]
    );
  });
});

describe("catalogs", () => {
  test("the code uses a sensible number of keys", () => assert.ok(keys.size > 600));

  for (const { code } of LANGUAGES.filter(language => language.code !== "en")) {
    test(`${code}: every key is translated, nothing is stale, placeholders and plurals match`, async () => {
      const file = new URL(`../public/locales/${code}.js`, import.meta.url);
      assert.ok(existsSync(file), `src/public/locales/${code}.js is missing (run: npm run i18n)`);
      const catalog = (await import(file.href)).default;
      const missing = [...keys.keys()].filter(key => !Object.hasOwn(catalog, key));
      assert.deepEqual(
        missing.slice(0, 5),
        [],
        `${missing.length} keys are not translated in ${code}`
      );
      const stale = Object.keys(catalog).filter(key => !keys.has(key));
      assert.deepEqual(stale.slice(0, 5), [], "catalog entries for keys no longer in the code");
      const wrong = Object.entries(catalog).filter(
        ([key, value]) => placeholders(key) !== placeholders(value)
      );
      assert.deepEqual(wrong.slice(0, 3), [], "placeholders must be identical to the English text");
      const empty = Object.entries(catalog).filter(([, value]) => !String(value).trim());
      assert.deepEqual(empty, []);
      const unbalanced = Object.entries(catalog).filter(
        ([, value]) => (value.match(/\{/g) ?? []).length !== (value.match(/\}/g) ?? []).length
      );
      assert.deepEqual(unbalanced.slice(0, 3), []);
    });
  }

  test("the HTML shell only uses {{t:…}} keys the collector knows", () => {
    const shell = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
    for (const [, key] of shell.matchAll(/\{\{t:([^}]+)\}\}/g)) {
      assert.ok(keys.has(key), key);
    }
  });
});
