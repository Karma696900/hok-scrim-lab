// Browser check of Overview and History: server-side filters, pagination, statistics.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";

const app = await startTestServer();
const me = await app.signIn("Analyst");
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const game = (blue, red, winner, duration) => ({
  blueTeam: blue,
  redTeam: red,
  winner,
  durationSeconds: duration,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) }
  }
});
for (let index = 0; index < 11; index += 1) {
  const mode = index % 2 ? "global-ban-pick" : "free-for-all";
  await me.browser.post("/api/series/import", {
    teamA: { name: `Squad ${index}` },
    teamB: { name: `Rival ${index}` },
    bestOf: 1,
    gameMode: mode,
    games: [
      game(
        `Squad ${index}`,
        `Rival ${index}`,
        index % 3 ? `Squad ${index}` : `Rival ${index}`,
        1200 + index * 60
      )
    ]
  });
}
await me.browser.post("/api/series", {
  teamA: "Live A",
  teamB: "Live B",
  bestOf: 3,
  gameMode: "free-for-all"
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
  { name: "hok_session", value: me.browser.jar.get("hok_session"), url: app.baseUrl }
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
const requests = [];
page.on("request", request => {
  if (request.url().includes("/api/")) {
    requests.push(request.url().replace(app.baseUrl, ""));
  }
});

await page.goto(app.baseUrl);
await page.waitForSelector(".nav-link");
await goNav(page, '.nav-link:has-text("Overview")');
await page.waitForSelector(".hello");
await page.waitForSelector(".home-list");
check(
  "Overview counts come from the server (30 heroes, 11 games, 0 tier lists, 1 active)",
  (await page.locator(".stat b, .home-figure b").allInnerTexts()).join("|") === "30|11|0|1"
);
check(
  "Overview lists at most five recent series",
  (await page.locator(".home-list .match").count()) <= 5
);
check(
  "Overview does not download full series (summary endpoint)",
  requests.some(url => url.startsWith("/api/overview"))
);

await page.goto(`${app.baseUrl}/history`);
await page.waitForSelector(".history-filters");
await page.waitForSelector(".series-list + .pager");
check(
  "History is paginated (8 per page)",
  (await page.locator(".series-list .series-row").count()) === 8 &&
    /Page 1 of 2/.test(await page.locator(".series-list + .pager").innerText())
);
await page.click('[data-action="history-page"][data-page="2"]');
await page.waitForFunction(() =>
  /Page 2 of 2/.test(document.querySelector(".series-list + .pager")?.innerText ?? "")
);
check(
  "page 2 holds the remaining series",
  (await page.locator(".series-list .series-row").count()) === 4
);
check(
  "the page request is a server request with page=2",
  requests.some(
    url => url.includes("/api/series?") && url.includes("page=2") && url.includes("view=summary")
  )
);

await page.selectOption('select[name="mode"]', "global-ban-pick");
await page.click('.history-filters button[type="submit"]');
await page.waitForFunction(
  () =>
    document.querySelectorAll(".series-list .series-row").length > 0 &&
    !document.querySelector(".hi-series .pager")
);
const rows = await page.locator(".series-list .series-row").count();
check(
  "filtering by hero rule is done by the server (5 Global Ban & Pick series, one page)",
  rows === 5
);
check(
  "filter request carries the criteria",
  requests.some(url => url.includes("mode=global-ban-pick") && url.includes("/api/series?")) &&
    requests.some(
      url => url.includes("/api/stats/overview?") && url.includes("mode=global-ban-pick")
    )
);
check(
  "statistics follow the filter (5 games)",
  /Games played/i.test(await page.locator(".stats-strip").innerText()) &&
    (await page.locator(".stats-strip .stat-value").nth(1).innerText()) === "5"
);

await page.fill('input[name="q"]', "Rival 3");
await page.click('.history-filters button[type="submit"]');
await page.waitForFunction(
  () => document.querySelectorAll(".series-list .series-row").length === 1
);
check(
  "team-name search narrows the list",
  /Rival 3/.test(await page.locator(".series-list .series-row").first().innerText())
);
await page.fill('input[name="q"]', "nobody here");
await page.click('.history-filters button[type="submit"]');
await page.waitForSelector("text=Nothing matches these filters");
check("an empty result says so instead of looking broken", true);
await page.click('[data-action="history-reset"]');
await page.waitForSelector(".series-list .series-row");

check(
  "hero table shows the sample rule instead of a win rate",
  /Insufficient sample \(\d+\/30\)/i.test(await page.locator(".hero-stats-table").innerText())
);
await page.selectOption('select[name="order"]', "banned");
await page.click('#hero-stats-form button[type="submit"]');
await page.waitForFunction(() => document.querySelector(".hero-stats-row"));
check(
  "hero table is paginated by the server",
  requests.some(
    url =>
      url.includes("/api/stats/heroes?") &&
      url.includes("order=banned") &&
      url.includes("pageSize=10")
  )
);

await page.click('.series-row:has-text("Squad")');
await page.waitForSelector(".scoreboard");
check(
  "a History row opens the series board",
  (await page.locator(".draft-area, .game-nav").count()) > 0
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nhistory e2e clean");
process.exit(problems.length ? 1 : 0);
