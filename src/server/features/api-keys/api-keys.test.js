// The public API: a signed-in person makes keys, a key reads what its owner may read through /api/v1, a
// team shares series with its members. Pure parts first, then the real application over HTTP.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { API_KEYS_MAX, API_KEY_PATTERN, API_SCOPES } from "../../../shared/access-rules.js";
import {
  generateKey,
  hashKey,
  isUsable,
  keyFromRequest,
  parseKeyRequest,
  scopesOf
} from "./api-key-domain.js";
import { API_ENDPOINTS, endpointOf } from "./endpoints.js";
import { createLimiters } from "../../platform/http/rate-limits.js";
import { startTestServer } from "../../../testing/test-app.js";

const NOW = Date.UTC(2026, 9, 11);
const request = headers => ({ get: name => headers[name.toLowerCase()] });

describe("an API key (pure)", () => {
  test("a key is 256 random bits behind a recognisable prefix; only its hash is kept", () => {
    const first = generateKey();
    const second = generateKey();
    assert.match(first.token, API_KEY_PATTERN);
    assert.notEqual(first.token, second.token);
    assert.equal(first.hint, first.token.slice(0, 10));
    assert.equal(first.hash, hashKey(first.token));
    assert.match(first.hash, /^[0-9a-f]{64}$/);
    assert.ok(!first.hash.includes(first.token.slice(4, 14)), "the hash does not carry the key");
  });

  test("the key comes from the Authorization or X-API-Key header, never from the address", () => {
    const { token } = generateKey();
    assert.equal(keyFromRequest(request({ authorization: `Bearer ${token}` })), token);
    assert.equal(keyFromRequest(request({ authorization: `bearer   ${token}` })), token);
    assert.equal(keyFromRequest(request({ "x-api-key": token })), token);
    for (const bad of [
      {},
      { authorization: token },
      { authorization: `Basic ${token}` },
      { authorization: "Bearer hok_short" },
      { authorization: `Bearer ${token}x` },
      { authorization: `Bearer ${token.replace("hok_", "xyz_")}` },
      { "x-api-key": "not a key" }
    ]) {
      assert.equal(keyFromRequest(request(bad)), null, JSON.stringify(bad));
    }
  });

  test("what a key asks for: a name, the scopes, a lifetime; the default is every scope for 90 days", () => {
    const made = parseKeyRequest({ name: "  My bot  " }, NOW);
    assert.equal(made.name, "My bot");
    assert.deepEqual(made.scopes, API_SCOPES);
    assert.equal(made.expiresAt, NOW + 90 * 86_400_000);
    assert.deepEqual(parseKeyRequest({ name: "a", scopes: ["tier-lists", "game"] }, NOW).scopes, [
      "game",
      "tier-lists"
    ]);
    assert.equal(parseKeyRequest({ name: "a", lifetimeDays: 0 }, NOW).expiresAt, null);
    for (const [label, body, message] of [
      ["no name", {}, /name/],
      ["a blank name", { name: "  " }, /name/],
      ["a name too long", { name: "x".repeat(61) }, /name/],
      ["no scope", { name: "a", scopes: [] }, /at least one/],
      ["an unknown scope", { name: "a", scopes: ["game", "admin"] }, /at least one/],
      ["a scope that is not a list", { name: "a", scopes: "game" }, /at least one/],
      ["a lifetime that is not offered", { name: "a", lifetimeDays: 3650 }, /how long/],
      ["not an object", [], /JSON object/]
    ]) {
      assert.throws(() => parseKeyRequest(body, NOW), message, label);
    }
  });

  test("a key opens the API until it expires or is revoked", () => {
    assert.ok(isUsable({ revokedAt: null, expiresAt: null }, NOW));
    assert.ok(isUsable({ revokedAt: null, expiresAt: NOW + 1 }, NOW));
    assert.ok(!isUsable({ revokedAt: null, expiresAt: NOW }, NOW));
    assert.ok(!isUsable({ revokedAt: NOW - 1, expiresAt: null }, NOW));
    assert.deepEqual(scopesOf("game,teams,nonsense"), ["game", "teams"]);
  });

  test("the list of addresses: only reads of what the application serves, no admin, no account security", () => {
    const paths = API_ENDPOINTS.map(endpoint => endpoint.path);
    assert.equal(new Set(paths).size, paths.length, "no address twice");
    for (const endpoint of API_ENDPOINTS) {
      assert.ok(API_SCOPES.includes(endpoint.scope), endpoint.path);
      assert.ok(!/admin|auth|api-keys|profile|invitations|notifications/.test(endpoint.path));
    }
    assert.equal(endpointOf("/heroes/h01").scope, "game");
    assert.equal(endpointOf("/heroes/h01/scrims").scope, "scrims", "your scrims, not the game");
    assert.equal(endpointOf("/series/abc").scope, "scrims");
    assert.equal(endpointOf("/tournaments/abc").scope, "competitive");
    for (const hidden of [
      "/admin/tournaments",
      "/auth/security",
      "/me/api-keys",
      "/profile",
      "/series/abc/export",
      "/teams/abc/events.ics",
      "/heroes/h01/scrims/x",
      "/heroes/",
      "/series/a/b/c"
    ]) {
      assert.equal(endpointOf(hidden), null, hidden);
    }
  });
});

const app = await startTestServer();
// a second one whose limiters are on (the first has none, like every test server)
const limited = await startTestServer({
  limiters: createLimiters({
    enabled: true,
    overrides: { apiFailures: { limit: 3 }, apiKey: { limit: 5 } }
  })
});
after(async () => {
  await app?.close();
  await limited?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

/** A new key of a signed-in person, with the secret it was made with. */
async function makeKey(person, body = { name: "test" }) {
  const answer = await person.browser.post("/api/me/api-keys", body);
  assert.equal(answer.status, 200, answer.text);
  return { ...answer.body, bearer: { authorization: `Bearer ${answer.body.secret}` } };
}

describe("the keys of a person", { skip }, () => {
  test("only a real account makes keys; the secret is shown once and never stored", async () => {
    assert.equal((await app.browser().get("/api/me/api-keys")).status, 401, "no session");
    assert.equal((await app.browser().post("/api/me/api-keys", { name: "x" })).status, 401);
    const person = await app.signIn("KeyMaker");
    const made = await makeKey(person, { name: "Stats bot", scopes: ["game", "scrims"] });
    assert.match(made.secret, API_KEY_PATTERN);
    assert.equal(made.key.name, "Stats bot");
    assert.deepEqual(made.key.scopes, ["game", "scrims"]);
    assert.equal(made.key.hint, made.secret.slice(0, 10));
    assert.equal(made.key.active, true);
    assert.ok(
      !JSON.stringify(made.key).includes(made.secret),
      "the key says nothing of the secret"
    );

    const listed = await person.browser.get("/api/me/api-keys");
    assert.equal(listed.body.items.length, 1);
    assert.ok(!listed.text.includes(made.secret), "the list never shows the secret");
    assert.ok(!listed.text.includes(hashKey(made.secret)), "nor its hash");
    assert.equal(listed.body.max, API_KEYS_MAX);

    const rows = await app.store.listApiKeys(person.user.id);
    assert.equal(rows[0].hint, made.secret.slice(0, 10));
    const [[stored]] = await app.store.pool.query("SELECT key_hash FROM api_keys WHERE id = ?", [
      made.key.id
    ]);
    assert.equal(stored.key_hash, hashKey(made.secret), "the hash is what is stored");
    assert.ok(
      !JSON.stringify(rows).includes(made.secret.slice(10)),
      "nothing of the secret beyond its hint is kept"
    );
  });

  test("at most ten live keys; a revoked key frees its place", async () => {
    const person = await app.signIn("KeyCollector");
    const keys = [];
    for (let index = 0; index < API_KEYS_MAX; index += 1) {
      keys.push(await makeKey(person, { name: `key ${index}` }));
    }
    const refused = await person.browser.post("/api/me/api-keys", { name: "one too many" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "too_many_keys");
    assert.equal((await person.browser.delete(`/api/me/api-keys/${keys[0].key.id}`)).status, 200);
    assert.equal((await person.browser.post("/api/me/api-keys", { name: "again" })).status, 200);
  });

  test("a key is revoked at once, then removed from the list; another person cannot touch it", async () => {
    const owner = await app.signIn("KeyOwner");
    const stranger = await app.signIn("KeyStranger");
    const made = await makeKey(owner);
    const read = () => app.browser().get("/api/v1/me", made.bearer);
    assert.equal((await read()).status, 200);
    assert.equal(
      (await stranger.browser.delete(`/api/me/api-keys/${made.key.id}`)).status,
      404,
      "not theirs"
    );
    assert.equal((await read()).status, 200, "still works");
    assert.deepEqual((await owner.browser.delete(`/api/me/api-keys/${made.key.id}`)).body, {
      revoked: true
    });
    assert.equal((await read()).status, 401, "revoked: refused at once");
    const listed = await owner.browser.get("/api/me/api-keys");
    assert.equal(listed.body.items[0].active, false);
    assert.ok(listed.body.items[0].revokedAt);
    assert.deepEqual((await owner.browser.delete(`/api/me/api-keys/${made.key.id}`)).body, {
      removed: true
    });
    assert.equal((await owner.browser.get("/api/me/api-keys")).body.items.length, 0);
    assert.equal((await owner.browser.delete(`/api/me/api-keys/${made.key.id}`)).status, 404);
  });

  test("a key cannot manage keys: only the browser session can", async () => {
    const person = await app.signIn("KeyLimits");
    const made = await makeKey(person);
    for (const [method, path] of [
      ["get", "/api/v1/me/api-keys"],
      ["post", "/api/v1/me/api-keys"],
      ["delete", `/api/v1/me/api-keys/${made.key.id}`]
    ]) {
      const anonymous = app.browser();
      const answer = await anonymous[method](
        path,
        ...(method === "post" ? [{ name: "x" }] : []),
        made.bearer
      );
      assert.ok([404, 405].includes(answer.status), `${method} ${path} -> ${answer.status}`);
    }
    assert.equal((await person.browser.get("/api/me/api-keys")).body.items.length, 1);
  });
});

describe("reading through /api/v1", { skip }, () => {
  test("no key, a wrong key, a key in the address: the same refusal, with nothing to learn", async () => {
    const person = await app.signIn("KeyReader");
    const made = await makeKey(person);
    const refusals = [
      await app.browser().get("/api/v1/heroes"),
      await app.browser().get("/api/v1/heroes", { authorization: "Bearer hok_" + "A".repeat(43) }),
      await app.browser().get("/api/v1/heroes", { authorization: "Bearer nonsense" }),
      await app.browser().get(`/api/v1/heroes?key=${made.secret}&api_key=${made.secret}`)
    ];
    for (const answer of refusals) {
      assert.equal(answer.status, 401);
      assert.match(answer.headers.get("www-authenticate") ?? "", /^Bearer/);
    }
    assert.equal(
      refusals[1].body.error,
      refusals[0].body.error.replace(/Send.*/, refusals[1].body.error),
      "a wrong key and no key may differ, but a wrong key never says why"
    );
  });

  test("a session cookie does not open the API: it takes a key", async () => {
    const person = await app.signIn("CookieOnly");
    assert.equal((await person.browser.get("/api/v1/heroes")).status, 401);
    assert.equal((await person.browser.get("/api/v1/me")).status, 401);
  });

  test("a key reads the game and who it belongs to; the rest is refused or unknown", async () => {
    const person = await app.signIn("GameReader");
    const made = await makeKey(person);
    const get = path => app.browser().get(path, made.bearer);

    const root = await get("/api/v1");
    assert.equal(root.status, 200);
    assert.equal(root.body.version, 1);
    assert.equal(root.body.account.tag, person.user.tag);
    assert.equal(
      root.body.endpoints.length,
      API_ENDPOINTS.length,
      "a key with every scope sees every address"
    );

    const me = await get("/api/v1/me");
    assert.equal(me.body.account.tag, person.user.tag);
    assert.ok(!JSON.stringify(me.body).includes(person.email), "the email is not given");
    assert.equal(me.body.key.id, made.key.id);

    const heroes = await get("/api/v1/heroes");
    assert.equal(heroes.status, 200);
    assert.ok(heroes.body.heroes.length > 0);
    assert.equal((await get("/api/v1/catalog")).status, 200);
    assert.equal((await get(`/api/v1/heroes/${heroes.body.heroes[0].id}`)).status, 200);

    for (const hidden of [
      "/api/v1/admin/tournaments",
      "/api/v1/builds",
      "/api/v1/official-tiers",
      "/api/v1/auth/security",
      "/api/v1/profile",
      "/api/v1/nothing-here"
    ]) {
      const answer = await get(hidden);
      assert.equal(answer.status, 404, hidden);
      assert.equal(answer.body.code, "not_found");
    }
    assert.equal(
      (await get("/api/v1/series")).headers.get("cache-control"),
      "no-store",
      "an answer is never kept by a cache"
    );
  });

  test("the catalogue is read one family or one piece at a time, the same as in one block", async () => {
    const person = await app.signIn("CatalogReader");
    const made = await makeKey(person);
    const get = path => app.browser().get(path, made.bearer);
    const spellId = await app.store.createSpell({
      name: "Flash",
      imageId: null,
      description: "Blink away.",
      cooldownSeconds: 120,
      unlockLevel: null
    });
    const whole = (await get("/api/v1/catalog")).body;
    for (const family of ["items", "arcana", "spells", "stats", "tags"]) {
      const answer = await get(`/api/v1/catalog/${family}`);
      assert.equal(answer.status, 200, family);
      assert.deepEqual(answer.body, { [family]: whole[family] }, `${family}: what the block says`);
    }
    const one = await get(`/api/v1/catalog/spells/${spellId}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.name, "Flash");
    assert.equal(one.body.cooldownSeconds, 120);
    for (const missing of [
      "/api/v1/catalog/spells/999999",
      "/api/v1/catalog/spells/0",
      "/api/v1/catalog/spells/abc",
      "/api/v1/catalog/spells/1e3",
      "/api/v1/catalog/spells/-1",
      "/api/v1/catalog/heroes",
      "/api/v1/catalog/images/1",
      "/api/v1/catalog/spells/1/2"
    ]) {
      assert.equal((await get(missing)).status, 404, missing);
    }
    assert.equal(
      (await app.browser().get("/api/v1/catalog/spells")).status,
      401,
      "a key is needed"
    );
    assert.equal(
      (await app.browser().get(`/api/catalog/spells/${spellId}`)).status,
      200,
      "the application reads the same pieces without a key"
    );
  });

  test("the API only reads: every other method is refused, and CORS lets pages of other sites read", async () => {
    const person = await app.signIn("ReadOnly");
    const made = await makeKey(person);
    for (const method of ["post", "put", "patch", "delete"]) {
      const anonymous = app.browser();
      const answer = await anonymous[method](
        "/api/v1/tier-lists",
        ...(method === "delete" ? [] : [{}]),
        made.bearer
      );
      assert.equal(answer.status, 405, method);
      assert.match(answer.headers.get("allow") ?? "", /GET/);
    }
    assert.equal(
      (await person.browser.get("/api/tier-lists")).body.total,
      0,
      "nothing was written"
    );

    const preflight = await fetch(`${app.baseUrl}/api/v1/heroes`, {
      method: "OPTIONS",
      headers: {
        origin: "https://tools.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/i);
    assert.doesNotMatch(
      preflight.headers.get("access-control-allow-methods"),
      /POST|PUT|DELETE/,
      "no write is announced"
    );
    const read = await fetch(`${app.baseUrl}/api/v1/heroes`, {
      headers: { ...made.bearer, origin: "https://tools.example" }
    });
    assert.equal(read.headers.get("access-control-allow-origin"), "*");
    assert.ok(!read.headers.get("access-control-allow-credentials"), "never with cookies");
  });

  test("the scopes: a key reads what it was given and is told what it lacks", async () => {
    const person = await app.signIn("ScopedReader");
    const narrow = await makeKey(person, { name: "narrow", scopes: ["game"] });
    const get = path => app.browser().get(path, narrow.bearer);
    assert.equal((await get("/api/v1/heroes")).status, 200);
    for (const [path, scope] of [
      ["/api/v1/series", "scrims"],
      ["/api/v1/tier-lists", "tier-lists"],
      ["/api/v1/tournaments", "competitive"],
      ["/api/v1/me/teams", "teams"],
      ["/api/v1/space", "training"],
      ["/api/v1/me", "account"]
    ]) {
      const answer = await get(path);
      assert.equal(answer.status, 403, path);
      assert.equal(answer.body.code, "insufficient_scope");
      assert.ok(answer.body.error.includes(scope), answer.body.error);
    }
    const root = await get("/api/v1");
    assert.ok(root.body.endpoints.every(endpoint => endpoint.scope === "game"));
  });

  test("an expired key is refused like a revoked one, and a key never carries staff rights", async () => {
    const admin = await app.signIn("StaffReader", { admin: true });
    const made = await makeKey(admin);
    assert.equal((await app.browser().get("/api/v1/admin/hero-details", made.bearer)).status, 404);
    assert.equal(
      (await admin.browser.get("/api/admin/hero-details")).status,
      200,
      "the same person, in the browser, is an administrator"
    );
    await app.store.pool.execute("UPDATE api_keys SET expires_at = ? WHERE id = ?", [
      Date.now() - 1000,
      made.key.id
    ]);
    assert.equal((await app.browser().get("/api/v1/me", made.bearer)).status, 401, "expired");
  });
});

describe("the limits of the API", { skip: limited ? false : "MySQL is not reachable" }, () => {
  test("refused keys are counted per address; a call that works is never counted nor blocked", async () => {
    const person = await limited.signIn("Limited");
    const made = await makeKeyOn(limited, person);
    const wrong = { authorization: `Bearer hok_${"B".repeat(43)}` };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.equal(
        (await limited.browser().get("/api/v1/heroes", wrong)).status,
        401,
        `try ${attempt}`
      );
    }
    const blocked = await limited.browser().get("/api/v1/heroes", wrong);
    assert.equal(blocked.status, 429, "the fourth refusal is turned away");
    assert.equal(blocked.body.code, "rate_limited");
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.ok(blocked.headers.get("ratelimit"), "the standard rate limit header is sent");
    assert.equal(
      (await limited.browser().get("/api/v1/heroes", made.bearer)).status,
      200,
      "a good key from the same address still reads: a neighbour's guesses cannot take its access away"
    );
    assert.equal(
      (await limited.browser().get("/api/v1/heroes")).status,
      429,
      "no key counts as a refusal too"
    );
  });

  test("a key reads at most so many times a minute, counted for the key and not for the address", async () => {
    const person = await limited.signIn("Reader");
    const first = await makeKeyOn(limited, person);
    const second = await makeKeyOn(limited, person);
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await limited.browser().get("/api/v1/me", first.bearer)).status, 200);
    }
    const over = await limited.browser().get("/api/v1/me", first.bearer);
    assert.equal(over.status, 429);
    assert.equal(
      (await limited.browser().get("/api/v1/me", second.bearer)).status,
      200,
      "another key of the same person from the same address has its own allowance"
    );
  });
});

async function makeKeyOn(server, person) {
  const answer = await person.browser.post("/api/me/api-keys", { name: "limited" });
  assert.equal(answer.status, 200, answer.text);
  return { ...answer.body, bearer: { authorization: `Bearer ${answer.body.secret}` } };
}

describe("the address of the API", { skip }, () => {
  test("only /api/v1 and what is under it takes a key: /api/v10 does not, and does not read a cookie either", async () => {
    const person = await app.signIn("Prefix");
    const made = await makeKey(person);
    for (const path of ["/api/v10/heroes", "/api/v1heroes", "/api/v1.json"]) {
      const answer = await app.browser().get(path, made.bearer);
      assert.equal(answer.status, 404, path);
    }
  });
});
