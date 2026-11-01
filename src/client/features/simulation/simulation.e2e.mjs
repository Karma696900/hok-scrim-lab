// Browser check of the Game Simulation (/simulation). The games run on the bots server (private repository
// hok-bots): here a stand-in plays a short scripted game over the same WebSocket messages (src/testing/
// fake-bots-server.js). Checked: the set-up screen a visitor sees and that a game needs an account, a game signed
// in (the ticket, the board, a decision answered, the pause that hides the map, the grade alone at the end, kept by
// the site from the bots server), a phone held upright asked to turn, and the picture of the map as the board.
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import sharp from "../../../server/platform/images/sharp-safe.js";
import { startFakeBots } from "../../../testing/fake-bots-server.js";
import { startTestServer } from "../../../testing/test-app.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const ids = ["105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116"];
const secret = randomBytes(32).toString("hex");
const bots = await startFakeBots({ secret, roster: ids });
// the site reads the link with the bots server from its environment when it starts
process.env.BOTS_URL = bots.url;
process.env.BOTS_SHARED_SECRET = secret;
const app = await startTestServer();
bots.setSite(app.baseUrl);

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const settles = promise =>
  promise.then(
    () => true,
    () => false
  );

await app.store.saveHeroes(
  ids.map((id, i) => ({
    id,
    name: `Hero ${id}`,
    image: "",
    roles: ["Fighter"],
    lanes: [LANES[i % 5]],
    sourceIds: [id]
  })),
  "20261031"
);
const ana = await app.signIn("SimPlayer");

const browser = await chromium.launch();
const open = async (who, viewport = { width: 1280, height: 800 }, { quiet = [] } = {}) => {
  const context = await browser.newContext({ viewport });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    const text = message.text();
    if (message.type() === "error" && !quiet.some(expected => text.includes(expected))) {
      problems.push(`console.error: ${text}`);
    }
  });
  return page;
};

// ---- the set-up screen, as a visitor ---------------------------------------------------------------------------
// the refused ticket shows in the console as a failed request: expected here
const visitor = await open(null, undefined, { quiet: ["401"] });
await visitor.goto(`${app.baseUrl}/simulation`);
check("the page has its title", (await visitor.locator("h1").textContent()) === "Game Simulation");
check("five roles to choose from", (await visitor.locator('[data-act="lane"]').count()) === 5);
check(
  "the menu leads to it",
  (await visitor.locator('a.nav-link[href="/simulation"]').count()) === 1
);
await visitor.click('[data-act="heroes"][data-value="hand"]');
await visitor.waitForSelector("select[data-slot] option[value='105']", { state: "attached" });
check("ten slots to choose by hand", (await visitor.locator("select[data-slot]").count()) === 10);
check(
  "the slots list the heroes the bots server plays",
  (await visitor.locator("select[data-slot] option[value='105']").count()) > 0
);
await visitor.click('[data-act="start"]');
check(
  "a visitor is asked to sign in to play",
  await settles(visitor.waitForSelector(".sim-page .error-block", { timeout: 10000 }))
);

// ---- a game, signed in ---------------------------------------------------------------------------------------------
const player = await open(ana);
await player.goto(`${app.baseUrl}/simulation`);
await player.click('[data-act="start"]');
await player.waitForSelector(".sim-layer .sim-map__svg", { timeout: 20000 });
check("the board covers the page", await player.locator(".sim-layer").isVisible());
const ticket = bots.seen.tickets.at(-1);
check(
  "the ticket names the player and the set-up",
  ticket?.userId === ana.user.id && LANES.includes(ticket?.choice?.lane)
);
await player.waitForSelector(".sim-decision:not([hidden]) .sim-choice", { timeout: 20000 });
check(
  "a decision: four choices and stay",
  (await player.locator(".sim-decision .sim-choice").count()) === 5
);
check(
  "the choice names a place",
  (await player.locator(".sim-decision .sim-choice").first().textContent()) === "Go to the Mid lane"
);
check("four calls", (await player.locator(".sim-call").count()) === 4);
await player.locator(".sim-decision .sim-choice").first().click();
await player.click('[data-sim="pause"]');
check(
  "the pause hides the map",
  await settles(player.waitForSelector(".sim-map.is-hidden", { timeout: 5000 }))
);
await player.click('[data-sim="resume"]');
await player.waitForSelector(".sim-end:not([hidden])", { timeout: 30000 });
check(
  "the orders reached the bots server",
  ["choose", "pause", "resume"].every(order => bots.seen.orders.includes(order))
);
const grade = await player.locator(".sim-grade-card h2").textContent();
check(`the grade alone at the end (${grade})`, grade === "Macro grade: A");
check(
  "the pause is told",
  (await player.locator(".sim-grade-card").textContent()).includes("paused")
);
await player.click('.sim-end [data-sim="leave"]');
check(
  "the site kept the game the bots server handed it",
  await settles(player.waitForSelector(".sim-past", { timeout: 10000 }))
);
check("it answered 201", bots.seen.results.at(-1) === 201);

// ---- a phone held upright ----------------------------------------------------------------------------------------------
const phone = await open(ana, { width: 390, height: 844 });
await phone.goto(`${app.baseUrl}/simulation`);
await phone.click('[data-act="start"]');
await phone.waitForSelector(".sim-layer", { timeout: 20000 });
check("upright, the phone is asked to turn", await phone.locator(".sim-turn").isVisible());
await phone.close();

// ---- the picture of the map, chosen by an administrator among the maps of the training -------------------------
const boss = await app.signIn("SimBoss", { admin: true });
const map = await app.store.saveTrainingMap({
  name: "HoK S11",
  mime: "image/webp",
  data: await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2a6a3a" } })
    .webp()
    .toBuffer(),
  width: 64,
  height: 64,
  createdBy: boss.user.id
});
const admin = await open(boss);
await admin.goto(`${app.baseUrl}/training/scenarios`);
await admin.click(`[data-sim-map="${map.id}"]`);
check(
  "the administrator chose the board of the simulation",
  await settles(
    admin.waitForSelector(`[data-sim-map="${map.id}"]`, { state: "detached", timeout: 10000 })
  )
);
const board = await open(boss);
const picture = board.waitForResponse(answer => answer.url().endsWith(`/training-maps/${map.id}`));
await board.goto(`${app.baseUrl}/simulation`);
await board.click('[data-act="start"]');
await board.waitForSelector(".sim-layer .sim-map__svg", { timeout: 20000 });
check("the board is the picture of the map", (await board.locator(".sim-picture").count()) === 1);
check("the picture is served", (await picture).status() === 200);
check(
  "the walls and bushes are not drawn over it",
  (await board.locator(".sim-wall, .sim-bush").count()) === 0
);
await board.close();

await browser.close();
await app.close();
await bots.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
