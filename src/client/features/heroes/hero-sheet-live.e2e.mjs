// OPTIONAL live check against the real HOK Camp (needs internet): real roster, real hero sheets for
// a few heroes,
// screenshots of the sheet. Not part of `npm run test:e2e`.
//   node src/client/features/heroes/hero-sheet-live.e2e.mjs <output-directory> [heroId ...]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  fetchHeroDetails,
  fetchOfficialRoster
} from "../../../server/features/heroes/sync/hero-sync.js";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav, openHeroTab } from "../../../testing/nav.js";

const output = process.argv[2] || "hero-sheet-live";
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ["533", "128", "581"];
mkdirSync(output, { recursive: true });
const app = await startTestServer({ seedHeroes: false });
const roster = await fetchOfficialRoster();
await app.store.saveHeroes(roster.heroes, roster.sourceUpdated);
await fetchHeroDetails(ids, {
  delayMs: 200,
  onHero: async (id, details, error) => {
    if (details) {
      await app.store.saveHeroDetails(id, details);
    } else {
      console.log("failed", id, error.message);
    }
  }
});

const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
await page.goto(app.baseUrl);
await goNav(page, '.nav-link:has-text("Heroes")');
await page.waitForSelector(".hcard");
for (const id of ids) {
  await page.click(`.hcard[data-hero-id="${id}"]`);
  await openHeroTab(page, "skills");
  await page.waitForSelector(".skill-panel");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(output, `hero-${id}.png`), fullPage: true });
  console.log(
    "saved",
    id,
    "skills:",
    await page.locator(".skill-tab").count(),
    "patches:",
    await page.locator(".patch-entry").count(),
    "gallery:",
    await page.locator(".gallery-item").count()
  );
  await page.click('[data-action="close-hero"]');
  await page.waitForSelector(".hcard");
}
await browser.close();
await app.close();
console.log(problems.length ? `PROBLEMS:\n- ${problems.join("\n- ")}` : "live check clean");
