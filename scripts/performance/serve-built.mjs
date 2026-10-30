#!/usr/bin/env node
// Starts the application as it runs in production (the bundle of dist/, and the first screen drawn
// by the server for visitors with no session) on a throw-away MySQL database with a small test
// roster, prints its address and stays up: the thing to point Lighthouse at when no development
// server is available.
//   npm run build
//   HOK_TEST_BUILT=true node scripts/performance/serve-built.mjs [paths...]     (prints "READY http://127.0.0.1:<port>")
//   npx lighthouse http://127.0.0.1:<port>/ --preset=desktop
// The paths given (by default the ones Lighthouse is usually run on) are drawn in English and French
// before "READY" is printed, so that the first measured visit is not the one that pays for the render.
// The test heroes have numeric ids (501…540, like the real ones) and no picture: a picture would be
// fetched from the Camp site, which a sandboxed run cannot reach, and a failed request only adds
// console errors that say nothing about the pages.
import { launchChromium } from "../../src/server/features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "../../src/server/platform/http/prerender.js";
import { sampleHeroes, startTestServer } from "../../src/testing/test-app.js";

const PATHS = [
  "/",
  "/heroes",
  "/heroes/501",
  "/tier-lists",
  "/login",
  "/register",
  "/scrims",
  "/history",
  "/build-lab",
  "/teams",
  "/find",
  "/training",
  "/settings",
  "/welcome"
];
const paths = process.argv.slice(2).length ? process.argv.slice(2) : PATHS;

let address = "";
const prerender = createPrerenderer({
  launch: launchChromium,
  baseUrl: () => address,
  logger: { info() {}, warn: (...details) => console.warn(...details), error: console.error },
  ttlMs: 6 * 60 * 60 * 1000
});
const app = await startTestServer({ seedHeroes: false, prerender });
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
for (const language of ["en", "fr"]) {
  for (const path of paths) {
    if (!(await prerender.get(path, language))) {
      missed += 1;
      console.warn(`not drawn: ${language} ${path}`);
    }
  }
}
console.log(`drawn: ${paths.length * 2 - missed} of ${paths.length * 2}`);
console.log("READY", app.baseUrl);
setInterval(() => {}, 1 << 30);
