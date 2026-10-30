// Real URLs: route table, per-page head (title, description, canonical, robots), 404 status,
// robots.txt, sitemap.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  AUTH_VIEWS,
  matchRoute,
  pathFor,
  safeNext,
  visitorAccountButtons
} from "../../../shared/routes.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

describe("route table", () => {
  test("every path maps to a view and back", () => {
    for (const [path, view] of [
      ["/", "home"],
      ["/heroes", "heroes"],
      ["/teams", "teams"],
      ["/tier-lists", "tier-lists"],
      ["/scrims", "scrims"],
      ["/history", "history"],
      ["/login", "login"],
      ["/login/mfa", "mfa"],
      ["/login/setup", "setup"],
      ["/register", "register"],
      ["/account", "account"],
      ["/guides", "guides"],
      ["/ratings", "ratings"],
      ["/space", "space"],
      ["/space/shared", "space-shared"]
    ]) {
      assert.equal(matchRoute(path).view, view, path);
      assert.equal(pathFor({ view }), path);
    }
    assert.deepEqual(
      [matchRoute("/heroes/533").view, matchRoute("/heroes/533").heroId],
      ["hero", "533"]
    );
    assert.equal(pathFor({ view: "hero", heroId: "533" }), "/heroes/533");
    assert.deepEqual(
      [matchRoute("/guides/533").view, matchRoute("/guides/533").guideHeroId],
      ["guides", "533"],
      "the guides editor, on a hero"
    );
    assert.equal(matchRoute("/guides/h05").guideHeroId, "h05");
    assert.equal(pathFor({ view: "guides", guideHeroId: "533" }), "/guides/533");
    const team = "16e11da1-7c03-422a-b39e-69742cd5f4c7";
    assert.deepEqual(
      [matchRoute(`/teams/${team}`).view, matchRoute(`/teams/${team}`).teamId],
      ["team", team]
    );
    assert.equal(pathFor({ view: "team", teamId: team }), `/teams/${team}`);
    const id = "16e11da1-7c03-422a-b39e-69742cd5f4c6";
    assert.deepEqual(
      [matchRoute(`/scrims/${id}`).view, matchRoute(`/scrims/${id}`).seriesId],
      ["scrims", id]
    );
    assert.equal(pathFor({ view: "scrims", seriesId: id }), `/scrims/${id}`);
    assert.equal(matchRoute("/heroes/").view, "heroes", "a trailing slash is ignored");
  });
  test("unknown or malformed paths are not-found", () => {
    for (const path of [
      "/nope",
      "/heroes/abc",
      "/heroes/1234567",
      "/guides/a/b",
      "/guides/../x",
      "/scrims/not-a-uuid",
      "/login/other",
      "/api/series",
      "/..%2f",
      "//evil"
    ]) {
      assert.equal(matchRoute(path).view, "not-found", path);
    }
  });
  test("every page is crawlable: they are shells without private data (search engines fold them with the canonical URL)", () => {
    for (const path of [
      "/",
      "/heroes",
      "/heroes/533",
      "/tier-lists",
      "/scrims",
      "/history",
      "/login",
      "/register",
      "/account",
      "/login/mfa",
      "/login/setup"
    ]) {
      assert.equal(matchRoute(path).route.index, true, path);
    }
  });
  test("the post-login destination is validated", () => {
    assert.equal(safeNext("/scrims?x=1"), "/scrims?x=1");
    assert.equal(safeNext("/?join=abc"), "/?join=abc");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "javascript:alert(1)",
      "/login",
      "/register",
      "/nowhere",
      "",
      null,
      undefined,
      5,
      `/${"a".repeat(600)}`,
      "/\n//evil"
    ]) {
      assert.equal(safeNext(bad), "/", String(bad).slice(0, 30));
    }
    assert.ok(AUTH_VIEWS.includes("login"));
  });
  test("a visitor's top bar has no account button when the server takes no new accounts", () => {
    const open = visitorAccountButtons("/training", "Sign in", "Create account");
    assert.match(open, /btn--ghost" href="\/login\?next=%2Ftraining">Sign in<\/a>/);
    assert.match(open, /btn--primary" href="\/register">Create account/);
    const closed = visitorAccountButtons("/training", "Sign in", "");
    assert.doesNotMatch(closed, /\/register/);
    assert.match(closed, /btn--primary" href="\/login\?next=%2Ftraining">Sign in<\/a>$/);
  });
});

const app = await startTestServer({ seedHeroes: false });
if (app) {
  await app.store.saveHeroes(
    sampleHeroes(5).map((hero, index) => ({
      ...hero,
      id: String(500 + index),
      name: index === 0 ? "Flowborn (Tank)" : `Hero <b>${index}</b>`
    })),
    "20260925"
  );
}
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const head = html => ({
  title: html.match(/<title>([^<]*)<\/title>/)?.[1],
  description: html.match(/<meta name="description" content="([^"]*)"/)?.[1],
  canonical: html.match(/<link rel="canonical" href="([^"]*)"/)?.[1],
  robots: html.match(/<meta name="robots" content="([^"]*)"/)?.[1]
});

describe("pages over HTTP", { skip }, () => {
  test("each public page has its own title, description and canonical URL, and is indexable", async () => {
    const seen = new Set();
    for (const path of ["/", "/heroes", "/tier-lists"]) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 200, path);
      const meta = head(await response.text());
      assert.ok(meta.title.length >= 20 && meta.title.length <= 90, `${path}: ${meta.title}`);
      assert.ok(
        meta.description.length >= 50 && meta.description.length <= 200,
        `${path}: description length ${meta.description.length}`
      );
      assert.equal(meta.canonical, `${app.baseUrl}${path}`);
      assert.equal(meta.robots, "index, follow");
      assert.ok(!seen.has(meta.title), "titles are unique");
      seen.add(meta.title);
    }
  });

  test("a hero page is described from its data, escaped, and Flowborn is simply Flowborn", async () => {
    const hero = head(await (await fetch(`${app.baseUrl}/heroes/501`)).text());
    assert.match(hero.title, /^Hero &lt;b&gt;1&lt;\/b&gt; — Honor of Kings Global hero guide/);
    assert.doesNotMatch(hero.description, /<b>/);
    assert.equal(hero.canonical, `${app.baseUrl}/heroes/501`);
    const flowborn = head(await (await fetch(`${app.baseUrl}/heroes/500`)).text());
    assert.match(flowborn.title, /^Flowborn — /);
    assert.doesNotMatch(flowborn.title, /Tank/);
  });

  test("account and app pages carry no private data, are crawlable, and have unique titles", async () => {
    const titles = new Set();
    for (const path of [
      "/login",
      "/register",
      "/account",
      "/login/mfa",
      "/login/setup",
      "/scrims",
      "/history"
    ]) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      const meta = head(html);
      assert.equal(meta.robots, "index, follow", path);
      assert.ok(!titles.has(meta.title), "unique title");
      titles.add(meta.title);
      assert.doesNotMatch(html, /session|token|password_hash/i, "the shell holds nothing private");
    }
  });

  test("unknown pages and unknown heroes answer a real 404 (with the shell); the status is what keeps them out of the index, so the page itself does not say noindex", async () => {
    for (const path of ["/nope", "/heroes/999999", "/heroes/abc", "/login/other", "/scrims/xyz"]) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 404, path);
      const meta = head(await response.text());
      assert.equal(meta.robots, "index, follow", path);
      assert.match(meta.title, /not found/i);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
    }
    assert.equal((await fetch(`${app.baseUrl}/api/nope`)).status, 404);
  });

  test("a team page answers 200 while the team exists and a real 404 once it is gone, or never was", async () => {
    const owner = await app.signIn("PageOwner");
    const created = await owner.browser.post("/api/teams", {
      name: "Page Squad",
      tag: "PGSQ",
      description: "",
      region: "EU",
      timezone: "UTC+1",
      languages: ["en"],
      level: "amateur"
    });
    const path = `/teams/${created.body.id}`;
    const present = await fetch(`${app.baseUrl}${path}`);
    assert.equal(present.status, 200);
    assert.equal(head(await present.text()).robots, "index, follow");

    assert.equal((await owner.browser.delete(`/api/teams/${created.body.id}`)).status, 200);
    for (const missing of [path, "/teams/00000000-0000-4000-8000-000000000000"]) {
      const response = await fetch(`${app.baseUrl}${missing}`);
      assert.equal(response.status, 404, missing);
      const meta = head(await response.text());
      assert.equal(meta.robots, "index, follow", missing);
      assert.match(meta.title, /not found/i, missing);
      assert.equal(response.headers.get("cache-control"), "no-store", missing);
    }
  });

  test("a private page says noindex to whoever has no session, and is plain to the person who has one", async () => {
    const person = await app.signIn("RobotsPerson");
    const cookie = `hok_session=${person.browser.jar.get("hok_session")}`;
    for (const path of ["/agenda", "/inbox", "/ratings"]) {
      const crawler = head(await (await fetch(`${app.baseUrl}${path}`)).text());
      assert.equal(crawler.robots, "noindex, nofollow", `${path} for a visitor`);
      const signedIn = head(
        await (await fetch(`${app.baseUrl}${path}`, { headers: { cookie } })).text()
      );
      assert.equal(signedIn.robots, "index, follow", `${path} for a signed-in person`);
    }
  });

  test("the shared space page is indexable: the secret of a link is after the #, so everybody gets the same page", async () => {
    const visitor = head(await (await fetch(`${app.baseUrl}/space/shared`)).text());
    assert.equal(visitor.robots, "index, follow");
    // and it stays out of the sitemap: there is nothing to read there without a link
    const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    assert.doesNotMatch(sitemap, /\/space\/shared/);
  });

  test("robots.txt is real text: it blocks only the API and points to the sitemap", async () => {
    const response = await fetch(`${app.baseUrl}/robots.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    const text = await response.text();
    for (const line of [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /auth/",
      `Sitemap: ${app.baseUrl}/sitemap.xml`
    ]) {
      assert.ok(text.includes(line), line);
    }
    assert.ok(
      !/Disallow: \/(login|account|scrims|history|register)/.test(text),
      "pages are crawlable: blocking them would also lower their SEO score"
    );
  });

  test("sitemap.xml lists the public pages and every hero, valid XML with absolute URLs", async () => {
    const response = await fetch(`${app.baseUrl}/sitemap.xml`);
    assert.match(response.headers.get("content-type"), /xml/);
    const xml = await response.text();
    assert.match(
      xml,
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/
    );
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    for (const path of ["/", "/heroes", "/tier-lists", "/heroes/500", "/heroes/504"]) {
      assert.ok(urls.includes(`${app.baseUrl}${path}`), path);
    }
    assert.ok(urls.every(url => url.startsWith(app.baseUrl)));
    assert.ok(!urls.some(url => /login|account|scrims|history|api/.test(url)));
  });

  test("the sitemap also lists the build lab and the popular pages", async () => {
    const xml = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    for (const path of [
      "/build-lab",
      "/popular",
      "/popular/heroes",
      "/items",
      "/arcana",
      "/spells"
    ]) {
      assert.ok(xml.includes(`<loc>${app.baseUrl}${path}</loc>`), path);
    }
  });

  test("llms.txt describes the site in plain text and points to the public pages and the sitemap", async () => {
    const response = await fetch(`${app.baseUrl}/llms.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    const body = await response.text();
    assert.match(body, /^# /);
    for (const path of ["/heroes", "/tier-lists", "/sitemap.xml"]) {
      assert.ok(body.includes(`${app.baseUrl}${path}`), path);
    }
    assert.ok(
      !body.includes("/login") && !body.includes("/account"),
      "no private page is advertised"
    );
  });

  test("an indexable page carries its schema.org data as JSON-LD, a private or missing page carries none", async () => {
    const ld = html =>
      [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match =>
        JSON.parse(match[1])
      );
    const home = ld(await (await fetch(app.baseUrl)).text());
    assert.equal(home.length, 1);
    assert.equal(home[0]["@type"], "WebSite");
    const hero = ld(await (await fetch(`${app.baseUrl}/heroes/500`)).text());
    assert.equal(hero.length, 1);
    assert.equal(hero[0].breadcrumb.itemListElement.length, 3);
    assert.deepEqual(ld(await (await fetch(`${app.baseUrl}/settings`)).text()), [], "noindex page");
    assert.deepEqual(ld(await (await fetch(`${app.baseUrl}/nope`)).text()), [], "404");
  });

  test("/index.html is not a second copy of the home page", async () => {
    const response = await fetch(`${app.baseUrl}/index.html`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "/");
  });

  test("the shell links to its assets with absolute paths so deep URLs load", async () => {
    const html = await (await fetch(`${app.baseUrl}/heroes/501`)).text();
    for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|svg))"/g)) {
      assert.equal((await fetch(`${app.baseUrl}${url}`)).status, 200, url);
    }
    assert.match(
      html,
      /<a class="nav-link[^"]*" data-module="heroes" data-view="heroes" href="\/heroes"/
    );
  });

  test("a deep link to an app page still sets the security headers", async () => {
    const response = await fetch(`${app.baseUrl}/heroes/501`);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  });
});
