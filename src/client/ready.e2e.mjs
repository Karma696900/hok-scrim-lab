// Browser check of the "ready" flag: html[data-ready] is set when the page the address asks for has been
// drawn, not before. The modules of the pages that are downloaded on demand are slowed down so that the
// order is certain: a flag set too early would show on every page, whatever the speed of the machine.
import { chromium } from "playwright";
import { startTestServer } from "../testing/test-app.js";

const app = await startTestServer();
const user = await app.signIn("Karma");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();

/**
 * Opens `path` with the modules of the features slowed down, and says what the page held at the moment
 * html[data-ready] was set (the flag is watched from inside the page, so no polling delay can hide it).
 */
async function whatIsThereAtReady(path, { cookie = user, delay = 400 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookie) {
    await context.addCookies([
      { name: "hok_session", value: cookie.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  let slowed = 0;
  await page.route(/\/features\/[^?]*\.js(\?|$)/, async route => {
    slowed += 1;
    await new Promise(resolve => setTimeout(resolve, delay));
    await route.continue().catch(() => {});
  });
  await page.addInitScript(() => {
    window.__atReady = null;
    const watch = new MutationObserver(() => {
      if (document.documentElement.dataset.ready === "1" && !window.__atReady) {
        const view = document.querySelector("#view");
        window.__atReady = {
          loadingLine: Boolean(view?.querySelector(".loading-line")),
          heading: view?.querySelector("h1")?.textContent.trim() ?? "",
          cards:
            view?.querySelectorAll(".tcard, .hcard, .hero-card, .tier-card, .empty").length ?? 0
        };
        watch.disconnect();
      }
    });
    // (the root element does not exist yet when this script runs: the document is watched)
    watch.observe(document, { attributes: true, subtree: true, attributeFilter: ["data-ready"] });
  });
  await page.goto(`${app.baseUrl}${path}`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 20000 });
  const seen = await page.evaluate(() => window.__atReady);
  await context.close();
  return seen && { ...seen, slowed };
}

// the pages whose code is downloaded when they are opened: each one has drawn its heading by then
for (const [path, label] of [
  ["/", "the overview"],
  ["/heroes", "the heroes"],
  ["/teams", "the teams"],
  ["/tier-lists", "the tier lists"],
  ["/history", "the history"],
  ["/training", "the training"],
  ["/settings", "the settings"]
]) {
  const seen = await whatIsThereAtReady(path);
  console.log("     at the flag:", JSON.stringify(seen));
  check(
    `${label}: the page is drawn when the flag is set (no loading bar, a heading)`,
    seen && !seen.loadingLine && seen.heading.length > 0
  );
  check(`${label}: the modules were really slowed down`, seen?.slowed > 0);
}

// a visitor, and a page with no session, are the same
const visitor = await whatIsThereAtReady("/heroes", { cookie: null });
check(
  "a visitor's heroes page is drawn when the flag is set",
  visitor && !visitor.loadingLine && visitor.heading.length > 0
);

const signIn = await whatIsThereAtReady("/login", { cookie: null });
check(
  "the sign-in page is drawn when the flag is set",
  signIn && !signIn.loadingLine && signIn.heading.length > 0
);

// the flag is still set when a lazily loaded page never arrives: the page is not held for ever
const stuckContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await stuckContext.addCookies([
  { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const stuck = await stuckContext.newPage();
await stuck.route(/\/features\/teams\/[^?]*\.js(\?|$)/, route => route.abort());
await stuck.goto(`${app.baseUrl}/teams`);
const held = Date.now();
await stuck.waitForSelector("html[data-ready='1']", { timeout: 20000 });
check(
  "a page whose code cannot be downloaded does not hold the flag for more than a few seconds",
  Date.now() - held < 9000
);
await stuckContext.close();

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nready e2e clean");
process.exit(problems.length ? 1 : 0);
