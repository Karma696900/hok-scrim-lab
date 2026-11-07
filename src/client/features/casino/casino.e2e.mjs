// Browser check of the composition roulette (/casino, spec 2026-11-07 casino): no account anywhere. A creates a
// roulette and spins; B opens the share link and sees the same five heroes, without controls, and follows A's respin
// and ban live, then keeps compositions in the basket and downloads one PDF; C opens A's control link and gets the controls; D comes with a wrong key and is a spectator. On a
// phone nothing scrolls sideways, with motion allowed and reduced.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
if (!app) {
  console.log("MySQL is not reachable (docker compose up -d mysql)");
  process.exit(1);
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  page.on("pageerror", error => {
    console.log(`page error: ${error.stack}`);
    problems.push(`page error: ${error.message}`);
  });
  return page;
};
const names = page => page.locator(".casino-reel .casino-hero b").allTextContents();
const nameIn = (page, lane) =>
  page.locator(`.casino-reel[data-lane="${lane}"] .casino-hero b`).textContent();
const version = page =>
  page.evaluate(() =>
    Number(document.querySelector(".casino[data-version]")?.dataset.version ?? -1)
  );
// the result of a version newer than `before` is painted and every reel stopped (one hero each)
const settled = (page, before = -1) =>
  page.waitForFunction(
    since =>
      Number(document.querySelector(".casino[data-version]")?.dataset.version ?? -1) > since &&
      !document.querySelector(".casino-reel.is-spinning") &&
      [...document.querySelectorAll(".casino-reel")].every(
        reel => reel.querySelectorAll(".casino-hero").length === 1
      ),
    before
  );
// clicks `selector` on `page` and waits until its change is painted and the reels stopped
const act = async (page, selector) => {
  const before = await version(page);
  await page.click(selector);
  await settled(page, before);
};

// ---- A creates and spins ----
const a = await open();
await a.goto(`${app.baseUrl}/casino`);
await a.click('[data-action="casino-create"]');
await a.waitForURL(/\/casino\/[A-Za-z0-9]{10}$/);
const shareUrl = a.url();
await a.waitForSelector('[data-action="casino-spin"]');
check("the creator lands on its roulette with the controls", true);
await act(a, '[data-action="casino-spin"]');
const first = await names(a);
check("a spin shows five heroes, all different", first.length === 5 && new Set(first).size === 5);

// ---- B watches ----
const b = await open();
await b.goto(shareUrl);
await b.waitForSelector(".casino-reel .casino-hero b");
check(
  "the share link shows the same five heroes",
  JSON.stringify(await names(b)) === JSON.stringify(first)
);
check(
  "the spectator has no spin button",
  (await b.locator('[data-action="casino-spin"]').count()) === 0
);
check(
  "the spectator has no Banned button",
  (await b.locator('[data-action="casino-ban"]').count()) === 0
);

// ---- A respins Mid only; B follows ----
// (a respin draws again from the pool: it may land on the same hero, so the check is the version and the history)
await a.click('[data-action="casino-lane-toggle"][data-lane="mid"]');
check(
  "the Respin button of Mid stays pressed until the respin",
  (await a.getAttribute('[data-action="casino-lane-toggle"][data-lane="mid"]', "aria-pressed")) ===
    "true"
);
await act(a, '[data-action="casino-respin"]');
const midAfter = await nameIn(a, "mid");
const respun = await version(a);
const started = Date.now();
await b.waitForFunction(
  ([name, at]) =>
    Number(document.querySelector(".casino[data-version]")?.dataset.version) === at &&
    document.querySelector('.casino-reel[data-lane="mid"] .casino-hero b')?.textContent === name,
  [midAfter, respun],
  { timeout: 3500 }
);
check(
  `the spectator sees the respun Mid within 3 s (${Date.now() - started} ms)`,
  Date.now() - started <= 3500
);
const last = await a.evaluate(
  id => fetch(`/api/casino/${id}`).then(response => response.json()),
  shareUrl.split("/").pop()
);
check(
  "the respin drew Mid only",
  last.history[0].kind === "respin" && JSON.stringify(last.history[0].lanes) === '["mid"]'
);
await settled(b, 1);
const others = async page =>
  Promise.all(["clash", "jungle", "farm", "roam"].map(lane => nameIn(page, lane)));
check(
  "the other four lanes did not change",
  JSON.stringify(await others(b)) === JSON.stringify([first[0], first[1], first[3], first[4]])
);

// ---- A bans Farm ----
const farm = await nameIn(a, "farm");
await act(a, '[data-action="casino-ban"][data-lane="farm"]');
check(
  "the banned hero is listed under Banned",
  (await a.locator(".casino-banned").textContent()).includes(farm)
);
check("Farm changed after the ban", (await nameIn(a, "farm")) !== farm);
await b.waitForFunction(
  text => document.querySelector(".casino-banned")?.textContent.includes(text),
  farm,
  {
    timeout: 3500
  }
);
check("the spectator sees the ban", true);

// ---- A takes a hero out of the Jungle pool: saved by itself ----
const dropped = await a
  .locator('.casino-pick[data-lane="jungle"][aria-pressed="true"]')
  .first()
  .getAttribute("data-hero");
const jungle = a.locator(`.casino-pick[data-lane="jungle"][data-hero="${dropped}"]`);
await jungle.click();
check(
  "a pool avatar is released at the click",
  (await jungle.getAttribute("aria-pressed")) === "false"
);
await a.waitForFunction(() =>
  /saved/i.test(document.querySelector("[data-pools-status]")?.textContent ?? "")
);
const pooled = await a.evaluate(
  id => fetch(`/api/casino/${id}`).then(response => response.json()),
  shareUrl.split("/").pop()
);
check("the pool is saved without a Save button", !pooled.pools.jungle.includes(dropped));

// ---- the basket: B (a spectator) keeps the composition and downloads one PDF ----
await b.click('[data-action="casino-basket-add"]');
await b.click('[data-action="casino-basket-add"]');
check(
  "the spectator can keep compositions (the count says 2)",
  (await b.locator(".cs-stage .casino-count").innerText()) === "2"
);
await b.click('[data-action="casino-basket-open"]');
await b.waitForSelector("dialog.casino-basket[open] .casino-basket__item");
check(
  "the basket lists the two compositions",
  (await b.locator(".casino-basket__item").count()) === 2
);
await b.fill('dialog.casino-basket input[name="casino-basket-name"] >> nth=0', "Dive comp");
await b.locator('dialog.casino-basket input[name="casino-basket-name"] >> nth=0').blur();
await b.click('[data-action="casino-basket-remove"] >> nth=1');
check("a composition is removed", (await b.locator(".casino-basket__item").count()) === 1);
const [file] = await Promise.all([
  b.waitForEvent("download", { timeout: 60_000 }),
  b.click('[data-action="casino-basket-pdf"]')
]);
const pdfPath = await file.path();
const { readFileSync } = await import("node:fs");
const bytes = pdfPath ? readFileSync(pdfPath) : Buffer.alloc(0);
check(
  `the basket downloads one PDF (${file.suggestedFilename()}, ${bytes.length} bytes)`,
  /^hok-compositions-\d{4}-\d{2}-\d{2}\.pdf$/.test(file.suggestedFilename()) &&
    bytes.subarray(0, 5).toString() === "%PDF-"
);
check(
  "the name typed is kept in the basket",
  await b.evaluate(() => JSON.parse(localStorage.getItem("casino-basket"))[0].name === "Dive comp")
);
await b.click('[data-action="casino-basket-close"]');

// ---- C opens the control link ----
const key = await a.evaluate(
  id => localStorage.getItem(`casino-key:${id}`),
  shareUrl.split("/").pop()
);
const c = await open();
await c.goto(`${shareUrl}#key=${key}`);
await c.waitForSelector('[data-action="casino-spin"]');
check("the control link gives the controls on another browser", true);
check("the key is taken out of the address", !(await c.evaluate(() => location.hash)));

// ---- D comes with a wrong key ----
const d = await open();
await d.goto(`${shareUrl}#key=${"W".repeat(43)}`);
await d.waitForSelector('[data-action="casino-spin"]');
await d.click('[data-action="casino-spin"]');
await d.waitForSelector(".toast");
check(
  "a wrong key says so and leaves a spectator",
  (await d.locator(".toast").last().innerText()).includes("not valid") &&
    (await d.locator('[data-action="casino-spin"]').count()) === 0
);

// ---- a roulette that does not exist ----
await d.goto(`${app.baseUrl}/casino/zzzzzzzzzz`);
await d.waitForSelector(".casino--missing");
check("an unknown roulette says it does not exist", true);

// ---- on a phone, motion allowed and reduced ----
for (const reducedMotion of ["no-preference", "reduce"]) {
  const phone = await open({ viewport: { width: 390, height: 844 }, reducedMotion });
  await phone.goto(`${shareUrl}#key=${key}`);
  await phone.waitForSelector('[data-action="casino-spin"]');
  await act(phone, '[data-action="casino-spin"]');
  check(
    `on a phone (${reducedMotion}) nothing scrolls sideways`,
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
  const covered = await phone.evaluate(() => {
    const found = [];
    for (const element of document.querySelectorAll("#casino-root button, #casino-root input")) {
      if (!element.getClientRects().length || element.closest("details:not([open])")) {
        continue;
      }
      element.scrollIntoView({ block: "center", behavior: "instant" });
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) {
        found.push(
          `${element.localName}.${element.className} under ${hit.localName}.${hit.className}`
        );
      }
    }
    return found;
  });
  check(
    `on a phone (${reducedMotion}) every control can be reached: ${covered.join(", ")}`,
    !covered.length
  );
}

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ncasino e2e clean");
process.exit(problems.length ? 1 : 0);
