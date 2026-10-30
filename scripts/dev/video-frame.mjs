// Checks that hero videos show their FIRST FRAME instead of a dark box. Needs a browser with H.264
// (installed Google Chrome; Playwright's bundled Chromium cannot decode mp4) and internet access to
// Camp.
//   node scripts/dev/video-frame.mjs <output-directory>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  fetchHeroDetails,
  fetchOfficialRoster
} from "../../src/server/features/heroes/sync/hero-sync.js";
import { startTestServer } from "../../src/testing/test-app.js";
import { goNav, openHeroTab } from "../../src/testing/nav.js";

const output = process.argv[2] || "video-frame";
mkdirSync(output, { recursive: true });
const app = await startTestServer({ seedHeroes: false });
const roster = await fetchOfficialRoster();
await app.store.saveHeroes(roster.heroes, roster.sourceUpdated);
await fetchHeroDetails(["533"], {
  delayMs: 100,
  onHero: async (id, details) => {
    if (details) {
      await app.store.saveHeroDetails(id, details);
    }
  }
});

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
  console.log("(using bundled Chromium: mp4 will not decode)");
}
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(app.baseUrl);
await goNav(page, '.nav-link:has-text("Heroes")');
await page.click('.hcard[data-hero-id="533"]');
await page.waitForSelector('[data-action="load-lore-video"]'); // the presentation video is on the overview
await page.click('[data-action="load-lore-video"]');
await page.waitForTimeout(2500);
await page.locator(".lore-video").screenshot({ path: join(output, "lore-video.png") });
await openHeroTab(page, "skills"); // the video of each skill is on the skills tab
await page.waitForSelector(".skill-video");
await page.waitForTimeout(2500);
const report = await page.evaluate(() =>
  [...document.querySelectorAll("video")].map(video => ({
    cls: video.className,
    ready: video.readyState,
    w: video.videoWidth,
    h: video.videoHeight,
    current: video.currentTime,
    src: video.currentSrc.slice(-40)
  }))
);
console.log(JSON.stringify(report));
await page.locator(".skill-video").screenshot({ path: join(output, "skill-video.png") });
await browser.close();
await app.close();
const ok = report.every(item => item.ready >= 2 && item.w > 0);
console.log(ok ? "first frames loaded" : "FIRST FRAME NOT LOADED");
process.exit(ok ? 0 : 1);
