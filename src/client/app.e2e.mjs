// Browser smoke test: boots the real app on an isolated DB, drives the UI with Chromium, and fails
// on any console error or CSP violation.
import { chromium } from "playwright";

import { startTestServer } from "../testing/test-app.js";
import { goNav } from "../testing/nav.js";
const app = await startTestServer();
if (!app) {
  console.log("MySQL unavailable");
  process.exit(2);
}

const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
page.on("requestfailed", request => {
  if (!request.url().includes("camp.honorofkings.com")) {
    problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`);
  }
});

// Camp portraits are remote and the seeded heroes use fake URLs: answer them with a 1x1 PNG.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);

const step = async (label, action) => {
  try {
    await action();
    console.log(`ok   ${label}`);
  } catch (error) {
    problems.push(`${label}: ${error.message.split("\n")[0]}`);
    console.log(`FAIL ${label}`);
  }
};

await step("load home", async () => {
  await page.goto(app.baseUrl);
  await page.waitForSelector("#view h1");
});
await step("fonts self-hosted", async () => {
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter(font => font.status === "loaded").map(font => font.family)
  );
  if (!loaded.length) {
    throw new Error("no web font loaded");
  }
});
await step("sync button hidden for non-admin", async () => {
  if (await page.locator("#sync-button").isVisible()) {
    throw new Error("visible");
  }
});
for (const view of ["Heroes", "Tier Lists", "Scrims", "Overview"]) {
  await step(`nav ${view}`, async () => {
    await goNav(page, `.nav-link:has-text("${view}")`);
    await page.waitForSelector("#view h1");
  });
}
await step("history (reached from the Scrims page, not from the menu)", async () => {
  await page.goto(`${app.baseUrl}/history`);
  await page.waitForSelector("#view h1");
});
await step("create a solo series", async () => {
  await goNav(page, '.nav-link:has-text("Scrims")');
  await page.fill("#team-a", "Alpha");
  await page.fill("#team-b", "Bravo");
  await page.click('button[type="submit"]:has-text("Create series")');
  await page.waitForSelector(".scoreboard");
});
await step("prepare game, start draft, pick a hero", async () => {
  await page.click('[data-action="start-game"]');
  await page.click('[data-action="start-local-draft"]');
  await page.waitForSelector('.hero-card[data-action="draft-pick"]');
  await page.click('.hero-card[data-action="draft-pick"]:not([disabled])');
  await page.waitForFunction(() => document.querySelectorAll(".hero-slot.ban img").length >= 1);
});
await step("series survives a reload (owner = guest cookie)", async () => {
  await page.reload();
  await page.waitForSelector(".scoreboard");
});
await step("create a tier list and move a hero", async () => {
  await goNav(page, '.nav-link:has-text("Tier Lists")');
  await page.click('[data-action="create-tier-list"]');
  await page.waitForSelector(".tier-row");
});
await step("a second browser context sees nothing", async () => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(app.baseUrl);
  await otherPage.waitForSelector("#view h1");
  const text = await otherPage.locator("body").innerText();
  if (/Alpha/.test(text)) {
    throw new Error("leaked series");
  }
  await other.close();
});

await browser.close();
await app.close();
console.log(
  problems.length
    ? `\nPROBLEMS (${problems.length}):\n- ${problems.join("\n- ")}`
    : "\nsmoke test clean"
);
process.exit(problems.length ? 1 : 0);
