// Browser check of the composition roulette (/casino, spec 2026-11-07 casino): no account anywhere. A creates a
// roulette and spins; B opens the share link and sees the same five heroes, without controls, and follows A's respin
// and ban live; C opens A's control link and gets the controls; D comes with a wrong key and is a spectator. On a
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
  page.on("pageerror", error => problems.push(`page error: ${error.message}`));
  return page;
};
const names = page => page.locator(".casino-reel .casino-hero b").allInnerTexts();
const nameIn = (page, lane) =>
  page.locator(`.casino-reel[data-lane="${lane}"] .casino-hero b`).innerText();
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
const midBefore = await nameIn(a, "mid");
await a.check('input[name="casino-lane"][value="mid"]');
await act(a, '[data-action="casino-respin"]');
const midAfter = await nameIn(a, "mid");
const started = Date.now();
await b.waitForFunction(
  name =>
    document.querySelector('.casino-reel[data-lane="mid"] .casino-hero b')?.textContent === name,
  midAfter,
  { timeout: 3500 }
);
check(
  `the spectator sees the new Mid within 3 s (${Date.now() - started} ms)`,
  Date.now() - started <= 3500
);
check("the respin changed Mid", midAfter !== midBefore || first.length === 0);
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
  (await a.locator(".casino-banned").innerText()).includes(farm)
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
