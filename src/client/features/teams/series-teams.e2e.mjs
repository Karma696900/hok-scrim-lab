// Browser check of the series shared with a team: the creator who leads a team puts a series on it from the page of
// the series, the members of the team then open it and read it (read only), the others see nothing, taking it off ends
// the access. A guest, who has no team, does not see the block at all.
import { chromium } from "playwright";
import { CREATE_BODY, startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const captain = await app.signIn("Captain");
const mid = await app.signIn("Mid");
const outsider = await app.signIn("Outsider");

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

// a team the captain owns, with Mid as a player
const created = await captain.browser.post("/api/teams", {
  name: "Crimson Fox",
  tag: "CFOX",
  level: "amateur",
  region: "EU",
  timezone: "UTC+0"
});
const teamId = created.body.id;
await app.store.pool.execute(
  "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, 'player', '', ?)",
  [teamId, mid.user.id, Date.now()]
);
const series = (await captain.browser.post("/api/series", CREATE_BODY)).body;
const seriesPath = `/scrims/${series.id}`;
check(
  "Mid does not see the series before it is shared",
  (await mid.browser.get(`/api/series/${series.id}`)).status === 404
);

const browser = await chromium.launch();
const open = async person => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: "hok_session", value: person.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};

// ---- the captain shares the series from its page ----------------------------------------------------------
const page = await open(captain);
await page.goto(`${app.baseUrl}${seriesPath}`);
await page.waitForSelector(".scoreboard");
check(
  "the creator who is signed in has the button that shares with a team, next to the other ones",
  (await page.locator('.sr-band [data-action="toggle-teams"]').count()) === 1 &&
    (await page.locator('.sr-band [data-action="open-export"]').count()) === 1
);
check(
  "the block is closed until the button is pressed",
  (await page.locator("#series-teams").count()) === 0
);
await page.click('[data-action="toggle-teams"]');
await page.waitForSelector("#share-team-select");
check(
  "it says what sharing does and that the series is on no team yet",
  /read it, but not change it/i.test(await page.locator("#series-teams").innerText()) &&
    /Not shared with any team yet/i.test(await page.locator("#series-teams").innerText())
);
check(
  "the teams the creator leads are offered",
  (await page.locator("#share-team-select option").allInnerTexts()).includes("Crimson Fox")
);
await page.click('[data-action="share-team-add"]');
check(
  "adding with no team chosen does nothing",
  (await page.locator(".sr-teams__chip").count()) === 0
);
await page.selectOption("#share-team-select", teamId);
await page.click('[data-action="share-team-add"]');
await page.waitForSelector(".sr-teams__chip");
check(
  "the team is listed once it is added, with its remove button",
  /Crimson Fox/.test(await page.locator(".sr-teams__chip").innerText()) &&
    (await page.locator('.sr-teams__chip [data-action="share-team-remove"]').count()) === 1
);
check(
  "a team that already has the series is no longer offered",
  (await page.locator("#share-team-select").count()) === 0 ||
    !(await page.locator("#share-team-select option").allInnerTexts()).includes("Crimson Fox")
);
check(
  "the button counts the teams",
  (await page.locator('[data-action="toggle-teams"] .count').innerText()) === "1"
);

// ---- the members read it, only read; the others see nothing ---------------------------------------------------
const read = await mid.browser.get(`/api/series/${series.id}`);
check(
  "a member of the team reads the series through the API, as a viewer",
  read.status === 200 && read.body.viewer.role === "viewer" && read.body.viewer.canShare === false
);
check(
  "somebody who is not on the team still sees nothing",
  (await outsider.browser.get(`/api/series/${series.id}`)).status === 404
);
const memberPage = await open(mid);
await memberPage.goto(`${app.baseUrl}${seriesPath}`);
await memberPage.waitForSelector(".scoreboard");
check(
  "the member opens the series on its page, without the buttons that change or share it",
  (await memberPage.locator('[data-action="toggle-teams"]').count()) === 0 &&
    (await memberPage.locator('[data-action="delete-series"]').count()) === 0 &&
    (await memberPage.locator('[data-action="share"]').count()) === 0
);
check(
  "and without the means of starting its games",
  (await memberPage.locator('[data-action="start-game"]:not([disabled])').count()) === 0
);

// ---- taking it off ends the access -------------------------------------------------------------------------------
await page.click('[data-action="share-team-remove"]');
await page.waitForFunction(() => document.querySelectorAll(".sr-teams__chip").length === 0);
check(
  "the creator takes the series off the team: it is listed again among the teams to add",
  (await page.locator("#share-team-select option").allInnerTexts()).includes("Crimson Fox")
);
check(
  "the member can no longer open it",
  (await mid.browser.get(`/api/series/${series.id}`)).status === 404
);
await page.click('[data-action="toggle-teams"]');
await page.waitForFunction(() => !document.querySelector("#series-teams"));
check("the button closes the block", true);

// ---- a guest has no team: no block ----------------------------------------------------------------------------------
const guest = app.browser();
const guestSeries = (await guest.post("/api/series", CREATE_BODY)).body;
const guestPage = await open({ browser: guest });
await guestPage.goto(`${app.baseUrl}/scrims/${guestSeries.id}`);
await guestPage.waitForSelector(".scoreboard");
check(
  "a guest does not see the button that shares with a team",
  (await guestPage.locator('[data-action="toggle-teams"]').count()) === 0 &&
    (await guestPage.locator('[data-action="share"]').count()) > 0
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nseries teams e2e clean"
);
process.exit(problems.length ? 1 : 0);
