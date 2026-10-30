import assert from "node:assert/strict";
import test from "node:test";
import { LEGAL_INFO, REQUIRED_FIELDS, missingFields } from "../../../shared/legal-info.js";
import { LEGAL_VIEWS, matchRoute, pathFor } from "../../../shared/routes.js";
import { TEXTS, textLanguage } from "./texts.js";
import { parseContactMessage } from "../../../server/features/contact/contact-routes.js";

const DOCS = ["terms", "privacy", "cookies", "legal"];
const FACT_TOKENS = new Set([
  "publisher",
  "publisherKind",
  "email",
  "host",
  "hostAddress",
  "hostContact",
  "country",
  "updated"
]);

test("the legal pages are routes of their own, public and indexed, and pathFor is their inverse", () => {
  assert.deepEqual(LEGAL_VIEWS, ["terms", "privacy", "cookies", "legal", "contact"]);
  for (const view of LEGAL_VIEWS) {
    const matched = matchRoute(`/${view}`);
    assert.equal(matched.view, view);
    assert.equal(matched.route.index, true);
    assert.ok(matched.route.title && matched.route.description);
    assert.equal(pathFor({ view }), `/${view}`);
  }
});

test("French and English tell the same thing: the same pages, the same number of blocks of each kind", () => {
  const shape = doc => doc.blocks.map(block => Object.keys(block)[0]).join("");
  for (const name of DOCS) {
    assert.ok(TEXTS.en[name].title && TEXTS.fr[name].title);
    assert.equal(shape(TEXTS.fr[name]), shape(TEXTS.en[name]), `${name}: the structure differs`);
    const lists = doc => doc.blocks.filter(block => block.ul).map(block => block.ul.length);
    assert.deepEqual(lists(TEXTS.fr[name]), lists(TEXTS.en[name]), `${name}: a list differs`);
  }
});

test("a token of a text is a fact that page.js fills in, the same ones in both languages", () => {
  for (const language of ["en", "fr"]) {
    for (const name of DOCS) {
      for (const block of TEXTS[language][name].blocks) {
        const text = [block.h, block.p, ...(block.ul ?? [])].filter(Boolean).join(" ");
        for (const [, token] of text.matchAll(/\{(\w+)\}/g)) {
          assert.ok(FACT_TOKENS.has(token), `${language}/${name}: unknown {${token}}`);
        }
      }
    }
  }
});

test("the texts say what the code really does", () => {
  const privacy = JSON.stringify(TEXTS.en.privacy);
  const cookies = JSON.stringify(TEXTS.en.cookies);
  // the retention is the one of the sessions, which is written in the identity module
  assert.match(privacy, /14 days/);
  assert.match(privacy, /180 days/);
  assert.match(privacy, /12 months/);
  for (const cookie of [
    "hok_session",
    "hok_lang",
    "hok_theme",
    "hok_challenge",
    "hok_oauth_state"
  ]) {
    assert.ok(cookies.includes(cookie), `the cookie ${cookie} is not listed`);
  }
});

test("a language other than French reads the English reference", () => {
  assert.equal(textLanguage("fr"), "fr");
  for (const language of ["en", "de", "ar", "zh", "ja"]) {
    assert.equal(textLanguage(language), "en");
  }
});

test("the facts the owner has to write are listed, and an empty one is reported", () => {
  assert.deepEqual(missingFields({}), REQUIRED_FIELDS);
  assert.deepEqual(
    missingFields({
      ...LEGAL_INFO,
      publisher: "X",
      contactEmail: "a@b.c",
      hostName: "H",
      hostAddress: "A"
    }),
    []
  );
  // not a failure: it is the list of what is left to write before the site is public
  const left = missingFields();
  if (left.length) {
    console.log(`legal-info.js: still to write: ${left.join(", ")}`);
  }
});

test("the contact form: a name, a real address, a subject and a message with its line breaks", () => {
  const ok = parseContactMessage({
    name: " Ada ",
    email: "ADA@Example.com",
    subject: "Hi",
    message: "Hello,\nthis is long enough."
  });
  assert.deepEqual(ok, {
    name: "Ada",
    email: "ada@example.com",
    subject: "Hi",
    message: "Hello,\nthis is long enough."
  });
  for (const bad of [
    { name: "", email: "a@b.co", subject: "s", message: "long enough here" },
    { name: "n", email: "nope", subject: "s", message: "long enough here" },
    { name: "n", email: "a@b.co", subject: "", message: "long enough here" },
    { name: "n", email: "a@b.co", subject: "s", message: "short" },
    { name: "n", email: "a@b.co", subject: "s", message: "x".repeat(4001) },
    "text"
  ]) {
    assert.throws(() => parseContactMessage(bad));
  }
});
