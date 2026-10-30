// Pure unit tests: configuration, startup refusal, validation helpers, redirect safety.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertRuntimeConfig, loadConfig } from "./config.js";
import { safeReturnPath } from "./features/auth/google.js";
import { normalizeTeamNames } from "./features/series/series.js";
import { parseInviteRequest } from "./features/sharing/sharing-domain.js";
import { parsePagination } from "./platform/validation.js";
import { parseSeriesCreate } from "./features/series/series-validation.js";
import { parseTierListInput } from "./features/tier-lists/tier-list-domain.js";

const strong = "q7Vn!2xLr9TzPw4Hs8Kd";
const production = overrides =>
  loadConfig({
    NODE_ENV: "production",
    DB_PASSWORD: strong,
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    ...overrides
  });
const pick = ({ host, port, user, password, database }) => ({
  host,
  port,
  user,
  password,
  database
});

describe("configuration", () => {
  test("cookies are Secure by default in production and not in development", () => {
    assert.equal(production().cookieSecure, true);
    assert.equal(loadConfig({ DB_PASSWORD: "x" }).cookieSecure, false);
    assert.equal(production({ COOKIE_SECURE: "false" }).cookieSecure, false);
  });

  test("production refuses to start with default, short or missing secrets", () => {
    for (const password of [
      "hok_local_app_password",
      "hok_dev_password",
      "short",
      "replace-with-a-long-random-app-password",
      ""
    ]) {
      assert.throws(
        () => assertRuntimeConfig(production({ DB_PASSWORD: password })),
        /Refusing to start/,
        `password ${password}`
      );
    }
    assert.throws(
      () => assertRuntimeConfig(production({ COOKIE_SECURE: "false" })),
      /COOKIE_SECURE/
    );
    assert.throws(
      () =>
        assertRuntimeConfig(
          production({
            GOOGLE_CLIENT_ID: "a",
            GOOGLE_CLIENT_SECRET: "b",
            GOOGLE_REDIRECT_URI: "http://example.com/cb"
          })
        ),
      /https/
    );
    assert.doesNotThrow(() => assertRuntimeConfig(production()));
  });

  test("the refusal message never repeats the secret", () => {
    try {
      assertRuntimeConfig(production({ DB_PASSWORD: "hok_local_app_password" }));
      assert.fail("should throw");
    } catch (error) {
      assert.doesNotMatch(error.message, /hok_local_app_password/);
    }
  });

  test("a database that is not on this machine needs TLS in production, and the certificate is always checked", () => {
    for (const host of ["db.example.com", "203.0.113.7", "mysql-1234.aivencloud.com"]) {
      assert.throws(
        () => assertRuntimeConfig(production({ DB_HOST: host })),
        /DB_SSL=true/,
        `host ${host}`
      );
    }
    // on this machine, on a private network or a service of a Docker network: no TLS asked for
    for (const host of [
      "127.0.0.1",
      "localhost",
      "mysql",
      "10.0.0.5",
      "192.168.1.8",
      "172.20.0.2"
    ]) {
      assert.doesNotThrow(() => assertRuntimeConfig(production({ DB_HOST: host })), `host ${host}`);
    }
    const remote = production({ DB_HOST: "db.example.com", DB_SSL: "true" });
    assert.doesNotThrow(() => assertRuntimeConfig(remote));
    assert.equal(remote.db.ssl.rejectUnauthorized, true);
    assert.equal(remote.db.ssl.minVersion, "TLSv1.3");
    assert.equal(remote.db.ssl.ca, undefined);
    // nothing written but "true" switches it on, and nothing switches the check of the certificate off
    assert.equal("ssl" in loadConfig({ DB_PASSWORD: "x", DB_SSL: "false" }).db, false);
    assert.equal("ssl" in loadConfig({ DB_PASSWORD: "x", DB_SSL: "1" }).db, false);
    assert.equal(
      loadConfig({ DB_PASSWORD: "x", DB_SSL: "true", DB_SSL_INSECURE: "true" }).db.ssl
        .rejectUnauthorized,
      true
    );
  });

  test("the authority of the database provider is read from one line, \\n standing for a line break", () => {
    const ca = loadConfig({
      DB_PASSWORD: "x",
      DB_SSL: "true",
      DB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nAAAA\\n-----END CERTIFICATE-----"
    }).db.ssl.ca;
    assert.equal(ca, "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----");
  });

  test("the database can be given as one address (JAWSDB_URL on Heroku), and each DB_ setting written still wins", () => {
    const url = "mysql://user%40x:p%3Ass%2Fw0rd-long@db.example.com:3307/schema_1";
    assert.deepEqual(pick(loadConfig({ JAWSDB_URL: url }).db), {
      host: "db.example.com",
      port: 3307,
      user: "user@x",
      password: "p:ss/w0rd-long",
      database: "schema_1"
    });
    assert.equal(loadConfig({ DB_URL: "mysql://u:p@h.example.com/d" }).db.port, 3306);
    assert.equal(
      loadConfig({ DB_URL: "mysql://u:p@one.example.com/d", JAWSDB_URL: url }).db.host,
      "one.example.com",
      "DB_URL comes before the address of the add-on"
    );
    assert.equal(loadConfig({ JAWSDB_URL: url, DB_NAME: "other" }).db.database, "other");
    // an address that is not a MySQL one is an error at start, not a silent local database
    assert.throws(() => loadConfig({ JAWSDB_URL: "postgres://u:p@h/d" }), /mysql:\/\//);
    // a remote host from the address still needs TLS in production
    assert.throws(
      () => assertRuntimeConfig(production({ JAWSDB_URL: url, DB_HOST: "", DB_PASSWORD: "" })),
      /DB_SSL=true/
    );
  });

  test("development has no built-in database password", () => {
    assert.throws(() => assertRuntimeConfig(loadConfig({})), /DB_PASSWORD is not set/);
    assert.doesNotThrow(() => assertRuntimeConfig(loadConfig({ DB_PASSWORD: "anything-dev" })));
  });

  test("trust proxy, admin emails and sample threshold are parsed safely", () => {
    assert.equal(loadConfig({ TRUST_PROXY: "1" }).trustProxy, 1);
    assert.equal(loadConfig({ TRUST_PROXY: "false" }).trustProxy, false);
    assert.equal(loadConfig({}).trustProxy, false);
    assert.deepEqual(
      [...loadConfig({ ADMIN_EMAILS: " A@x.io , b@y.io ," }).adminEmails],
      ["a@x.io", "b@y.io"]
    );
    assert.equal(loadConfig({}).minSampleGames, 30);
    assert.equal(loadConfig({ MIN_SAMPLE_GAMES: "50" }).minSampleGames, 50);
    assert.equal(loadConfig({ MIN_SAMPLE_GAMES: "-3" }).minSampleGames, 30);
  });

  test("a development start does not draw every language at once nor start the Camp crawl at once", () => {
    const development = loadConfig({});
    assert.equal(development.prerenderWarmAllLanguages, false);
    assert.equal(development.detailsSyncStartupDelayMs, 600_000);
    const production = loadConfig({ NODE_ENV: "production" });
    assert.equal(production.prerenderWarmAllLanguages, true);
    assert.equal(production.detailsSyncStartupDelayMs, 60_000);
    // each can be chosen either way
    assert.equal(loadConfig({ PRERENDER_WARM_ALL: "true" }).prerenderWarmAllLanguages, true);
    assert.equal(
      loadConfig({ NODE_ENV: "production", PRERENDER_WARM_ALL: "false" }).prerenderWarmAllLanguages,
      false
    );
    assert.equal(
      loadConfig({ DETAILS_SYNC_STARTUP_DELAY_SECONDS: "5" }).detailsSyncStartupDelayMs,
      5000
    );
    assert.equal(
      loadConfig({ DETAILS_SYNC_STARTUP_DELAY_SECONDS: "-1" }).detailsSyncStartupDelayMs,
      600_000
    );
    // docker-compose passes an empty string for a variable that is not set: that is "the default", not "no delay"
    assert.equal(
      loadConfig({ DETAILS_SYNC_STARTUP_DELAY_SECONDS: "", PRERENDER_WARM_ALL: "" })
        .detailsSyncStartupDelayMs,
      600_000
    );
    assert.equal(
      loadConfig({ NODE_ENV: "production", PRERENDER_WARM_ALL: "" }).prerenderWarmAllLanguages,
      true
    );
  });
});

describe("OAuth return path", () => {
  test("only same-site absolute paths survive", () => {
    assert.equal(safeReturnPath("/scrims?x=1#a"), "/scrims?x=1#a");
    assert.equal(safeReturnPath("/"), "/");
    for (const hostile of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "\\\\evil",
      "javascript:alert(1)",
      "/\u0000x",
      "/\n//evil",
      "evil",
      "",
      undefined,
      null,
      5,
      `/${"a".repeat(1100)}`
    ]) {
      assert.equal(safeReturnPath(hostile), "/", String(hostile).slice(0, 30));
    }
  });
});

describe("validation", () => {
  test("team names: trimmed, bounded, distinct, no markup", () => {
    assert.deepEqual(normalizeTeamNames("  Fnatic   EMEA ", "Navi"), ["Fnatic EMEA", "Navi"]);
    assert.deepEqual(normalizeTeamNames("", ""), ["Team A", "Team B"]);
    assert.throws(() => normalizeTeamNames("Same", "SAME"), /different names/);
    assert.throws(() => normalizeTeamNames("x".repeat(41), "B"), /40 characters/);
    assert.throws(() => normalizeTeamNames("<script>", "B"), /control characters/);
    assert.throws(() => normalizeTeamNames("a\u0007b", "B"), /control characters/);
  });

  test("series creation input", () => {
    assert.equal(
      parseSeriesCreate({ teamA: "A", teamB: "B", bestOf: 3, gameMode: "free-for-all" }).draftMode,
      "solo"
    );
    assert.equal(
      parseSeriesCreate({
        teamA: "A",
        teamB: "B",
        bestOf: 3,
        gameMode: "free-for-all",
        draftMode: "two-players"
      }).draftMode,
      "two-players"
    );
    assert.throws(
      () =>
        parseSeriesCreate({
          teamA: "A",
          teamB: "B",
          bestOf: 3,
          gameMode: "free-for-all",
          draftMode: "online"
        }),
      /online endpoint/
    );
    assert.throws(
      () =>
        parseSeriesCreate({
          teamA: "A",
          teamB: "B",
          bestOf: 3,
          gameMode: "free-for-all",
          draftMode: "weird"
        }),
      /draft control/
    );
    assert.throws(() => parseSeriesCreate([]), /JSON object/);
    assert.throws(
      () =>
        parseSeriesCreate({
          teamA: { toString: () => "x" },
          teamB: "B",
          bestOf: 1,
          gameMode: "free-for-all"
        }),
      /string/
    );
  });

  test("pagination bounds", () => {
    assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, limit: 20, offset: 0 });
    assert.equal(parsePagination({ page: "3", pageSize: "10" }).offset, 20);
    for (const query of [
      { page: "0" },
      { page: "x" },
      { pageSize: "0" },
      { pageSize: "101" },
      { page: "1.5" }
    ]) {
      assert.throws(() => parsePagination(query));
    }
  });

  test("tier list shape", () => {
    const ok = parseTierListInput({
      name: " Mine ",
      tiers: [{ id: "a", label: "S", heroes: ["h1"] }],
      unranked: ["h2"]
    });
    assert.equal(ok.name, "Mine");
    assert.throws(
      () =>
        parseTierListInput({
          name: "x",
          tiers: Array.from({ length: 13 }, () => ({ label: "S", heroes: [] })),
          unranked: []
        }),
      /at most 12/
    );
    assert.throws(
      () =>
        parseTierListInput({ name: "x", tiers: [{ label: "S", heroes: ["../x"] }], unranked: [] }),
      /invalid hero id/
    );
    assert.throws(
      () => parseTierListInput({ name: "", tiers: [], unranked: [] }),
      /between 1 and 80/
    );
    assert.throws(
      () =>
        parseTierListInput({
          name: "x",
          tiers: [],
          unranked: Array.from({ length: 401 }, (_, index) => `h${index}`)
        }),
      /at most 400/
    );
  });

  test("invitation request defaults and limits", () => {
    assert.deepEqual(parseInviteRequest(undefined), {
      role: "viewer",
      ttlMs: 7 * 86_400_000,
      maxUses: 1
    });
    assert.equal(
      parseInviteRequest({ role: "editor", expiresInDays: 30, maxUses: 20 }).maxUses,
      20
    );
    assert.throws(() => parseInviteRequest({ role: "owner" }), /viewer or editor/);
    assert.throws(() => parseInviteRequest({ expiresInDays: 31 }));
    assert.throws(() => parseInviteRequest({ maxUses: 0 }));
  });
});
