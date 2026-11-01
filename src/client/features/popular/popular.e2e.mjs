// Browser check of the popularity pages (/popular, /popular/heroes): open to everybody, the drafts of
// each side and the heroes of each lane from the tournament games, the period (three months at least,
// never before the first game), the filters and the rankings.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const id = number => `h${String(number).padStart(2, "0")}`;
const five = start => Array.from({ length: 5 }, (_, index) => id(start + index));
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

const tournament = (playedOn, blue, red, winner, rule = "free-for-all") => ({
  event: `Cup ${playedOn}`,
  stage: "Final",
  teamA: "Alpha",
  teamB: "Beta",
  bestOf: 3,
  playedOn,
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  rule,
  pickOrderKnown: true,
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Beta",
      winner,
      durationSeconds: 900,
      bans: { blue: [id(27)], red: [] },
      picks: { blue, red },
      pickLanes: { blue: LANES, red: LANES }
    }
  ]
});
for (const [day, blue, red, winner, rule] of [
  ["2026-07-10", five(1), five(11), "Alpha", "free-for-all"],
  ["2026-08-20", five(1), five(16), "Beta", "free-for-all"],
  ["2026-09-25", five(1), five(11), "Alpha", "global-ban-pick"],
  ["2026-09-28", five(6), five(21), "Alpha", "free-for-all"]
]) {
  const saved = await admin.browser.post(
    "/api/admin/tournaments",
    tournament(day, blue, red, winner, rule)
  );
  if (saved.status !== 200) {
    throw new Error(`${day}: ${saved.text}`);
  }
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

// ---- the drafts, with no account ----------------------------------------------------------------
/** Opens the page and chooses "since the first game", whatever day the test is run. */
async function openAll(path) {
  await page.goto(`${app.baseUrl}${path}`);
  await page.waitForSelector(".pop-controls");
  await page.click('[data-preset="all"]');
  await page.waitForSelector(".pop-row");
}
await openAll("/popular");
check(
  "the page is open to a visitor, in the menu under the heroes",
  (await page.locator('.nav-link[data-view="popular"]').count()) === 1 &&
    (await page.locator('.nav-link.active[data-view="popular"]').count()) === 1 &&
    /Popular drafts/i.test(await page.locator("main h1").innerText())
);
check(
  "each side has its own list of drafts: five heroes, the games, the win rate",
  (await page.locator(".pop-side--blue .pop-row").count()) >= 1 &&
    (await page.locator(".pop-side--red .pop-row").count()) >= 1 &&
    (await page.locator(".pop-side--blue .pop-row").first().locator(".pop-heroes .pt").count()) ===
      5
);
const mostPlayed = page.locator(".pop-side--blue .pop-row").first();
check(
  "ranked by games played by default: the draft played three times comes first, won twice",
  /67%/.test(await mostPlayed.locator(".pop-rate").innerText()) &&
    /2-1/.test(await mostPlayed.locator(".pop-stats small").innerText()) &&
    /3 games/.test(await mostPlayed.locator(".pop-stats small").innerText())
);
await page.click('[data-rank="rate"]');
const bestBlue = page.locator(".pop-side--blue .pop-row").first();
check(
  "ranked by the score: pulled toward 50 % and recent games weighing more, the recent 1 of 1 edges the older 2 of 3",
  /100%/.test(await bestBlue.locator(".pop-rate").innerText()) &&
    /67%/.test(
      await page.locator(".pop-side--blue .pop-row").nth(1).locator(".pop-rate").innerText()
    )
);
check(
  "a draft played less than three times is marked as a small sample",
  /Small sample/.test(await bestBlue.innerText())
);
check(
  "under each draft: the phase each hero is picked in, the first pick first, and the enemy a counter-pick answers",
  (await bestBlue.locator(".pop-phase").count()) === 5 &&
    /First pick/.test(await bestBlue.locator(".pop-phase").first().innerText()) &&
    (await bestBlue.locator(".pop-phase__vs").count()) >= 1
);
check(
  "under the two sides: the best duos, and a choice of a pair of lanes",
  (await page.locator(".pop-duos .pop-duo").count()) >= 1 &&
    (await page.locator("#pop-duo-lanes option").count()) > 1
);
await page.selectOption("#pop-duo-lanes", "Jungle+Roamer");
check(
  "the duos of one pair of lanes show those lanes",
  /Jungle/.test(await page.locator(".pop-duo__lanes").innerText()) &&
    (await page.locator(".pop-duos .pop-duo").count()) >= 1
);
check(
  "under each draft: the heroes met most when it won and when it lost (three at most)",
  (await bestBlue.locator(".pop-vs__line").count()) === 1 &&
    (await bestBlue.locator(".pop-vs__line").first().locator(".pop-met").count()) === 3
);
await page.click('[data-rank="plays"]');
check(
  "the period is written, with the number of games and the date of the first one",
  /Jul 10, 2026|10 Jul 2026/.test(await page.locator(".pop-note").first().innerText()) &&
    /4 games/.test(await page.locator(".pop-note").first().innerText())
);

// ---- the period -------------------------------------------------------------------------------------
await page.click('[data-preset="custom"]');
await page.waitForSelector("#pop-from");
check(
  "a custom period can start no earlier than the first game that was entered",
  (await page.getAttribute("#pop-from", "min")) === "2026-07-10"
);
await page.fill("#pop-from", "2026-08-01");
await page.fill("#pop-to", "2026-08-31");
await page.click("[data-apply]");
check(
  "a period shorter than three months is refused, with the reason, before anything is asked",
  /at least 3 months/.test(await page.locator(".pop-controls .form-error").innerText())
);
await page.fill("#pop-to", "2026-10-31");
await page.click("[data-apply]");
await page.waitForFunction(() =>
  /3 games/.test(document.querySelector(".pop-note")?.innerText ?? "")
);
check(
  "from 1 August to 31 October: only the games of that period (three), and no error",
  (await page.locator(".pop-controls .form-error").count()) === 0 &&
    (await page.locator(".pop-side--blue .pop-row").count()) === 2
);
await page.fill("#pop-from", "2027-01-01");
await page.fill("#pop-to", "2027-03-31");
await page.click("[data-apply]");
await page.waitForSelector(".empty");
check(
  "a period without any game says so, and how to go on",
  /No tournament game in this period/.test(await page.locator(".empty").innerText())
);
await page.click('[data-preset="all"]');
await page.waitForSelector(".pop-row");
check(
  "'since the first game' starts on the first game that was entered",
  /Jul 10, 2026|10 Jul 2026/.test(await page.locator(".pop-note").first().innerText()) &&
    /4 games/.test(await page.locator(".pop-note").first().innerText())
);

// ---- the filters ------------------------------------------------------------------------------------------
await page.selectOption("#pop-rule", "global-ban-pick");
await page.waitForFunction(() =>
  /1 game/.test(document.querySelector(".pop-note")?.innerText ?? "")
);
check(
  "a hero rule can be chosen: only its games",
  (await page.locator(".pop-side--blue .pop-row").count()) === 1
);
await page.selectOption("#pop-rule", "");
await page.selectOption("#pop-min", "3");
await page.waitForFunction(
  () => document.querySelectorAll(".pop-side--blue .pop-row").length === 1
);
check(
  "a minimum of games leaves out the drafts played less (the red side has none that reaches 3)",
  /3 games/.test(await page.locator(".pop-side--blue .pop-row").first().innerText()) &&
    (await page.locator(".pop-side--red .pop-row").count()) === 0 &&
    (await page.locator(".pop-side--red .pop-none").count()) === 1
);
await page.selectOption("#pop-min", "10");
await page.waitForSelector(".pop-none");
check(
  "…when no draft reaches the minimum, the page asks to lower it",
  /lower the minimum/.test(await page.locator(".pop-none").first().innerText())
);
await page.selectOption("#pop-min", "1");

// ---- the heroes -------------------------------------------------------------------------------------------
await page.click('a[href="/popular/heroes"]');
await page.waitForSelector(".pop-lanes");
check(
  "the heroes tab: the five lanes as the bar of the tier lists, with the number of heroes of each",
  /\/popular\/heroes$/.test(page.url()) &&
    /Popular heroes/i.test(await page.locator("main h1").innerText()) &&
    (await page.locator(".pop-lanes .lane-tab").count()) === 5
);
check(
  "the first lane lists its heroes with their games, wins and what they met",
  (await page.locator(".pop-row").count()) >= 2 &&
    (await page.locator(".pop-row").first().locator(".pop-vs__line").count()) === 1
);
await page.click('.pop-lanes [data-lane="Jungle"]');
check(
  "another lane lists its own heroes (the Jungle pick of each game)",
  /Jungle/i.test(await page.locator(".pop-side h2").innerText()) &&
    (await page.locator(".pop-row .pop-hero b").first().innerText()).length > 0
);
await page.click('[data-scope="blue"]');
const blueOnly = await page.locator(".pop-row").count();
await page.click('[data-scope="red"]');
check(
  "the heroes can be seen for the blue side or the red side only",
  blueOnly >= 1 && (await page.locator(".pop-row").count()) >= 1
);
await page.click('[data-rank="plays"]');
check("and ranked by games played", (await page.locator('[data-rank="plays"].on').count()) === 1);
await page.click('[data-scope="all"]');
check(
  "a hero shows how often it was picked in the lane, banned, and there at all",
  /Pick \d+%/.test(await page.locator(".pop-row .pop-rates").first().innerText()) &&
    /Presence \d+%/.test(await page.locator(".pop-row .pop-rates").first().innerText())
);
await page.click('[data-rank="presence"]');
check(
  "ranked by presence (picked or banned): a hero banned in every game leads, at 100 %",
  /Presence 100%/.test(await page.locator(".pop-row .pop-rates").first().innerText())
);

// ---- on a phone ----------------------------------------------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await openAll("/popular");
check(
  "on a phone nothing scrolls sideways and the two sides are one under the other",
  (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) &&
    (await page.evaluate(
      () =>
        document.querySelector(".pop-side--red").getBoundingClientRect().top >=
        document.querySelector(".pop-side--blue").getBoundingClientRect().bottom - 1
    ))
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\npopular e2e clean");
process.exit(problems.length ? 1 : 0);
