import { createHash, randomBytes, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { createStore } from "../server/platform/database/store.js";
import { createLimiters } from "../server/platform/http/rate-limits.js";
import { createLogger } from "../server/platform/logger.js";
import { createSecretBox } from "../server/platform/security/secret-box.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createImageProxy } from "../server/features/media/image-proxy.js";
import { createExportQueue } from "../server/features/export/queue.js";
import { createExportService } from "../server/features/export/export-service.js";
import { createPdfExporter } from "../server/features/export/pdf-exporter.js";
import { createPortraitCache } from "../server/features/media/portrait-cache.js";
import { createTranslationService } from "../server/features/translations/translation-service.js";

// Tests run against the sources of client/ (a stale build must never hide a change);
// HOK_TEST_BUILT=true tests the bundle instead.
if (process.env.HOK_TEST_BUILT !== "true") {
  process.env.HOK_SOURCE_ASSETS = "true";
}

// Dev-only defaults matching docker-compose.yml. They never appear in server/.
const host = process.env.TEST_DB_HOST || "127.0.0.1";
const port = Number(process.env.TEST_DB_PORT || 8080);
const appUser = process.env.TEST_DB_USER || "hok_app";
const appPassword = process.env.TEST_DB_PASSWORD || "hok_local_app_password";
const rootPassword = process.env.TEST_DB_ROOT_PASSWORD || "hok_local_root_password";

export const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

export function sampleHeroes(count = 30) {
  return Array.from({ length: count }, (_, index) => {
    const id = `h${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      name: `Hero ${id}`,
      image: `https://camp.honorofkings.com/${id}.png`,
      roles: ["Fighter"],
      lanes: [LANES[index % 5]],
      sourceIds: [id]
    };
  });
}

async function rootConnection() {
  return mysql.createConnection({ host, port, user: "root", password: rootPassword });
}

/** Creates an isolated MySQL database for this test file, or returns null when MySQL is unreachable. */
export async function createTestDatabase() {
  const name = `hok_test_${randomBytes(6).toString("hex")}`;
  let root;
  try {
    root = await rootConnection();
    await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    await root.query(`GRANT ALL ON \`${name}\`.* TO ?@'%'`, [appUser]);
  } catch {
    await root?.end().catch(() => {});
    return null;
  }
  await root.end();
  return {
    name,
    config: { host, port, user: appUser, password: appPassword, database: name },
    async drop() {
      const connection = await rootConnection();
      await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await connection.end();
    }
  };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Minimal cookie-aware HTTP client against a listening app. */
export function createClient(baseUrl) {
  return function client(cookie = "") {
    const jar = new Map();
    for (const part of cookie
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)) {
      const separator = part.indexOf("=");
      jar.set(part.slice(0, separator), part.slice(separator + 1));
    }
    async function request(method, path, body, headers = {}) {
      const response = await fetch(baseUrl + path, {
        method,
        redirect: "manual",
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(jar.size
            ? { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") }
            : {}),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";");
        const separator = pair.indexOf("=");
        const key = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || /Max-Age=0/i.test(header)) {
          jar.delete(key);
        } else {
          jar.set(key, value);
        }
      }
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: response.status, headers: response.headers, body: json, text };
    }
    return {
      jar,
      get: (path, headers) => request("GET", path, undefined, headers),
      post: (path, body = {}, headers) => request("POST", path, body, headers),
      put: (path, body = {}, headers) => request("PUT", path, body, headers),
      patch: (path, body = {}, headers) => request("PATCH", path, body, headers),
      delete: (path, headers) => request("DELETE", path, undefined, headers)
    };
  };
}

const silentLogger = createLogger({
  level: "error",
  sink: line => {
    if (process.env.HOK_TEST_LOG) {
      console.error(line);
    }
  }
});

/**
 * Boots the real app on an ephemeral port against an isolated MySQL database. Returns null when
 * MySQL is unreachable so callers can skip.
 */
import { PDFDocument } from "pdf-lib";

/** A real one-page PDF, for exporter stubs (the export service embeds data in it). */
const blankDocument = await PDFDocument.create();
blankDocument.addPage([200, 200]);
export const BLANK_PDF = Buffer.from(await blankDocument.save());

export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

/** Real exporter (Chromium) with a portrait cache fed by a stub fetch: no network in tests. */
export function buildExportService(store, { exporter, queue, fetchImpl } = {}) {
  return createExportService({
    store,
    portraits: createPortraitCache({
      directory: mkdtempSync(path.join(tmpdir(), "hok-portraits-")),
      fetchImpl:
        fetchImpl ??
        (async () => new Response(PIXEL_PNG, { headers: { "content-type": "image/png" } }))
    }),
    exporter: exporter ?? createPdfExporter({}),
    queue: queue ?? createExportQueue({ concurrency: 1, maxQueued: 4 })
  });
}

export async function startTestServer({
  env = {},
  rosterSync,
  limiters,
  seedHeroes = true,
  exportService,
  detailsSync = null,
  mediaProbe,
  imageProxy,
  prerender = null,
  discordService = null,
  translationProvider = null,
  translationConfig = {}
} = {}) {
  const database = await createTestDatabase();
  if (!database) {
    return null;
  }
  const config = loadConfig({
    NODE_ENV: "test",
    DB_PASSWORD: database.config.password,
    RATE_LIMIT_DISABLED: "true",
    SCRYPT_LOG2N: "10",
    ...env
  });
  const store = createStore(database.config);
  await store.initializeDatabase();
  if (seedHeroes) {
    await store.saveHeroes(sampleHeroes(), "20260925");
  }
  const fallbackSync = {
    run: async () => {
      throw new Error("offline");
    },
    isRunning: () => false
  };
  const secretBox = createSecretBox(randomBytes(32));
  // The translator of what the staff writes. A test gives it a provider of its own (nothing is ever
  // sent to a real service) and runs a round with `translations.sweep()`: its timers do not run.
  const translations = createTranslationService({
    store,
    provider: translationProvider,
    config: translationConfig,
    logger: silentLogger,
    onChange: () => prerender?.invalidate()
  });
  const app = createApp({
    store,
    config,
    secretBox,
    mediaProbe,
    prerender,
    discordService,
    translations,
    imageProxy: imageProxy ?? stubImageProxy(),
    rosterSync: rosterSync ?? fallbackSync,
    detailsSync,
    exportService:
      exportService === undefined
        ? buildExportService(store)
        : typeof exportService === "function"
          ? exportService(store)
          : exportService,
    logger: silentLogger,
    limiters: limiters ?? createLimiters({ enabled: false })
  });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const makeClient = createClient(baseUrl);
  const cookieName = config.cookieSecure ? "__Host-hok_session" : "hok_session";

  return {
    /** The Express application itself (its `locals` carry the draining flag of the shutdown). */
    expressApp: app,
    store,
    translations,
    config,
    baseUrl,
    database,
    /** A fresh anonymous browser (cookie jar). */
    browser: (cookie = "") => makeClient(cookie),
    /**
     * A browser signed in with a new Google-like account. `onboarded: false` keeps the account as a brand new one,
     * which the site sends to its welcome pages.
     */
    signIn: (name, options) => signInAs({ store, config, makeClient, cookieName }, name, options),
    /**
     * Test-only back door: edits the stored series directly (e.g. to move a deadline into the
     * past).
     */
    rewriteSeries: (id, mutate) => rewriteSeries(store, id, mutate),
    async close() {
      await new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections?.();
      });
      await store.closeDatabase();
      await database.drop();
    }
  };
}

async function signInAs(
  { store, config, makeClient, cookieName },
  name,
  { admin = false, onboarded = true } = {}
) {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
  const created = await store.upsertGoogleUser({
    googleSubject: `sub-${randomUUID()}`,
    email,
    picture: ""
  });
  await store.completeProfile(created.id, { name, passwordHash: null, loginEmail: null }); // the pseudo is chosen, never taken from Google
  const user = { ...created, name, profile_complete: 1 };
  if (onboarded) {
    await store.savePreferences(created.id, {
      modules: ["scrims", "tier-lists", "heroes", "training"]
    });
  }
  if (admin) {
    config.adminEmails.add(email.toLowerCase());
  }
  const token = randomBytes(32).toString("base64url");
  await store.createSession(sha256(token), user.id, Date.now() + 3600_000);
  return { user, email, browser: makeClient(`${cookieName}=${token}`) };
}

async function rewriteSeries(store, id, mutate) {
  const [[row]] = await store.pool.query("SELECT data_json FROM series WHERE id = ?", [id]);
  const data = JSON.parse(row.data_json);
  mutate(data);
  await store.pool.execute("UPDATE series SET data_json = ?, version = version + 1 WHERE id = ?", [
    JSON.stringify(data),
    id
  ]);
}

/** Plays a series' current draft to completion (20 actions) using the sample heroes. */
export async function playFullDraft(browser, seriesId, { offset = 0 } = {}) {
  // 20 actions with bans (Global Ban & Pick), 10 picks only (Free For All): the draft says which
  const current = (await browser.get(`/api/series/${seriesId}`)).body.currentGame?.draft;
  const total = current?.picksOnly ? 10 : 20;
  for (let index = 0; index < total; index += 1) {
    const response = await browser.post(`/api/series/${seriesId}/game/action`, {
      heroId: `h${String(index + 1 + offset).padStart(2, "0")}`
    });
    if (response.status !== 200) {
      throw new Error(`action ${index} failed: ${response.text}`);
    }
  }
}

export const CREATE_BODY = { teamA: "Alpha", teamB: "Bravo", bestOf: 3, gameMode: "free-for-all" };

/**
 * The image proxy over a fake Camp that answers every picture with a one-pixel PNG: no network in
 * tests.
 */
function stubImageProxy() {
  return createImageProxy({
    directory: mkdtempSync(path.join(tmpdir(), "hok-test-img-")),
    fetchImpl: async () =>
      new Response(PIXEL_PNG, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(PIXEL_PNG.length) }
      })
  });
}
