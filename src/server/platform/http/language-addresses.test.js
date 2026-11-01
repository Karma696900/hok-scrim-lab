// One address per language over HTTP: /fr/heroes answers in French with its own canonical address and the
// links to its 15 versions; a person reading in another language is sent to the address of their language;
// a crawler stays on the English page; the sitemap names every version of every page.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { LANGUAGES } from "../../../shared/i18n.js";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const get = (path, headers = {}) => fetch(`${app.baseUrl}${path}`, { headers, redirect: "manual" });
const alternatesOf = html => [
  ...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)
];

describe("the addresses of the languages", { skip }, () => {
  test("/fr/heroes is the French page, with its canonical address and its 15 versions", async () => {
    const response = await get("/fr/heroes");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html lang="fr"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${app.baseUrl}/fr/heroes">`));
    const links = alternatesOf(html);
    assert.equal(links.length, LANGUAGES.length + 1);
    assert.ok(
      links.some(([, language, href]) => language === "en" && href === `${app.baseUrl}/heroes`)
    );
    assert.ok(
      links.some(([, language, href]) => language === "ja" && href === `${app.baseUrl}/ja/heroes`)
    );
    assert.ok(
      links.some(
        ([, language, href]) => language === "x-default" && href === `${app.baseUrl}/heroes`
      )
    );
  });

  test("the internal links of a French page stay in French", async () => {
    const html = await (await get("/fr/heroes")).text();
    assert.match(html, /<a [^>]*href="\/fr\/tier-list"/);
    assert.doesNotMatch(html, /<a [^>]*href="\/tier-list"/);
  });

  test("an unknown language is a real 404, English has no prefix", async () => {
    assert.equal((await get("/zz/heroes")).status, 404);
    assert.equal((await get("/en/heroes")).status, 404);
  });

  test("a crawler (no cookie, no language) gets the English page, not a redirection", async () => {
    const response = await get("/heroes");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<html lang="en"/);
  });

  test("a person reading in another language is sent to the address of that language", async () => {
    const byCookie = await get("/heroes?q=1", { cookie: "hok_lang=fr" });
    assert.equal(byCookie.status, 302);
    assert.equal(byCookie.headers.get("location"), "/fr/heroes?q=1");
    const byBrowser = await get("/", { "accept-language": "de-DE,de;q=0.9" });
    assert.equal(byBrowser.status, 302);
    assert.equal(byBrowser.headers.get("location"), "/de");
    assert.match(byBrowser.headers.get("vary") ?? "", /Cookie/);
  });

  test("a private page stays out of the index even with a language", async () => {
    const html = await (await get("/fr/space")).text();
    assert.match(html, /<meta name="robots" content="noindex/);
    assert.equal(alternatesOf(html).length, 0);
  });

  test("robots.txt and the sitemap are never redirected; the sitemap names every version", async () => {
    assert.equal((await get("/robots.txt", { cookie: "hok_lang=fr" })).status, 200);
    const sitemap = await get("/sitemap.xml", { cookie: "hok_lang=fr" });
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
    assert.ok(
      xml.includes(`<xhtml:link rel="alternate" hreflang="fr" href="${app.baseUrl}/fr/tier-list"/>`)
    );
    assert.ok(
      xml.includes(
        `<xhtml:link rel="alternate" hreflang="x-default" href="${app.baseUrl}/tier-list"/>`
      )
    );
  });
});
