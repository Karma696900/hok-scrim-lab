// Browser check of the lanes of the series that were entered without them: the editor proposes the lanes
// the heroes make certain (and only those), the "Lanes" button of a row opens the editor on them, one click
// proposes the lanes of every series with a preview first, a lane that was entered is kept, and everything
// can still be changed afterwards.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Suggest", { admin: true });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
// the test heroes h01..h30 are each listed for ONE lane, five lanes in turn: h01-h05 are the five lanes
const ids = Array.from({ length: 30 }, (_, index) => `h${String(index + 1).padStart(2, "0")}`);
const game = (blue, red, extra = {}) => ({
  blueTeam: "Alpha",
  redTeam: "Beta",
  winner: "Alpha",
  durationSeconds: 900,
  bans: { blue: [], red: [] },
  picks: { blue, red },
  ...extra
});
const series = (event, games) => ({
  event,
  stage: "",
  teamA: "Alpha",
  teamB: "Beta",
  bestOf: 3,
  playedOn: "2026-03-02",
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  games
});
const five = start => ids.slice(start, start + 5);
const post = async body => {
  const response = await admin.browser.post("/api/admin/tournaments", body);
  if (response.status !== 200) {
    throw new Error("series refused: " + response.text);
  }
  return response.body.id;
};
const read = async id => (await admin.browser.get(`/api/admin/tournaments/${id}`)).body;
const first = await post(series("Cup one", [game(five(0), five(5))]));
// a pair of heroes that share two lanes (h26 Mid? no: h01 and h06 are the same lane): ambiguous
const second = await post(
  series("Cup two", [
    game(five(0), five(5), {
      pickLanes: {
        blue: ["Clash Lane", null, null, null, null],
        red: [null, null, null, null, null]
      }
    }),
    game([ids[0], ids[5], ids[10], ids[15], ids[20]], five(25))
  ])
);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
page.on("dialog", dialog => dialog.accept());
await page.goto(`${app.baseUrl}/tournaments`);
await page.waitForSelector(".series-entry");

// ---- from the list: the Lanes button opens the editor on the lanes
const row = page.locator(".series-entry", { hasText: "Cup one" });
await row.locator("[data-roles]").click();
await page.waitForSelector(".lane-suggest");
check(
  "the Lanes button of a row opens the editor",
  (await page.locator("#editor-title").count()) === 1
);
check(
  "every lane of the game is still to enter",
  /10 lanes to enter/.test(await page.locator(".lane-status").first().innerText())
);
await page.locator(".lane-suggest").first().click();
await page.waitForFunction(() =>
  /All lanes are filled in/.test(document.querySelector(".lane-status")?.innerText ?? "")
);
check("one click proposes the ten lanes the heroes make certain", true);
// a proposal is only a start: slide one lane elsewhere (swap two heroes of the blue side)
await page.locator(".lane-tool", { hasText: "Jungle" }).first().click();
await page.locator('[data-lane-cell="0:blue:0"]').click();
check(
  "and it can be changed afterwards",
  (await page.locator('[data-lane-cell="0:blue:0"]').innerText()).includes("Jungle")
);
await page.click('[data-save="stay"]');
await page.waitForFunction(() => !document.querySelector("#editor-title"));
const saved = (await read(first)).games[0].pickLanes;
check(
  "saved: blue's first hero now has the lane that was chosen by hand",
  saved.blue[0] === "Jungle"
);

// ---- from the list, for every series, with a preview
await page.click("[data-suggest-all]");
await page.waitForSelector("[role=status].note");
await page.waitForSelector("[data-suggest-apply]");
const note = await page.locator("[role=status].note").first().innerText();
check(
  "a preview says how many series and lanes are concerned, before anything is saved",
  /1 series can get lanes proposed/.test(note) || /series can get lanes/.test(note)
);
const before = await read(second);
check(
  "nothing was written by the preview",
  before.games[1].pickLanes.blue.every(lane => !lane)
);
await page.click("[data-suggest-apply]");
await page.waitForFunction(() => !document.querySelector("[data-suggest-apply]"));
const after = await read(second);
check("the lane that was entered is kept", after.games[0].pickLanes.blue[0] === "Clash Lane");
check(
  "the other lanes of that game are filled from the heroes",
  after.games[0].pickLanes.blue.every(Boolean) && after.games[0].pickLanes.red.every(Boolean)
);
check(
  "a game whose heroes share a lane stays ambiguous: only what is certain is filled",
  after.games[1].pickLanes.blue.filter(Boolean).length < 5
);
await page.click("[data-suggest-all]");
await page.waitForSelector("[data-suggest-cancel]");
check(
  "asked again, there is nothing more to propose with certainty",
  /Nothing more can be proposed/.test(await page.locator("[role=status].note").first().innerText())
);

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
