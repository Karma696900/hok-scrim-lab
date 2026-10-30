// What a browser or a CDN may keep of what the server sends:
//  - the API is `no-store` unless a route says otherwise, and the few that do (the catalogue, the heroes,
//    the popularity pages) say it only for good answers;
//  - pictures, scripts and styles are the same for everybody: no `Vary` on the cookie or the language, or
//    a browser forgets them each time the visitor logs in and a CDN keeps one copy per visitor;
//  - an error is never kept, even on a route that announced "immutable" before it failed;
//  - the popularity pages are computed once per 30 s whatever the number of visitors, and any tournament
//    edit makes the next visitor see it.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const varies = response =>
  String(response.headers.get("vary") ?? "")
    .split(",")
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
// A browser that revalidates sends If-None-Match alone. Node's fetch() adds `Cache-Control: no-cache` to
// a request that carries it (the Fetch standard does that), which Express reads as a forced reload and
// answers with a full 200: so conditional requests are made with the plain http client.
const conditional = (path, etag) =>
  new Promise((resolve, reject) => {
    http
      .get(`${app.baseUrl}${path}`, { headers: { "if-none-match": etag } }, response => {
        let length = 0;
        response.on("data", chunk => (length += chunk.length));
        response.on("end", () =>
          resolve({ status: response.statusCode, length, etag: response.headers.etag })
        );
      })
      .on("error", reject);
  });
const cookieOf = browser => [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");
const picture = () =>
  sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 30, g: 120, b: 220, alpha: 1 } }
  })
    .png()
    .toBuffer();

describe("headers of the API", { skip }, () => {
  test("a private list stays no-store", async () => {
    const user = await app.signIn("Private");
    const response = await fetch(`${app.baseUrl}/api/series`, {
      headers: { cookie: cookieOf(user.browser) }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  test("the catalogue is stored but checked each time, and a 304 costs no body", async () => {
    const first = await fetch(`${app.baseUrl}/api/catalog`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, no-cache");
    assert.ok(
      !varies(first).includes("cookie") && !varies(first).includes("accept-language"),
      String(first.headers.get("vary"))
    );
    const etag = first.headers.get("etag");
    assert.ok(etag, "an ETag to ask with");
    const again = await conditional("/api/catalog", etag);
    assert.equal(again.status, 304);
    assert.equal(again.length, 0);
    // a staff edit changes the answer, so the old ETag no longer matches
    const admin = await app.signIn("Catalogue", { admin: true });
    const tag = await admin.browser.post("/api/admin/catalog/tags", {
      name: "Cached?",
      color: "red"
    });
    assert.equal(tag.status, 200, tag.text);
    const changed = await conditional("/api/catalog", etag);
    assert.equal(changed.status, 200, "the edit is seen at once, not after a delay");
    assert.notEqual(changed.etag, etag);
  });

  test("the hero list is stored by the browser only, because it depends on the language", async () => {
    const response = await fetch(`${app.baseUrl}/api/heroes`);
    assert.equal(response.headers.get("cache-control"), "private, no-cache");
    assert.ok(varies(response).includes("accept-language"), "it must still vary on the language");
    const etag = response.headers.get("etag");
    const again = await conditional("/api/heroes", etag);
    assert.equal(again.status, 304);
  });

  test("the backgrounds depend on the language too: stored by the browser only", async () => {
    const response = await fetch(`${app.baseUrl}/api/backgrounds`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-cache");
    assert.ok(varies(response).includes("accept-language"));
  });

  test("the catalogue is the same for a visitor and for an administrator", async () => {
    const admin = await app.signIn("Same catalogue", { admin: true });
    const visitor = await fetch(`${app.baseUrl}/api/catalog`);
    const staff = await fetch(`${app.baseUrl}/api/catalog`, {
      headers: { cookie: cookieOf(admin.browser) }
    });
    assert.equal(
      await staff.text(),
      await visitor.text(),
      "the same body: nothing depends on who asks"
    );
    assert.equal(staff.headers.get("etag"), visitor.headers.get("etag"));
    assert.equal(staff.headers.get("cache-control"), visitor.headers.get("cache-control"));
  });

  test("a public answer never carries a session cookie, a private one still renews it", async () => {
    // the identity middleware renews the cookie of a session that is more than an hour old on ANY
    // request: on a public answer a shared cache could keep that cookie and give it to the next visitor
    const { user, browser } = await app.signIn("Old session");
    const cookie = cookieOf(browser);
    const renewed = async path => {
      await app.store.pool.query("UPDATE sessions SET last_seen_at = 0 WHERE user_id = ?", [
        user.id
      ]);
      const response = await fetch(`${app.baseUrl}${path}`, { headers: { cookie } });
      assert.equal(response.status, 200, path);
      return response.headers.getSetCookie().some(line => /hok_session/.test(line));
    };
    assert.equal(await renewed("/api/series"), true, "a private route renews an old session");
    assert.equal(await renewed("/api/catalog"), false, "the catalogue is public");
    assert.equal(await renewed("/api/popular/drafts"), false, "so are the popularity pages");
    assert.equal(await renewed("/api/popular/heroes"), false);
  });
});

describe("static files and pictures", { skip }, () => {
  test("a script is the same for everybody, the page is not", async () => {
    const script = await fetch(`${app.baseUrl}/shared/build-model.js`);
    assert.equal(script.status, 200);
    assert.ok(
      !varies(script).includes("cookie") && !varies(script).includes("accept-language"),
      String(script.headers.get("vary"))
    );
    const page = await fetch(`${app.baseUrl}/`);
    assert.ok(
      varies(page).includes("cookie") && varies(page).includes("accept-language"),
      String(page.headers.get("vary"))
    );
  });

  test("a catalogue picture has no Vary and is cached for a year", async () => {
    const admin = await app.signIn("Pictures", { admin: true });
    const sent = await fetch(`${app.baseUrl}/api/admin/catalog/images`, {
      method: "POST",
      headers: { "content-type": "image/png", cookie: cookieOf(admin.browser) },
      body: await picture()
    });
    const { id } = await sent.json();
    const served = await fetch(`${app.baseUrl}/catalog-images/${id}?w=64`);
    assert.equal(served.status, 200);
    assert.match(served.headers.get("cache-control"), /max-age=31536000, immutable/);
    assert.ok(!varies(served).includes("cookie"), String(served.headers.get("vary")));
    await served.arrayBuffer();
  });

  test("a picture that cannot be built answers an error that nobody keeps", async () => {
    const admin = await app.signIn("Broken", { admin: true });
    const sent = await fetch(`${app.baseUrl}/api/admin/catalog/images`, {
      method: "POST",
      headers: { "content-type": "image/png", cookie: cookieOf(admin.browser) },
      body: await picture()
    });
    const { id } = await sent.json();
    await app.store.pool.query("UPDATE catalog_images SET data = ? WHERE id = ?", [
      Buffer.from("this is not a picture"),
      id
    ]);
    const broken = await fetch(`${app.baseUrl}/catalog-images/${id}?w=128`);
    assert.ok(broken.status >= 500, `status ${broken.status}`);
    assert.equal(broken.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(
      broken.headers.get("etag") ?? "",
      /ci-/,
      "not the picture's own ETag (the error body gets a weak one of its own)"
    );
  });
});

describe("the popularity pages", { skip }, () => {
  test("public for a minute, and an invalid period is not kept", async () => {
    const good = await fetch(`${app.baseUrl}/api/popular/drafts`);
    assert.equal(good.status, 200);
    assert.equal(
      good.headers.get("cache-control"),
      "public, max-age=60, stale-while-revalidate=300"
    );
    assert.ok(!varies(good).includes("cookie"), String(good.headers.get("vary")));
    const bad = await fetch(`${app.baseUrl}/api/popular/drafts?from=2026-01-01&to=2026-01-05`);
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get("cache-control"), "no-store");
  });

  test("computed once for any number of visitors, and again after a tournament edit", async () => {
    const ask = path => app.browser().get(path);
    await app.store.deleteTournament(randomUUID()); // any tournament write: start from an empty memory
    // count the aggregations that really run (the games themselves are cached apart: no SQL to count)
    let computed = 0;
    const original = app.store.rememberCompetitive;
    app.store.rememberCompetitive = (key, compute) =>
      original(key, () => {
        computed += 1;
        return compute();
      });
    try {
      await ask("/api/popular/heroes");
      assert.equal(computed, 1, "the first visitor pays");
      await Promise.all([
        ask("/api/popular/heroes"),
        ask("/api/popular/heroes"),
        ask("/api/popular/heroes")
      ]);
      assert.equal(computed, 1, "three more visitors, nothing computed");
      await ask("/api/popular/heroes?minGames=2");
      assert.equal(computed, 2, "another question is another answer");
      await ask("/api/popular/drafts?minGames=3");
      assert.equal(computed, 3, "and drafts are not heroes");
      // any tournament write drops what was computed
      await app.store.deleteTournament(randomUUID());
      await ask("/api/popular/heroes");
      assert.equal(computed, 4, "the next visitor sees the edit");
    } finally {
      app.store.rememberCompetitive = original;
    }
  });
});
