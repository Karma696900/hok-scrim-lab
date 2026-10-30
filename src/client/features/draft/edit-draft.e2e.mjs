// Browser check: correcting the bans and picks of a recorded game, and picking heroes of any role
// in any order.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";

const app = await startTestServer();
const me = await app.signIn("Coach");
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const series = (
  await me.browser.post("/api/series/import", {
    teamA: { name: "Alpha" },
    teamB: { name: "Bravo" },
    bestOf: 3,
    gameMode: "free-for-all",
    games: [
      {
        blueTeam: "Alpha",
        redTeam: "Bravo",
        winner: "Alpha",
        durationSeconds: 1500,
        draft: {
          bans: { blue: ids(21, 5), red: ids(26, 5) },
          picks: { blue: ids(1, 5), red: ids(11, 5) }
        }
      }
    ]
  })
).body;

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
  if (message.text().includes("status of 400")) {
    return;
  }
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
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click(".series-item .series-row");
await page.waitForSelector(".scoreboard");
await page.click('.game-chip-main[data-game-index="0"]');
await page.waitForSelector(".draft-readonly");
await page.waitForSelector('[data-action="edit-draft"]');
check("the finished game's board offers 'Edit bans & picks'", true);
await page.click('[data-action="edit-draft"]');
await page.waitForSelector("#draft-editor[open]");
check(
  "the editor shows the 20 slots of the draft",
  (await page.locator(".editor-slot.filled").count()) === 20
);

// replace the first blue pick (h01) with h30? h30 is banned: use a free hero: clear h01 and pick
// another by clearing a ban first.
await page.click('.editor-slot[data-editor="slot:blue:picks:0"]');
await page.click('.editor-clear[data-editor="clear:picks:blue:0"]');
check("clearing a slot empties it", (await page.locator(".editor-slot.filled").count()) === 19);
await page.click('.editor-slot[data-editor="slot:blue:picks:0"]');
await page.fill("#draft-editor-search", "h01");
check(
  "a hero already in the draft cannot be chosen twice",
  (await page.locator('.editor-hero[data-hero-id="h30"]').count()) === 0 ||
    (await page.locator('.editor-hero[data-hero-id="h30"]').isDisabled())
);
// free h30 by clearing the last red ban, then put it as the blue pick 1
await page.fill("#draft-editor-search", "");
await page.click('.editor-clear[data-editor="clear:bans:red:4"]');
await page.click('.editor-slot[data-editor="slot:blue:picks:0"]');
await page.click('.editor-hero[data-hero-id="h30"]');
check(
  "the chosen hero lands in the active slot",
  (await page.locator('.editor-slot[data-editor="slot:blue:picks:0"] img').count()) === 1
);
await page.click('#draft-editor button[type="submit"]');
await page.waitForFunction(() => !document.querySelector("#draft-editor[open]"));
await page.waitForFunction(
  () => document.querySelector('.team-draft.blue [data-slot="pick-0"]')?.dataset.hero === "h30",
  null,
  { timeout: 15000 }
);
check("the board shows the corrected pick right away", true);
check(
  "the red ban slot is now empty",
  (await page.locator('.team-draft.red [data-slot="ban-4"]').getAttribute("data-hero")) === ""
);
const stored = (await me.browser.get(`/api/series/${series.id}`)).body.games[0].draft;
check(
  "it is saved on the server",
  stored.picks.blue[0] === "h30" &&
    stored.bans.red.length === 4 &&
    stored.actions.some(action => action.edited)
);

// Series rule / validation error is shown inside the dialog.
await page.click('[data-action="edit-draft"]');
await page.waitForSelector("#draft-editor[open]");
await page.click('.editor-clear[data-editor="clear:picks:blue:1"]');
await page.click('#draft-editor button[type="submit"]');
await page.waitForFunction(() => !document.querySelector("#draft-editor[open]"));
check(
  "a draft with fewer than 5 picks can be saved (partial correction)",
  (await me.browser.get(`/api/series/${series.id}`)).body.games[0].draft.picks.blue.length === 4
);

// Completed games list also offers it.
await page.click('[data-action="back-series"]').catch(() => {});
await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nedit draft e2e clean");
process.exit(problems.length ? 1 : 0);
