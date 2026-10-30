// HTTP hardening: headers, errors, CSRF checks, cookies, rate limits, admin-only roster sync.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createApp } from "../../app.js";
import { createLimiters } from "./rate-limits.js";
import { createLogger } from "../logger.js";
import { createRosterSync } from "../../features/heroes/sync/roster-sync.js";
import { CREATE_BODY, startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
// TRUST_PROXY: the tests play the proxy and say with x-forwarded-proto that a request came in over https
const production = await startTestServer({
  env: { NODE_ENV: "production", TRUST_PROXY: "1" },
  seedHeroes: false
});
const HTTPS = { "x-forwarded-proto": "https" };
after(async () => {
  await app?.close();
  await production?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("response headers", { skip }, () => {
  test("every response carries the security headers and hides Express", async () => {
    const response = await fetch(`${app.baseUrl}/api/health`);
    const csp = response.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')?(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(csp, /img-src [^;]*https:\/\/camp\.honorofkings\.com/);
    assert.match(csp, /img-src [^;]*googleusercontent\.com/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(response.headers.get("permissions-policy"), /camera=\(\)/);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(response.headers.get("x-request-id"));
    const page = await fetch(`${app.baseUrl}/`);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("content-security-policy"), /default-src/);
  });

  test("HSTS only when cookies are Secure (production)", async () => {
    assert.equal(
      (await fetch(`${app.baseUrl}/api/health`)).headers.get("strict-transport-security"),
      null
    );
    assert.match(
      (await fetch(`${production.baseUrl}/api/health`)).headers.get("strict-transport-security"),
      /max-age=/
    );
  });

  test("in production a request that came in over plain http is sent to https for good, but not the health check", async () => {
    const plain = await fetch(`${production.baseUrl}/heroes?x=1`, { redirect: "manual" });
    assert.equal(plain.status, 308);
    assert.match(plain.headers.get("location"), /^https:\/\/[^/]+\/heroes\?x=1$/);
    assert.equal((await fetch(`${production.baseUrl}/api/health`)).status, 200);
    const secure = await fetch(`${production.baseUrl}/heroes`, {
      headers: HTTPS,
      redirect: "manual"
    });
    assert.equal(secure.status, 200);
    const dev = await fetch(`${app.baseUrl}/heroes`, { redirect: "manual" });
    assert.equal(dev.status, 200, "no redirect where cookies are not Secure (local use)");
  });

  test("the HTML page has no inline script but (for a page the server drew) the boot loader, allowed by its hash alone, no inline style but the critical CSS, no third-party origin", async () => {
    const html = await (await fetch(`${app.baseUrl}/`)).text();
    const executable = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)
    ].filter(match => !/type="application\/(ld\+)?json"/.test(match[1])); // data blocks: never run
    // the only inline script is the constant boot loader (allowed by its hash below); the data blocks are never run
    assert.equal(executable.length, 1, "one executable inline script: the boot loader");
    assert.doesNotMatch(
      html,
      /<link rel="modulepreload"/,
      "nothing is preloaded before the first paint: the boot loader starts the rest after it"
    );
    const { BOOT_SCRIPT_HASH } = await import("./first-paint.js");
    const policy = (await fetch(`${app.baseUrl}/`)).headers.get("content-security-policy");
    assert.ok(
      policy.includes(`script-src 'self' '${BOOT_SCRIPT_HASH}';`),
      "the boot loader of the drawn pages is allowed by its hash and nothing broader"
    );
    const boot = JSON.parse(
      html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]
    );
    assert.ok(
      boot.e.startsWith("/") && boot.f.includes("/api/auth/me"),
      "the data block is plain JSON"
    );
    const inline = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);
    assert.equal(inline.length, 1, "exactly one inline style block: the critical CSS");
    const { createHash } = await import("node:crypto");
    const hash = `sha256-${createHash("sha256").update(inline[0]).digest("base64")}`;
    const csp = (await fetch(`${app.baseUrl}/`)).headers.get("content-security-policy");
    assert.ok(csp.includes(`'${hash}'`), "its hash is allowed by the CSP");
    assert.match(
      csp,
      /style-src 'self' 'sha256-[A-Za-z0-9+/=]+'( 'sha256-[A-Za-z0-9+/=]+')?;/,
      "and nothing broader than the two hashes of our own inline CSS (critical, or critical + the rest for drawn pages)"
    );
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.doesNotMatch(html, /\sstyle=/i);
    assert.doesNotMatch(html, /\son\w+=/i);
    // the schema.org names of a JSON-LD block are identifiers, not addresses the browser will fetch
    const requested = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
    const foreign = (requested.match(/https?:\/\/[^\s"'<>]+/g) || []).filter(
      url => !url.startsWith(app.baseUrl)
    );
    assert.deepEqual(foreign, [], "no third-party origin in the page");
  });
});

describe("errors", { skip }, () => {
  test("liveness answers without touching the database, readiness checks it", async () => {
    assert.deepEqual((await app.browser().get("/api/health/live")).body, { status: "ok" });
    assert.deepEqual((await app.browser().get("/api/health")).body, {
      status: "ok",
      storage: "mysql"
    });
  });

  test("malformed URL encoding is a 400, not a server error", async () => {
    const response = await app.browser().get("/api/series/%E0%A4%A");
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_url");
    assert.equal((await fetch(`${app.baseUrl}/%E0%A4%A`)).status < 500, true);
  });

  test("unknown API routes return JSON 404, not the SPA page", async () => {
    const response = await app.browser().get("/api/nope");
    assert.equal(response.status, 404);
    assert.equal(response.body.code, "not_found");
    assert.match(response.headers.get("content-type"), /json/);
  });

  test("invalid JSON and oversized bodies get typed JSON errors without a stack trace", async () => {
    const bad = await fetch(`${app.baseUrl}/api/series`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    const badBody = await bad.json();
    assert.equal(bad.status, 400);
    assert.equal(badBody.code, "invalid_json");
    assert.doesNotMatch(JSON.stringify(badBody), /node_modules|\.js:\d+|Users/);
    const big = await fetch(`${app.baseUrl}/api/series`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(1_200_000) })
    });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).code, "payload_too_large");
  });

  test("unexpected failures are generic for the client and detailed only in the log", async () => {
    const lines = [];
    const broken = createApp({
      store: {
        ...app.store,
        ping: async () => {
          throw new Error("secret detail: /etc/passwd password=hunter2");
        }
      },
      config: app.config,
      rosterSync: { run: async () => ({}) },
      logger: createLogger({ level: "debug", sink: line => lines.push(line) }),
      limiters: createLimiters({ enabled: false })
    }).listen(0);
    await new Promise(resolve => broken.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${broken.address().port}/api/health`);
    const body = await response.json();
    broken.close();
    assert.equal(response.status, 500);
    assert.equal(body.error, "Internal server error.");
    assert.ok(body.requestId);
    assert.doesNotMatch(JSON.stringify(body), /secret|passwd|hunter2/);
    assert.ok(
      lines.some(line => line.includes("secret detail")),
      "the detail is logged"
    );
  });

  test("logs never contain cookies or tokens", () => {
    const lines = [];
    createLogger({ sink: line => lines.push(line) }).info("x", {
      cookie: "hok_session=abc",
      headers: { authorization: "Bearer zzz" },
      session_token: "t",
      nested: { password: "p" },
      ok: 1
    });
    assert.doesNotMatch(lines[0], /abc|zzz|"t"|"p"/);
    assert.match(lines[0], /"ok":1/);
  });
});

describe("CSRF and cookies", { skip }, () => {
  test("cross-site state-changing requests are refused; same-origin and header-less ones pass", async () => {
    const post = (headers = {}) =>
      fetch(`${app.baseUrl}/api/series`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(CREATE_BODY)
      });
    assert.equal((await post({ origin: "https://evil.example" })).status, 403);
    assert.equal((await post({ origin: "null" })).status, 403);
    assert.equal((await post({ "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await post({ "sec-fetch-site": "same-site" })).status, 403);
    assert.equal(
      (await post({ origin: app.baseUrl, "sec-fetch-site": "same-origin" })).status,
      200
    );
    assert.equal((await post()).status, 200);
    assert.equal(
      (await fetch(`${app.baseUrl}/api/series`, { headers: { origin: "https://evil.example" } }))
        .status,
      200,
      "reads are not state-changing"
    );
  });

  test("the guest cookie is HttpOnly, SameSite=Lax and Secure with a __Host- name in production", async () => {
    const dev = await fetch(`${app.baseUrl}/api/series`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CREATE_BODY)
    });
    const devCookie = dev.headers.getSetCookie().find(value => value.startsWith("hok_session="));
    assert.match(devCookie, /HttpOnly/);
    assert.match(devCookie, /SameSite=Lax/);
    assert.doesNotMatch(devCookie, /Secure/);
    const prod = await fetch(`${production.baseUrl}/api/series`, {
      method: "POST",
      headers: { "content-type": "application/json", ...HTTPS },
      body: JSON.stringify(CREATE_BODY)
    });
    const prodCookie = prod.headers
      .getSetCookie()
      .find(value => value.startsWith("__Host-hok_session="));
    assert.ok(prodCookie, "prefixed name in production");
    assert.match(prodCookie, /; Secure/);
    assert.match(prodCookie, /Path=\//);
    assert.doesNotMatch(prodCookie, /Domain=/);
  });

  test("sessions slide, stay under the absolute limit and are purged once expired", async () => {
    const { browser, user } = await app.signIn("Slider");
    const [[row]] = await app.store.pool.query(
      "SELECT token_hash, created_at FROM sessions WHERE user_id = ?",
      [user.id]
    );
    await app.store.pool.query(
      "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?",
      [Date.now() - 2 * 3600_000, Date.now() + 1000, row.token_hash]
    );
    const response = await browser.get("/api/auth/me");
    assert.equal(response.status, 200);
    const [[after]] = await app.store.pool.query(
      "SELECT expires_at FROM sessions WHERE token_hash = ?",
      [row.token_hash]
    );
    assert.ok(
      Number(after.expires_at) > Date.now() + 13 * 86_400_000,
      "expiry slid forward ~14 days"
    );
    assert.ok(
      Number(after.expires_at) <= Number(row.created_at) + 30 * 86_400_000,
      "never past the 30-day absolute limit"
    );
    await app.store.pool.query("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", [
      Date.now() - 1,
      row.token_hash
    ]);
    assert.equal(
      (await browser.get("/api/auth/me")).body.user,
      null,
      "an expired session is not accepted"
    );
    assert.ok((await app.store.purgeExpired()).sessions >= 1);
  });
});

describe("rate limiting", { skip }, () => {
  test("limits answer 429 JSON with Retry-After", async () => {
    const limited = await startTestServer({
      seedHeroes: false,
      limiters: createLimiters({
        enabled: true,
        overrides: { createSeries: { limit: 3 }, import: { limit: 1 }, auth: { limit: 2 } }
      })
    });
    try {
      const me = limited.browser();
      for (let index = 0; index < 3; index += 1) {
        assert.equal(
          (await me.post("/api/series", { ...CREATE_BODY, teamA: `T${index}` })).status,
          200
        );
      }
      const blocked = await me.post("/api/series", CREATE_BODY);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.code, "rate_limited");
      assert.ok(blocked.headers.get("retry-after"));
      assert.equal(
        (await me.post("/api/series/import", {})).status,
        400,
        "first import call passes the limiter (then fails validation)"
      );
      assert.equal((await me.post("/api/series/import", {})).status, 429);
      await fetch(`${limited.baseUrl}/auth/google`);
      await fetch(`${limited.baseUrl}/auth/google`);
      assert.equal(
        (await fetch(`${limited.baseUrl}/auth/google`)).status,
        429,
        "auth endpoints are limited"
      );
    } finally {
      await limited.close();
    }
  });
});

describe("roster sync is admin-only, single-flight and rate-limited", { skip }, () => {
  test("only an administrator can trigger a sync", async () => {
    assert.equal((await app.browser().post("/api/roster/sync")).status, 401);
    const user = await app.signIn("Normal");
    assert.equal((await user.browser.post("/api/roster/sync")).status, 403);
    const guest = app.browser();
    await guest.post("/api/series", CREATE_BODY);
    assert.equal((await guest.post("/api/roster/sync")).status, 401);
    const admin = await app.signIn("Admin", { admin: true });
    const failed = await admin.browser.post("/api/roster/sync");
    assert.equal(failed.status, 503, "the fake sync is offline: the cache is retained");
    assert.equal(failed.body.usingCache, true);
    assert.equal(failed.body.heroes.length, 30);
    assert.doesNotMatch(failed.body.error, /offline/, "internal detail is not echoed");
  });

  test("callers share one run, manual runs have a cooldown, and a shrunken roster is refused", async () => {
    let calls = 0;
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const fetchRoster = async () => {
      calls += 1;
      await gate;
      return {
        heroes: Array.from({ length: 30 }, (_, index) => ({
          id: `h${index + 1}`,
          name: `H${index + 1}`,
          image: "https://camp.honorofkings.com/x.png",
          roles: ["Mage"],
          lanes: ["Mid Lane"],
          sourceIds: [`h${index + 1}`]
        })),
        sourceUpdated: "20261001"
      };
    };
    const sync = createRosterSync({ store: app.store, fetchRoster, cooldownMs: 60_000 });
    const first = sync.run({ manual: true });
    const second = sync.run({ manual: true });
    assert.equal(sync.isRunning(), true);
    release();
    assert.equal(await first, await second);
    assert.equal(calls, 1);
    assert.throws(
      () => sync.run({ manual: true }),
      error => error.status === 429 && error.extra.retryAfterSeconds > 0
    );

    const shrinking = createRosterSync({
      store: app.store,
      cooldownMs: 0,
      fetchRoster: async () => ({
        heroes: [
          {
            id: "h1",
            name: "H1",
            image: "https://camp.honorofkings.com/x.png",
            roles: ["Mage"],
            lanes: ["Mid Lane"],
            sourceIds: ["h1"]
          }
        ],
        sourceUpdated: "20261002"
      })
    });
    await assert.rejects(shrinking.run(), /keeping the last valid roster/);
    assert.equal((await app.store.readHeroes()).filter(hero => hero.availableGlobal).length, 30);
  });
});
