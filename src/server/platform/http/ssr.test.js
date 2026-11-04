// Server-side rendering of the first screen: who gets it, what the page looks like, the CSP, and
// that nothing nests or leaks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { after, describe, test } from "node:test";
import { firstPaintParts, firstPaintPlan, stylesheetParts } from "./first-paint.js";
import {
  FRAME_VIEWS,
  SSR_VIEWS,
  TRAINING_PATHS,
  ROOM_FRAME_VIEW,
  VISITOR_FRAME_VIEWS
} from "./page-handler.js";
import { createPrerenderer } from "./prerender.js";
import { WEB } from "./web-root.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const calls = [];
const stub = {
  token: "secret-token",
  get: async (path, language, options = {}) => {
    calls.push([path, language, options.variant ?? ""]);
    return {
      view: `<div class="page-head"><h1>Drawn ${path} ${language}</h1></div>`,
      // a frame is the same for every person: the chip is theirs, drawn by the browser (prerender.js)
      account: options.variant ? "" : '<a href="/login">Sign in</a>'
    };
  }
};
const app = await startTestServer({ seedHeroes: false, prerender: stub });
if (app) {
  await app.store.saveHeroes(
    sampleHeroes(5).map((hero, index) => ({ ...hero, id: String(500 + index) })),
    "20260925"
  );
}
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const page = (path, headers = {}) =>
  fetch(`${app.baseUrl}${path}`, { headers }).then(async response => ({
    response,
    html: await response.text()
  }));

describe("server-rendered first screen", { skip }, () => {
  test("an anonymous visitor receives the page already drawn, in their language, with the account control", async () => {
    calls.length = 0;
    const { html } = await page("/fr/heroes");
    assert.match(
      html,
      /<main id="view" class="host app-view" tabindex="-1" data-ssr="1"><div class="page-head"><h1>Drawn \/heroes fr<\/h1>/
    );
    assert.match(
      html,
      /<div id="account-control" class="account-control"><a href="\/fr\/login">Sign in<\/a><\/div>/
    );
    assert.deepEqual(calls, [["/heroes", "fr", ""]]);
  });

  test("a drawn page is marked on <html> so that it comes in without entrance animations; a plain shell is not", async () => {
    const drawn = (await page("/heroes")).html;
    assert.match(drawn, /<html lang="en" dir="ltr" data-theme="dark" class="ssr-first">/);
    const plain = (await page("/nope")).html;
    assert.match(plain, /<html lang="en" dir="ltr" data-theme="dark">/);
    assert.doesNotMatch(plain, /ssr-first/);
  });

  test("every public view is drawn, a hero too; an unknown page and a series link are not", async () => {
    for (const path of [
      "/",
      "/heroes",
      "/heroes/501",
      "/tier-lists",
      "/scrims",
      "/history",
      "/login",
      "/register"
    ]) {
      assert.match((await page(path)).html, /data-ssr="1"/, path);
    }
    for (const path of [
      "/nope",
      "/heroes/999999",
      "/scrims/16e11da1-7c03-422a-b39e-69742cd5f4c6",
      "/account",
      "/login/mfa",
      "/login/setup"
    ]) {
      assert.doesNotMatch((await page(path)).html, /data-ssr/, path);
    }
  });

  test("a visitor with a session, an invitation or a post-login destination gets the plain shell (their screen is not the empty one)", async () => {
    assert.doesNotMatch((await page("/", { cookie: "hok_session=abc" })).html, /data-ssr/);
    assert.doesNotMatch((await page("/", { cookie: "__Host-hok_session=abc" })).html, /data-ssr/);
    assert.doesNotMatch((await page("/?invite=abc")).html, /data-ssr/);
    assert.doesNotMatch((await page("/login?next=%2Fscrims")).html, /data-ssr/);
    assert.doesNotMatch(
      (await page("/", { cookie: "hok_lang=fr" })).html,
      /data-ssr="1">(?!<div)/,
      "a language cookie alone is still anonymous"
    );
  });

  test("a person who is signed in receives the frame of the page (title, introduction, skeleton), by their kind", async () => {
    const person = await app.signIn("Pat");
    const staff = await app.signIn("Keeper", { admin: true });
    const cookie = who => `hok_session=${who.browser.jar.get("hok_session")}`;
    calls.length = 0;
    const framed = await page("/settings", { cookie: cookie(person) });
    assert.match(
      framed.html,
      /<main id="view" class="host app-view" tabindex="-1" data-ssr="frame"><div class="page-head"><h1>Drawn \/settings en<\/h1>/
    );
    assert.deepEqual(calls, [["/settings", "en", "user"]], "the frame of an ordinary person");
    assert.match(framed.html, /<html lang="en" dir="ltr" data-theme="dark" class="ssr-first">/);
    assert.equal(framed.response.headers.get("cache-control"), "private, no-store");
    const boot = JSON.parse(/id="boot">([\s\S]*?)<\/script>/.exec(framed.html)[1]);
    assert.equal(boot.b.me.user.name, "Pat", "their session travels with it");
    assert.match(
      boot.w,
      /styles/,
      "the whole stylesheet is prefetched (the frame needs more than its first screen)"
    );
    assert.doesNotMatch(
      framed.html,
      /id="account-control" class="account-control"><a/,
      "no chip is drawn for the made-up person"
    );
    calls.length = 0;
    await page("/settings", { cookie: cookie(staff) });
    assert.deepEqual(calls, [["/settings", "en", "staff"]], "the frame of an administrator");
  });

  test("a signed-in person gets no frame for a view that has none, a series, an invitation or a post-login destination", async () => {
    const person = await app.signIn("Quinn");
    const cookie = { cookie: `hok_session=${person.browser.jar.get("hok_session")}` };
    calls.length = 0;
    for (const path of [
      "/heroes",
      "/scrims/16e11da1-7c03-422a-b39e-69742cd5f4c6",
      "/settings?invite=abc",
      "/settings?next=%2Fscrims",
      "/nope"
    ]) {
      assert.doesNotMatch((await page(path, cookie)).html, /data-ssr/, path);
    }
    assert.deepEqual(calls, []);
  });

  test("the four pages of the training area have a frame, an exercise, a routine or a situation does not", async () => {
    const person = await app.signIn("Riley");
    const cookie = { cookie: `hok_session=${person.browser.jar.get("hok_session")}` };
    calls.length = 0;
    for (const path of TRAINING_PATHS) {
      assert.match((await page(path, cookie)).html, /data-ssr="frame"/, path);
    }
    assert.deepEqual(
      calls.map(([path]) => path),
      TRAINING_PATHS,
      "each page is drawn from its own address"
    );
    calls.length = 0;
    for (const path of [
      "/training/reflex/aim",
      "/training/reflex/routine",
      "/training/scenarios/abc"
    ]) {
      assert.doesNotMatch((await page(path, cookie)).html, /data-ssr="frame"/, path);
    }
    assert.deepEqual(calls, []);
  });

  test("a visitor who opens a space shared by a link gets the frame of that page (the link is in the address, after the #)", async () => {
    calls.length = 0;
    const { html, response } = await page("/space/shared");
    assert.match(html, /data-ssr="frame"/);
    assert.deepEqual(calls, [["/space/shared", "en", "visitor"]]);
    assert.notEqual(response.headers.get("cache-control"), "public, max-age=300");
    calls.length = 0;
    assert.doesNotMatch(
      (await page("/space/shared", { cookie: "hok_session=abc" })).html,
      /data-ssr/,
      "a visitor who has a session is not that visitor"
    );
    assert.deepEqual(calls, []);
  });

  test("a visitor still gets the page drawn for visitors, not a frame", async () => {
    calls.length = 0;
    const { html } = await page("/settings");
    assert.match(html, /data-ssr="1"/);
    assert.deepEqual(calls, [["/settings", "en", ""]]);
  });

  test("the renderer's own requests never nest a render", async () => {
    assert.doesNotMatch((await page("/", { "x-hok-prerender": "secret-token" })).html, /data-ssr/);
    assert.match(
      (await page("/", { "x-hok-prerender": "wrong" })).html,
      /data-ssr/,
      "a guessed header changes nothing"
    );
  });

  test("the drawn page carries the CSS of its first screen inline (no flash), allowed by its own hash, and no web-font file in the first paint", async () => {
    const { response, html } = await page("/heroes");
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);
    assert.equal(styles.length, 1);
    assert.match(styles[0], /\.hcard/, "the sheet of the page, not only the critical part");
    assert.doesNotMatch(styles[0], /\.ak-key/, "and not the sheets of the other pages");
    assert.equal(
      styles[0].match(/src: url\("\/fonts\/barlow-latin-400\.woff2"\)/g)?.length,
      1,
      "the face of the text font, once"
    );
    const hash = `sha256-${createHash("sha256").update(styles[0]).digest("base64")}`;
    const policy = response.headers.get("content-security-policy");
    assert.ok(policy.includes(`'${hash}'`));
    assert.equal(
      policy.match(/'sha256-/g).length,
      2,
      "this style and the boot script, nothing else"
    );
    const boot = JSON.parse(
      html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]
    );
    assert.equal(boot.s, "", "nothing waits for the stylesheet: the page has what it needs");
    assert.match(
      boot.w,
      /styles/,
      "the whole stylesheet is prefetched, applied when another page is drawn"
    );
    assert.equal(
      boot.n,
      undefined,
      "no late stylesheet for the fonts: their faces are in the critical CSS"
    );
    assert.match(styles[0], /@font-face/, "the faces of the fonts the page preloads");
    assert.doesNotMatch(html, /<noscript><link rel="stylesheet"/);
  });

  test("every view the server draws has its first-paint sheets, and they are real partials of the stylesheet", async () => {
    const styles = path.join(WEB.client, "styles");
    const plan = firstPaintPlan(styles);
    const parts = stylesheetParts(styles);
    assert.deepEqual(
      Object.keys(plan.views).sort(),
      [...new Set([...SSR_VIEWS, ...FRAME_VIEWS, ...VISITOR_FRAME_VIEWS, ROOM_FRAME_VIEW])].sort(),
      "one entry per view the server draws (a visitor's page, a signed-in person's frame, the room of a draft)"
    );
    for (const part of [...plan.always, ...Object.values(plan.views).flat()]) {
      assert.ok(parts.includes(part), `${part} is a partial that main.css imports`);
    }
    assert.ok(!plan.always.some(part => part.startsWith("pages/")), "the page sheets are per view");
    assert.ok(
      ![...plan.always, ...Object.values(plan.views).flat()].includes("base/fonts.css"),
      "the web fonts come in a stylesheet of their own"
    );
    for (const view of new Set([
      ...SSR_VIEWS,
      ...FRAME_VIEWS,
      ...VISITOR_FRAME_VIEWS,
      ROOM_FRAME_VIEW
    ])) {
      const wanted = firstPaintParts(view, styles);
      assert.deepEqual(
        wanted,
        parts.filter(part => wanted.includes(part)),
        `${view}: the cascade of main.css is kept`
      );
    }
  });

  test("the plain shell still defers its stylesheet and allows the critical CSS by its own hash", async () => {
    const { response, html } = await page("/", { cookie: "hok_session=abc" });
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);
    assert.doesNotMatch(styles[0], /\.hero-card/);
    assert.ok(
      response.headers
        .get("content-security-policy")
        .includes(`'sha256-${createHash("sha256").update(styles[0]).digest("base64")}'`)
    );
    assert.ok(JSON.parse(html.match(/id="boot">([\s\S]*?)<\/script>/)[1]).s.length > 0);
  });
});

describe("prerenderer", () => {
  const fakeLaunch = (pageFor, counters) => async () => ({
    newContext: async () => ({
      addCookies: async () => {},
      close: async () => {},
      newPage: async () => ({
        route: async () => {},
        goto: async () => ({ status: () => 200 }),
        waitForFunction: async () => {},
        evaluate: async () => {
          counters.renders += 1;
          return pageFor();
        }
      })
    }),
    close: async () => {
      counters.closed += 1;
    }
  });

  test("a page is captured once, cached, and a failure falls back to nothing (the plain shell)", async () => {
    const counters = { renders: 0, closed: 0 };
    const prerenderer = createPrerenderer({
      launch: fakeLaunch(() => ({ view: "<h1>x</h1>", account: "" }), counters),
      baseUrl: "http://127.0.0.1:1"
    });
    const [a, b] = await Promise.all([prerenderer.get("/", "en"), prerenderer.get("/", "en")]);
    assert.deepEqual(a, b);
    await prerenderer.get("/", "en");
    assert.equal(counters.renders, 1, "one render for simultaneous and later requests");
    await prerenderer.get("/", "fr");
    assert.equal(counters.renders, 2, "another language is another page");
    await prerenderer.close();
    assert.equal(counters.closed, 1);
  });

  test("a page that did not render (error block, empty) is not served", async () => {
    const counters = { renders: 0, closed: 0 };
    const prerenderer = createPrerenderer({
      launch: fakeLaunch(
        () => ({ view: '<div class="error-block">x</div>', account: "" }),
        counters
      ),
      baseUrl: "http://127.0.0.1:1"
    });
    assert.equal(await prerenderer.get("/", "en"), null);
    assert.equal(await prerenderer.get("/", "en"), null);
    assert.equal(counters.renders, 1, "and not retried at once");
    await prerenderer.close();
  });

  test("when the browser cannot start, the answer is null, never an exception", async () => {
    const prerenderer = createPrerenderer({
      launch: async () => {
        throw new Error("no chromium");
      },
      baseUrl: "http://127.0.0.1:1"
    });
    assert.equal(await prerenderer.get("/", "en"), null);
    await prerenderer.close();
  });

  test("what a render waits for: a frame its heading only, a visitor's page its data and the ready flag", async () => {
    const predicates = [];
    const prerenderer = createPrerenderer({
      launch: async () => ({
        newContext: async () => ({
          addCookies: async () => {},
          close: async () => {},
          route: async () => {},
          newPage: async () => ({
            route: async () => {},
            goto: async () => ({ status: () => 200 }),
            waitForFunction: async predicate => predicates.push(predicate),
            waitForTimeout: async () => {},
            evaluate: async () => ({ view: "<h1>x</h1>", account: "" })
          })
        }),
        close: async () => {}
      }),
      baseUrl: "http://127.0.0.1:1"
    });
    await prerenderer.get("/training", "en", { variant: "user" });
    await prerenderer.get("/heroes", "en");
    await prerenderer.close();
    const [frame, visitor] = predicates;
    // a page of the client as the renderer's browser sees it: the flag is only set once the page is drawn and its data is
    // there, and a frame holds every request for data back, so it never comes
    const seen = ({ ready = false, heading = "", loading = false }) => {
      const nodes = {
        "#view h1": heading ? { textContent: heading } : null,
        "#view .loading-line": loading ? {} : null,
        "#view": { textContent: heading }
      };
      globalThis.document = {
        documentElement: { dataset: ready ? { ready: "1" } : {} },
        querySelector: selector => nodes[selector] ?? null
      };
    };
    try {
      seen({ heading: "Training" });
      assert.equal(frame(), true, "the frame is taken once the heading is drawn, with no flag");
      seen({});
      assert.equal(frame(), false, "and not before");
      seen({ heading: "Heroes" });
      assert.equal(visitor(), false, "a visitor's page waits for the flag");
      seen({ ready: true, heading: "Heroes", loading: true });
      assert.equal(visitor(), false, "and for its data");
      seen({ ready: true, heading: "Heroes" });
      assert.equal(visitor(), true);
    } finally {
      delete globalThis.document;
    }
  });

  test("a page a visitor asks for is drawn before the start-up warm-up, even one the warm-up already holds", async () => {
    const counters = { renders: 0, closed: 0 };
    const prerenderer = createPrerenderer({
      launch: fakeLaunch(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ view: "<h1>x</h1>", account: "" }), 60)
          ),
        counters
      ),
      baseUrl: "http://127.0.0.1:1"
    });
    // the warm-up of a new start: 12 pages one after the other, 60 ms each, 720 ms in all
    const paths = Array.from({ length: 12 }, (_, i) => `/page-${i}`);
    prerenderer.warm(paths, ["en", "fr"]);
    // a page outside the warm-up waits for the render under way, then its own: not for the whole queue
    assert.ok(await prerenderer.get("/items", "en", { waitMs: 400 }), "drawn ahead of the warm-up");
    // a page far down the warm-up's queue is moved to the front when a visitor asks for it
    assert.ok(
      await prerenderer.get("/page-11", "fr", { waitMs: 400 }),
      "taken out of its place in the queue"
    );
    assert.ok(counters.renders < 8, `${counters.renders} renders before them`);
    await prerenderer.close();
  });

  test("a slow render is not waited for beyond the limit: the visitor gets the plain page", async () => {
    const counters = { renders: 0, closed: 0 };
    const prerenderer = createPrerenderer({
      launch: fakeLaunch(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ view: "<h1>x</h1>", account: "" }), 300)
          ),
        counters
      ),
      baseUrl: "http://127.0.0.1:1"
    });
    assert.equal(await prerenderer.get("/", "en", { waitMs: 20 }), null);
    assert.ok(await prerenderer.get("/", "en", { waitMs: 2000 }), "the same render, finished");
    await prerenderer.close();
  });
});
