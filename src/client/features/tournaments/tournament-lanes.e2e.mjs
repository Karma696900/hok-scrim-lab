// Browser check of the lanes of the picks in the tournament editor: the five heroes of a side are
// chosen first, then lane logos are slid onto them (or a logo is clicked and then a hero), moved,
// swapped, cleared, saved and read back.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("LaneEditor", { admin: true });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
  if (
    ["error", "warning"].includes(message.type()) &&
    !/status of 40[0-9]|Failed to load resource/.test(message.text())
  ) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));

const laneOf = async cell => {
  const image = page.locator(`[data-lane-cell="${cell}"] img`);
  return (await image.count()) ? await image.getAttribute("alt") : null;
};

await page.goto(`${app.baseUrl}/tournaments`);
await page.waitForSelector("[data-new]");
await page.click("[data-new]");
await page.fill('[name="event"]', "Lane Cup");
await page.fill('[name="sourceUrl"]', "https://example.test/vod");
await page.fill('[name="stage"]', "Final");
await page.fill('[name="teamA"]', "Alpha");
await page.fill('[name="teamB"]', "Bravo");
await page.fill('[name="playedOn"]', "2026-03-02");

// The five heroes of a side come first
check(
  "before any hero is chosen, the lane cells are disabled and the palette is there",
  (await page.locator(".lane-cell:not(:disabled)").count()) === 0 &&
    (await page.locator(".lane-palette").count()) === 1
);
await page.click('[data-slot="0:picks:blue:0"]');
for (let index = 1; index <= 10; index += 1) {
  await page.fill("#picker-search", `h${String(index).padStart(2, "0")}`);
  await page.press("#picker-search", "Enter");
}
check(
  "ten heroes are chosen",
  (await page.locator(".game-card >> nth=0 >> .draft-slot.filled").count()) === 10
);
check(
  "each pick has a lane cell under it",
  (await page.locator(".pick-cell").count()) === 10 &&
    (await page.locator(".lane-cell:not(:disabled)").count()) === 10
);
check(
  "the palette has the five lanes and 'no lane'",
  (await page.locator("[data-lane-tool]").count()) === 6
);
check(
  "the palette tells how to use it",
  /slide a lane|click a lane/i.test(await page.locator(".lane-hint").innerText())
);

// Slide a logo onto a hero
await page.dragAndDrop('[data-lane-tool="Jungle"]', '[data-cell="0:blue:0"]');
check(
  "sliding the Jungle logo onto the first blue hero gives it that lane",
  (await laneOf("0:blue:0")) === "Jungle"
);
// A lane is played once per side: it slides from one hero to the other
await page.dragAndDrop('[data-lane-tool="Jungle"]', '[data-cell="0:blue:1"]');
check(
  "sliding it onto another hero of the same side moves it",
  (await laneOf("0:blue:0")) === null && (await laneOf("0:blue:1")) === "Jungle"
);
// The other side may use the same lane
await page.dragAndDrop('[data-lane-tool="Jungle"]', '[data-cell="0:red:0"]');
check(
  "the other side can use the same lane",
  (await laneOf("0:red:0")) === "Jungle" && (await laneOf("0:blue:1")) === "Jungle"
);

// Move a hero's lane to another hero of the same side: they swap
await page.dragAndDrop('[data-lane-tool="Mid Lane"]', '[data-cell="0:blue:2"]');
await page.dragAndDrop('[data-lane-cell="0:blue:1"]', '[data-cell="0:blue:2"]');
check(
  "sliding a lane from a hero onto another swaps their lanes",
  (await laneOf("0:blue:1")) === "Mid Lane" && (await laneOf("0:blue:2")) === "Jungle"
);

// Click a logo, then a hero (no drag needed)
await page.click('[data-lane-tool="Roamer"]');
check(
  "a clicked logo is shown as picked up",
  (await page.locator('[data-lane-tool="Roamer"][aria-pressed="true"]').count()) === 1
);
await page.click('[data-slot="0:picks:blue:3"]');
check(
  "clicking then a hero gives it the lane, and puts the logo down",
  (await laneOf("0:blue:3")) === "Roamer" &&
    (await page.locator('[data-lane-tool][aria-pressed="true"]').count()) === 0
);
await page.click('[data-lane-tool="Farm Lane"]');
await page.keyboard.press("Escape");
check(
  "Escape puts a picked-up logo back",
  (await page.locator('[data-lane-tool][aria-pressed="true"]').count()) === 0
);
await page.click('[data-lane-tool="Farm Lane"]');
await page.click('[data-lane-cell="0:blue:4"]');
check("the lane cell under a hero takes it too", (await laneOf("0:blue:4")) === "Farm Lane");
await page.click('[data-lane-tool="Clash Lane"]');
await page.click('[data-lane-cell="0:blue:0"]');
check(
  "all five lanes of the blue side are filled",
  (await Promise.all([0, 1, 2, 3, 4].map(index => laneOf(`0:blue:${index}`)))).sort().join() ===
    ["Clash Lane", "Farm Lane", "Jungle", "Mid Lane", "Roamer"].sort().join()
);

// Clear one
await page.dragAndDrop('[data-lane-tool=""]', '[data-cell="0:red:0"]');
check("the 'no lane' tool clears a lane", (await laneOf("0:red:0")) === null);
// Give two red heroes a lane, leave the others empty (a lane is optional)
await page.dragAndDrop('[data-lane-tool="Roamer"]', '[data-cell="0:red:1"]');
await page.dragAndDrop('[data-lane-tool="Mid Lane"]', '[data-cell="0:red:2"]');

// Swapping the sides swaps the lanes
await page.click('[data-swap="0"]');
check(
  "swapping the sides carries the lanes with the heroes",
  (await laneOf("0:red:3")) === "Roamer" &&
    (await laneOf("0:red:1")) === "Mid Lane" &&
    (await laneOf("0:blue:1")) === "Roamer"
);
await page.click('[data-swap="0"]');

// Replacing a hero keeps its lane; emptying the slot clears it
await page.click('[data-slot="0:picks:blue:3"]'); // activates (a lane is not in hand)
await page.click('[data-slot="0:picks:blue:3"]'); // second click empties it
check(
  "emptying a slot clears its lane and disables the cell",
  (await laneOf("0:blue:3")) === null &&
    (await page.locator('[data-lane-cell="0:blue:3"]:disabled').count()) === 1
);
await page.fill("#picker-search", "h11");
await page.press("#picker-search", "Enter");
await page.keyboard.press("Escape");
await page.click('[data-lane-tool="Roamer"]');
await page.click('[data-lane-cell="0:blue:3"]');
check("the new hero takes the lane again", (await laneOf("0:blue:3")) === "Roamer");

// Save and read back
await page.click('[data-winner="0:A"]');
await page.click('[data-save="stay"]');
await page.waitForSelector(".series-entry");
const saved = (await admin.browser.get("/api/admin/tournaments")).body.items[0];
const stored = (await admin.browser.get(`/api/admin/tournaments/${saved.id}`)).body.games[0];
check(
  "the server holds the lanes of the blue side in the order of the picks",
  stored.pickLanes.blue.join() ===
    ["Clash Lane", "Mid Lane", "Jungle", "Roamer", "Farm Lane"].join()
);
check("and every blue lane once", new Set(stored.pickLanes.blue).size === 5);
check(
  "a lane left out is stored as none",
  stored.pickLanes.red.filter(lane => lane === null).length === 3 &&
    stored.pickLanes.red.filter(Boolean).length === 2
);

await page.click(`[data-edit="${saved.id}"]`);
await page.waitForSelector(".pick-cell");
check(
  "opening the series again shows the lanes under the heroes",
  (await Promise.all([0, 1, 2, 3, 4].map(index => laneOf(`0:blue:${index}`)))).filter(Boolean)
    .length === 5 && (await laneOf("0:red:1")) !== null
);

// A game entered without any lane is still accepted
await page.click("[data-cancel]");
await page.click("[data-new]");
await page.fill('[name="event"]', "No lanes");
await page.fill('[name="sourceUrl"]', "https://example.test/vod");
await page.fill('[name="teamA"]', "Alpha");
await page.fill('[name="teamB"]', "Bravo");
await page.fill('[name="playedOn"]', "2026-03-03");
await page.click('[data-slot="0:picks:blue:0"]');
for (let index = 1; index <= 10; index += 1) {
  await page.fill("#picker-search", `h${String(index).padStart(2, "0")}`);
  await page.press("#picker-search", "Enter");
}
await page.click('[data-winner="0:B"]');
await page.click('[data-save="stay"]');
await page.waitForFunction(() => document.querySelectorAll(".series-entry").length === 2);
check(
  "a series without any lane is still saved",
  (await admin.browser.get("/api/admin/tournaments")).body.items.length === 2
);

// Phone: the palette and the cells stay usable
await page.setViewportSize({ width: 390, height: 900 });
await page.click("[data-new]");
check(
  "on a phone there is no horizontal scroll in the editor",
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\ntournament lanes e2e passed");
