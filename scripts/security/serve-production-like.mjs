#!/usr/bin/env node
// Starts the application with the configuration of production (secure cookies, plain http sent to https,
// HSTS, rate limits ON, the first screen drawn by the server) on a throw-away MySQL database, prints its
// address and stays up: the thing to point the vulnerability probe at, without touching real data.
//   npm run build
//   node scripts/security/serve-production-like.mjs                  (prints "READY http://127.0.0.1:<port>")
//   PROBE_FORWARDED_PROTO=https node scripts/security/vulnerability-probe.mjs http://127.0.0.1:<port>
// The probe says it comes through the proxy that ends TLS (X-Forwarded-Proto), as every visitor does in
// production; the server trusts it (TRUST_PROXY=1). Stop it with Ctrl+C: the database is dropped by
// scripts/database/drop-test-databases.mjs.
import { randomBytes } from "node:crypto";
import { launchChromium } from "../../src/server/features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "../../src/server/platform/http/prerender.js";
import { createLimiters } from "../../src/server/platform/http/rate-limits.js";
import { sampleHeroes, startTestServer } from "../../src/testing/test-app.js";

let address = "";
const prerender = createPrerenderer({
  launch: launchChromium,
  baseUrl: () => address,
  logger: { info() {}, warn: (...details) => console.warn(...details), error: console.error },
  ttlMs: 6 * 60 * 60 * 1000
});
const app = await startTestServer({
  seedHeroes: false,
  prerender,
  limiters: createLimiters({ enabled: true }),
  env: {
    NODE_ENV: "production",
    RATE_LIMIT_DISABLED: "false",
    COOKIE_SECURE: "true",
    TRUST_PROXY: "1",
    SCRYPT_LOG2N: "10", // the cost of a password is not what is probed here
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64")
  }
});
if (!app) {
  throw new Error("MySQL is not reachable (docker compose up -d mysql)");
}
address = app.baseUrl;
await app.store.saveHeroes(
  sampleHeroes(40).map((hero, index) => ({
    ...hero,
    id: String(501 + index),
    sourceIds: [String(501 + index)],
    image: ""
  })),
  "20261006"
);
let missed = 0;
for (const path of ["/", "/heroes", "/heroes/501", "/login"]) {
  if (!(await prerender.get(path, "en"))) {
    missed += 1;
    console.warn(`not drawn: ${path}`);
  }
}
console.log(
  missed ? `${missed} page(s) were not drawn by the server` : "pages drawn by the server"
);
console.log("READY", app.baseUrl);
setInterval(() => {}, 1 << 30);
