// Opening a series whose clock ran out while nobody was looking. The server only resolves an expired
// deadline when somebody asks (the clock of the open page does, once the board is up): the page used to
// draw the stale state first (the pool of heroes, the picks as they were), ask, and draw again a second
// later, so the whole board moved (a layout shift of 0.2 on a phone, the one Lighthouse flagged). It now
// asks BEFORE the first drawing, and opens on the real state.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const owner = await app.signIn("Late");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const created = await owner.browser.post("/api/series", {
  teamA: "Alpha",
  teamB: "Orion",
  bestOf: 3,
  gameMode: "global-ban-pick"
});
const base = `/api/series/${created.body.id}`;
await owner.browser.post(`${base}/game`, { blueTeam: "Alpha" });
await owner.browser.post(`${base}/game/ready`);
for (let step = 0; step < 19; step += 1) {
  const action = await owner.browser.post(`${base}/game/action`, {
    heroId: `h${String(step + 1).padStart(2, "0")}`
  });
  check(`action ${step + 1} played`, action.status === 200);
}
// the clock ran out an hour ago and nobody asked the server to move on
await app.rewriteSeries(created.body.id, stored => {
  stored.currentGame.draft.deadline = Date.now() - 60 * 60 * 1000;
});
const before = (await owner.browser.get(base)).body.currentGame.draft;
check(
  "the stored draft is still in its draft phase with a deadline in the past",
  before.phase === "draft" && before.deadline < Date.now()
);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2,
  isMobile: true
});
await context.addCookies([
  { name: "hok_session", value: owner.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
let advanceAskedAt = null;
page.on("request", request => {
  if (/\/game\/advance$/.test(request.url()) && advanceAskedAt === null) {
    advanceAskedAt = Date.now();
  }
});
await page.addInitScript(() => {
  window.__shift = 0;
  window.__areaClasses = [];
  window.__boardAt = null;
  // the instant the board is first put on the page
  addEventListener("DOMContentLoaded", () => {
    new MutationObserver((_records, observer) => {
      if (document.querySelector(".series-board")) {
        window.__boardAt = Date.now();
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        window.__shift += entry.value;
      }
    }
  }).observe({ type: "layout-shift", buffered: true });
  // every class the draft area wears while the page loads (the pool of heroes is `with-pool`)
  addEventListener("DOMContentLoaded", () => {
    const watch = () => {
      const area = document.querySelector("section.draft-area");
      if (!area) {
        return false;
      }
      window.__areaClasses.push(area.className);
      new MutationObserver(() => window.__areaClasses.push(area.className)).observe(area, {
        attributes: true,
        attributeFilter: ["class"]
      });
      return true;
    };
    if (!watch()) {
      new MutationObserver((_records, observer) => watch() && observer.disconnect()).observe(
        document.body,
        { childList: true, subtree: true }
      );
    }
  });
});
await page.goto(`${app.baseUrl}/scrims/${created.body.id}`, { waitUntil: "networkidle" });
await page.waitForSelector("section.draft-area");
await page.waitForTimeout(2500);

const shift = await page.evaluate(() => window.__shift);
const classes = await page.evaluate(() => window.__areaClasses);
console.log(
  `      layout shift ${shift.toFixed(4)}; the draft area wore: ${[...new Set(classes)].join(" | ")}`
);
check("the page does not move once it is drawn (layout shift under 0.05)", shift < 0.05);
const boardAt = await page.evaluate(() => window.__boardAt);
check(
  "the server is asked to move the draft on BEFORE the board is first drawn",
  advanceAskedAt !== null && boardAt !== null && advanceAskedAt <= boardAt
);
check(
  "the draft area never shows the pool of a draft that was over, then drops it",
  !(classes[0]?.includes("with-pool") && classes.at(-1) && !classes.at(-1).includes("with-pool"))
);
const after = (await owner.browser.get(base)).body.currentGame.draft;
check(
  "the server was asked to move the draft on (its deadline is no longer in the past)",
  !after.deadline || after.deadline > Date.now() || after.phase !== "draft"
);

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
