// Browser check of the Heroes page, hero sheet (tournament statistics, pairings, builds) and "Your
// scrims" statistics.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav, openHeroTab } from "../../../testing/nav.js";

const app = await startTestServer();
const admin = await app.signIn("Admin", { admin: true });
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const games = Array.from({ length: 5 }, (_, index) => ({
  blueTeam: "Alpha",
  redTeam: "Bravo",
  winner: index % 2 ? "Bravo" : "Alpha",
  durationSeconds: 1200,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) }
  }
}));
await admin.browser.post("/api/series/import", {
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 9,
  gameMode: "free-for-all",
  games
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);

await page.goto(app.baseUrl);
await goNav(page, '.nav-link:has-text("Heroes")');
await page.waitForSelector(".hcard");
// The cards after the first screenful are added a moment later: their pictures must load too (not
// stay empty)
await page.waitForFunction(() => document.querySelectorAll(".hcard").length >= 30, null, {
  timeout: 8000
});
await page.evaluate(async () => {
  for (const card of document.querySelectorAll(".hcard")) {
    card.scrollIntoView();
    await new Promise(resolve => setTimeout(resolve, 20));
  }
});
await page.waitForTimeout(500);
check(
  "every hero card of the index gets its picture, including the ones added after the first screen",
  (await page.locator(".hcard img[data-src]").count()) === 0 &&
    (await page.locator(".hcard img[src]").count()) >= 30
);
check("admin sees the Sync roster button", await page.locator("#sync-button").isVisible());
check("admin tools are shown on the Heroes page", await page.locator(".admin-tools").isVisible());

await page.click('.hcard[data-hero-id="h01"]');
await page.waitForSelector(".hs-panel"); // the sheet is drawn once its data has arrived
// the sheet opens on its overview; the competitive numbers are one tab further
const wholeSheet = async () => await page.locator("main").textContent();
const everything = await wholeSheet();
await openHeroTab(page, "competitive");
await page.waitForSelector("text=Your scrims");
const sheetText = async () => await page.locator("main").innerText();
let text = await sheetText();
if (process.env.DEBUG_TEXT) {
  console.log(JSON.stringify(text));
}
check(
  "competitive section says nothing has been entered when no tournament exists",
  /Competitive statistics[\s\S]*No tournament has been entered yet/i.test(text)
);
check(
  "Camp details and patch adjustments say Data unavailable (one line each, on every tab)",
  (everything.match(/Data unavailable/gi) || []).length >= 3
);
check("Base attributes are gone", !/Base attributes/i.test(text));
check(
  "scrim win rate is withheld below the threshold",
  /Insufficient sample \(5\/30 games picked\)/i.test(text)
);
check(
  "scrims show their rows as avatars, not names",
  (await page.locator(".pair-list .hero-avatar").count()) > 0 &&
    (await page.locator(".pair-list li").first().innerText()).trim().length < 20
);

// Real tournament games entered through the API appear as charts and avatars, and the period can be
// narrowed.
const entered = (event, playedOn, winner) => ({
  event,
  stage: "",
  teamA: "Alpha",
  teamB: "Bravo",
  bestOf: 3,
  playedOn,
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Bravo",
      winner,
      durationSeconds: null,
      bans: { blue: [], red: [] },
      picks: { blue: ids(1, 5), red: ids(11, 5) }
    }
  ]
});
check(
  "an admin can enter a series",
  (await admin.browser.post("/api/admin/tournaments", entered("Old Cup", "2024-05-01", "Bravo")))
    .status === 200
);
check(
  "and another",
  (await admin.browser.post("/api/admin/tournaments", entered("New Cup", "2026-05-01", "Alpha")))
    .status === 200
);
await page.click('[data-action="close-hero"]');
await page.click('.hcard[data-hero-id="h01"]');
await openHeroTab(page, "competitive");
await page.waitForSelector("#tournament-body .tournament-global .donut");
text = await sheetText();
check(
  "the ring and bars show the win rate over every game",
  (await page.locator("#tournament-body .tournament-global .donut").innerText()).includes("50%") &&
    /2 picks in 2 games/.test(text)
);
check(
  "the rule the games were entered in (Free For All, the default) has a ring of its own; the other two rules have none",
  (await page.locator("#tournament-body .tournament-rule-card").count()) === 3 &&
    (await page.locator("#tournament-body .tournament-rule-card .donut").count()) === 1 &&
    (await page.locator("#tournament-body .tournament-rule-card .donut").innerText()).includes(
      "50%"
    )
);
check(
  "pairings: four rows (wins with / against, then losses with / against) with their record; one win and one loss against the same nine heroes, so the losses only get the heroes the wins left",
  (await page.locator(".tournament-global .pairing-avatars").count()) === 4 &&
    (await page.locator(".tournament-global .pairing-avatars .hero-avatar").count()) === 9 &&
    /^\d+% · \d+\/\d+$/.test(
      await page.locator(".tournament-global .pairing-record").first().innerText()
    )
);
check(
  "and the rule the games were entered in has its own pairings",
  (await page.locator(".tournament-rule-stats .pairing-avatars").count()) === 4 &&
    (await page.locator(".tournament-rule-stats .pairing-avatars .hero-avatar").count()) === 9
);
await page.selectOption("#stats-window", "year");
await page.waitForFunction(() =>
  /1 pick in 1 game\b/.test(document.querySelector("main").innerText)
);
check(
  "narrowing the period to this year keeps only the recent game",
  (await page.locator("#tournament-body .tournament-global .donut").innerText()).includes("100%")
);
check(
  "the choice is remembered",
  (await page.evaluate(() => localStorage.getItem("hok.statsWindow"))).includes("year")
);
await page.click('[data-action="close-hero"]');
await page.click('.hcard[data-hero-id="h01"]');
await openHeroTab(page, "competitive");
await page.waitForSelector("#tournament-body .tournament-global .donut");
check(
  "and still applied when the hero is opened again",
  /1 pick in 1 game\b/.test(await sheetText())
);
await page.evaluate(() => localStorage.removeItem("hok.statsWindow"));

// (Recommended builds, the build lab and the hero data are checked in src/client/features/build-lab/build-lab.e2e.mjs.)
await openHeroTab(page, "builds");
check(
  "a hero with no recommended build says so and links to the build lab",
  /No build has been entered/.test(await sheetText()) &&
    (await page.locator("[data-lab-link]").count()) === 1
);

await page.click('[data-action="close-hero"]');
await page.click('.hcard[data-hero-id="h02"]');
await openHeroTab(page, "competitive");
await page.waitForSelector("text=Your scrims");
check(
  "another hero shows its own (empty) tournament statistics",
  /Competitive statistics[\s\S]*Pairings/i.test(await sheetText())
);

// A non-admin never sees the admin tools.
const guest = await browser.newPage();
await guest.goto(app.baseUrl);
await goNav(guest, '.nav-link:has-text("Heroes")');
await guest.waitForSelector(".hcard");
check(
  "visitors do not see admin tools or the sync button",
  (await guest.locator(".admin-tools").count()) === 0 &&
    !(await guest.locator("#sync-button").isVisible())
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nheroes e2e clean");
process.exit(problems.length ? 1 : 0);
