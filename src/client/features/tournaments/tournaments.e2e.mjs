// Browser check of the Tournaments page: administrators only, a whole series typed with the
// keyboard, edit / rename / delete.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Admin", { admin: true });
const plain = await app.signIn("Plain");

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async user => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type()) && !/status of 400/.test(message.text())) {
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
  return page;
};

// A visitor who is not an administrator is told so, and has no menu entry.
const visitor = await open(plain);
await visitor.goto(`${app.baseUrl}/tournaments`);
await visitor.waitForSelector("text=This page is for administrators.");
check("a plain account is told the page is for administrators", true);
check(
  "and has no Tournaments link",
  (await visitor.locator("#nav-tournaments:not([hidden])").count()) === 0
);

const page = await open(admin);
await page.goto(`${app.baseUrl}/tournaments`);
await page.waitForSelector("[data-new]");
check(
  "the administrator has the Tournaments link",
  (await page.locator("#nav-tournaments:not([hidden])").count()) === 1
);

await page.click("[data-new]");
await page.fill('[name="event"]', "KPL Autumn");
await page.fill('[name="sourceUrl"]', "https://example.test/vod");
await page.fill('[name="stage"]', "Final");
await page.fill('[name="teamA"]', "Alpha");
await page.fill('[name="teamB"]', "Bravo");
await page.fill('[name="playedOn"]', "2026-03-02");

// Game 1: ten picks typed one after the other; each Enter fills the next free slot.
const fill = async (game, from) => {
  await page.click(`[data-slot="${game}:picks:blue:0"]`);
  for (let index = 0; index < 10; index += 1) {
    await page.fill("#picker-search", `h${String(from + index).padStart(2, "0")}`);
    await page.press("#picker-search", "Enter");
  }
};
await fill(0, 1);
check(
  "ten picks fill ten slots and close the picker",
  (await page.locator(".game-card >> nth=0 >> .draft-slot.filled").count()) === 10 &&
    (await page.locator("#picker-search").count()) === 0
);
// Bans: any number from 0 to 5 per side, and no empty box beyond the one that adds the next.
const banBoxes = side => page.locator(`[data-slot^="0:bans:${side}:"]`).count();
await page.click(".game-card >> nth=0 >> .ban-details summary");
check(
  "with no ban entered there is a single box to add one per side",
  (await banBoxes("blue")) === 1 && (await banBoxes("red")) === 1
);
await page.click('[data-slot="0:bans:blue:0"]');
for (const id of ["h21", "h22"]) {
  await page.fill("#picker-search", id);
  await page.press("#picker-search", "Enter");
}
check(
  "two blue bans show two heroes and one box to add",
  (await banBoxes("blue")) === 3 &&
    (await page.locator('[data-slot^="0:bans:blue:"].filled').count()) === 2
);
await page.keyboard.press("Escape");
await page.click('[data-slot="0:bans:red:0"]');
for (const id of ["h23", "h24", "h25"]) {
  await page.fill("#picker-search", id);
  await page.press("#picker-search", "Enter");
}
await page.keyboard.press("Escape");
check(
  "three red bans show three heroes and one box to add",
  (await banBoxes("red")) === 4 &&
    (await page.locator('[data-slot^="0:bans:red:"].filled').count()) === 3
);
await page.click('[data-slot="0:bans:red:0"]');
await page.click('[data-slot="0:bans:red:0"]');
check(
  "removing the first red ban leaves no hole",
  (await banBoxes("red")) === 3 &&
    (await page.locator('[data-slot^="0:bans:red:"].filled').count()) === 2 &&
    (await page.locator('[data-slot="0:bans:red:0"].filled').count()) === 1
);
await page.keyboard.press("Escape");
await page.click('[data-winner="0:A"]');
await page.fill('[data-duration="0"]', "24:37");

// Game 2: sides swap by themselves; Bravo wins.
await page.click("[data-add-game]");
await page.waitForSelector("#picker-search");
for (let index = 0; index < 10; index += 1) {
  await page.fill("#picker-search", `h${String(11 + index).padStart(2, "0")}`);
  await page.press("#picker-search", "Enter");
}
check(
  "the second game starts with the other team on blue",
  /Blue: Bravo/.test(await page.locator(".game-card >> nth=1 >> [data-swap]").textContent())
);
await page.click('[data-winner="1:B"]');
check(
  "the live score follows the winners",
  /Alpha 1 – 1 Bravo/i.test(await page.locator("#editor-title + .pill").innerText())
);
await page.click("[data-add-game]");
await page.click('[data-winner="2:A"]');
check(
  "a game without ten heroes is refused by the server, with its message",
  await (async () => {
    await page.keyboard.press("Control+Enter");
    await page.waitForFunction(
      () => document.querySelector("#series-form .form-error")?.textContent.trim().length > 0
    );
    return /exactly 5|must/i.test(await page.locator("#series-form .form-error").innerText());
  })()
);
await page.click('[data-remove-game="2"]');
await page.keyboard.press("Control+Enter");
await page.waitForSelector(".series-entry");
check(
  "Ctrl+Enter saves and the series is listed with its score",
  /KPL Autumn/.test(await page.locator(".series-entry").innerText()) &&
    /1 – 1/.test(await page.locator(".series-entry").innerText())
);

const saved = (await admin.browser.get("/api/admin/tournaments")).body.items[0];
const full = (await admin.browser.get(`/api/admin/tournaments/${saved.id}`)).body;
check(
  "the stored series has both games, the sides and the duration",
  full.games.length === 2 &&
    full.games[0].blueTeam === "Alpha" &&
    full.games[1].blueTeam === "Bravo" &&
    full.games[0].durationSeconds === 1477 &&
    full.games[0].picks.blue.join() === "h01,h02,h03,h04,h05" &&
    full.games[0].bans.blue.join() === "h21,h22" &&
    full.games[0].bans.red.join() === "h24,h25" &&
    full.games[1].bans.blue.length === 0 &&
    full.games[1].picks.red.join() === "h16,h17,h18,h19,h20"
);

// How sure a series is: a badge in the table, a filter above it, the points to check in the editor.
check(
  "a series entered by hand is verified, with a badge and a filter that counts it",
  /Verified/.test(await page.locator(".series-entry .tn-badge").innerText()) &&
    /Verified · 1/.test(await page.locator(".tn-verify").innerText())
);
const listed = await admin.browser.post("/api/admin/tournaments", {
  event: "Listed Cup",
  stage: "",
  teamA: "Gamma",
  teamB: "Delta",
  bestOf: 3,
  playedOn: "2026-03-03",
  sourceUrl: "https://liquipedia.net/honorofkings/Listed_Cup",
  verification: "listed",
  toCheck: ["the order of the picks is unknown"],
  games: [
    {
      blueTeam: "Gamma",
      redTeam: "Delta",
      winner: "Gamma",
      picks: {
        blue: ["h06", "h07", "h08", "h09", "h10"],
        red: ["h26", "h27", "h28", "h29", "h30"]
      },
      bans: { blue: [], red: [] }
    }
  ]
});
check("a list of heroes is accepted as such", listed.status === 200);
await page.click('[data-verify="listed"]');
await page.waitForFunction(() =>
  /Listed Cup/.test(document.querySelector(".series-entry")?.innerText ?? "")
);
check(
  "the filter keeps the series of that reliability, whose badge and points to check are shown",
  /Listed Cup/.test(await page.locator(".series-entry").innerText()) &&
    /Heroes list/.test(await page.locator(".series-entry .tn-badge").innerText()) &&
    /1 point to check/.test(await page.locator(".series-entry .tn-count").innerText())
);
await page.click('[data-verify=""]');
await page.waitForFunction(() => document.querySelectorAll(".series-entry").length === 2);
check("showing all again lists every series", true);
await page.click(`[data-edit="${listed.body.id}"]`);
await page.waitForSelector("#series-form");
check(
  "the editor shows the reliability and what is still to check",
  (await page.locator('[name="verification"]').inputValue()) === "listed" &&
    /the order of the picks is unknown/.test(await page.locator(".tn-tocheck").innerText())
);
await page.click("[data-cancel]");
await page.waitForSelector(".series-entry");
await admin.browser.delete(`/api/admin/tournaments/${listed.body.id}`);
await page.reload();
await page.waitForSelector(".series-entry");

// Rename a team and the event; every game follows.
await page.click(`[data-edit="${saved.id}"]`);
await page.waitForSelector("#series-form");
await page.fill('[name="event"]', "KPL Autumn Finals");
await page.fill('[name="teamA"]', "Alpha Prime");
await page.click('[data-save="stay"]');
await page.waitForSelector("#series-form", { state: "detached" });
const renamed = (await admin.browser.get(`/api/admin/tournaments/${saved.id}`)).body;
check(
  "renaming a team renames it in every game",
  renamed.teamA === "Alpha Prime" &&
    renamed.games.every(game =>
      [game.blueTeam, game.redTeam, game.winner].every(name => name !== "Alpha")
    ) &&
    renamed.games[0].winner === "Alpha Prime"
);
check("the event was renamed", renamed.event === "KPL Autumn Finals");

// The hero sheet sees it at once.
const sheet = (await app.browser().get("/api/heroes/h01")).body.tournament;
check("the hero statistics follow the entered series", sheet.picks === 1 && sheet.wins === 1);

// Delete.
page.once("dialog", dialog => dialog.accept());
await page.click(`[data-delete="${saved.id}"]`);
await page.waitForSelector("text=No series entered yet.");
check(
  "a series can be deleted",
  (await app.browser().get("/api/heroes/h01")).body.tournament.totalGames === 0
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ntournaments e2e clean"
);
process.exit(problems.length ? 1 : 0);
