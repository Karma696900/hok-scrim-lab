// Browser check of the lanes of a hero: logos instead of letters (several when the hero plays
// several lanes), an administrator adds and removes lanes on the sheet (Camp's too, but never the
// last one) and every list follows without reloading the page.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";

const app = await startTestServer({ seedHeroes: false });
// five heroes with numeric ids (the sheet address wants a number): 601 Clash, 602 Jungle, 603 Mid,
// 604 Farm, 605 Roamer
await app.store.saveHeroes(
  [
    ["601", "Clash Lane"],
    ["602", "Jungle"],
    ["603", "Mid Lane"],
    ["604", "Farm Lane"],
    ["605", "Roamer"]
  ].map(([id, lane]) => ({
    id,
    name: `Hero ${id}`,
    image: `https://camp.honorofkings.com/${id}.png`,
    roles: ["Fighter"],
    lanes: [lane],
    sourceIds: [id]
  })),
  "20261005"
);
const admin = await app.signIn("LaneBoss", { admin: true });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
// 602 plays the Jungle (Camp), h01 the Clash Lane. One tier list per lane, made before the change.
const lists = {};
for (const lane of ["Clash Lane", "Jungle"]) {
  lists[lane] = (
    await admin.browser.post("/api/tier-lists", { name: lane, lane, tiers: [], unranked: [] })
  ).body.id;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
  if (
    ["error", "warning"].includes(message.type()) &&
    !/status of 40[0-9]|Failed to load resource/.test(message.text())
  ) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
page.on("dialog", dialog => dialog.accept());

// ---- the index: a logo per lane, no letters -----------------------------------------------------
await page.goto(`${app.baseUrl}/heroes`);
await page.waitForSelector(".hcard");
check(
  "the index shows lane logos, not letters",
  (await page.locator(".hcard .lanes .lane img").count()) > 0 &&
    (await page.locator(".lane-badge").count()) === 0
);

// ---- the sheet of a one-lane hero ---------------------------------------------------------------
await page.goto(`${app.baseUrl}/heroes/602`);
await page.waitForSelector(".lane-tags .lane-pill");
check(
  "the sheet shows the lane with its logo",
  (await page.locator(".lane-tags .lane-pill").count()) === 1 &&
    (await page.locator(".lane-tags .lane-pill img.lane-icon").count()) === 1
);
check(
  "the only lane cannot be removed, and the page says why",
  (await page.locator(".lane-remove:disabled").count()) === 1 &&
    /at least one lane/i.test((await page.locator(".lane-remove").getAttribute("title")) ?? "")
);

// ---- add a second lane --------------------------------------------------------------------------
await page.selectOption("#hero-lane-select", "Clash Lane");
await page.click('[data-action="add-hero-lane"]');
await page.waitForFunction(() => document.querySelectorAll(".lane-tags .lane-pill").length === 2);
check(
  "the hero now shows two lanes, each with its logo",
  (await page.locator(".lane-tags .lane-pill img.lane-icon").count()) === 2
);
check(
  "each lane can be removed now",
  (await page.locator(".lane-remove:not(:disabled)").count()) === 2
);

// ---- the lists follow, without a reload ---------------------------------------------------------
await goNav(page, '.nav-link[data-view="tier-lists"]');
await page.waitForSelector('[data-action="tier-lane-filter"]');
await page.click('[data-action="tier-lane-filter"][data-lane="Clash Lane"]');
await page.waitForSelector(".tier-unranked");
check(
  "the tier lists of the new lane now have the hero",
  (await page.locator('.tier-unranked [data-hero-id="602"]').count()) === 1
);
await page.click('[data-action="tier-lane-filter"][data-lane="Jungle"]');
check(
  "and the ones of its other lane keep it",
  (await page.locator('.tier-unranked [data-hero-id="602"]').count()) === 1
);
await goNav(page, '.nav-link[data-view="scrims"]');
await page.waitForSelector("#team-a");

// ---- take Camp's lane away ----------------------------------------------------------------------
await page.goto(`${app.baseUrl}/heroes/602`);
await page.waitForSelector(".lane-tags .lane-pill");
await page.locator('.lane-remove[data-lane="Jungle"]').click();
await page.waitForFunction(() => document.querySelectorAll(".lane-tags .lane-pill").length === 1);
check(
  "Camp's lane can be taken away while another one remains",
  /clash/i.test(await page.locator(".lane-tags .lane-pill").innerText()) &&
    !/jungle/i.test(await page.locator(".lane-tags .lane-pill").innerText())
);
check(
  "the last lane's remove button is disabled again",
  (await page.locator(".lane-remove:disabled").count()) === 1
);
await goNav(page, '.nav-link[data-view="tier-lists"]');
await page.waitForSelector('[data-action="tier-lane-filter"]');
await page.click('[data-action="tier-lane-filter"][data-lane="Jungle"]');
await page.waitForSelector(".tier-unranked");
check(
  "the hero left the Jungle tier lists",
  (await page.locator('.tier-unranked [data-hero-id="602"]').count()) === 0
);
await page.click('[data-action="tier-lane-filter"][data-lane="Clash Lane"]');
check(
  "and is in the Clash ones",
  (await page.locator('.tier-unranked [data-hero-id="602"]').count()) === 1
);

// ---- Camp's lane comes back ---------------------------------------------------------------------
await page.goto(`${app.baseUrl}/heroes/602`);
await page.waitForSelector(".lane-tags .lane-pill");
await page.selectOption("#hero-lane-select", "Jungle");
await page.click('[data-action="add-hero-lane"]');
await page.waitForFunction(() => document.querySelectorAll(".lane-tags .lane-pill").length === 2);
check(
  "a lane that was taken away can be given back",
  (await page.locator(".lane-tags .lane-pill").count()) === 2
);

// ---- a visitor sees the lanes but no tool -------------------------------------------------------
const visitor = await browser.newPage();
await visitor.goto(`${app.baseUrl}/heroes/602`);
await visitor.waitForSelector(".lane-tags .lane-pill");
check(
  "a visitor sees the lanes with their logos and no remove button",
  (await visitor.locator(".lane-tags img.lane-icon").count()) === 2 &&
    (await visitor.locator(".lane-remove").count()) === 0
);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nhero lanes e2e passed");
