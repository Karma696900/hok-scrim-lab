// Browser check of the Game Simulation's play view on every common phone screen held sideways, and a tablet: from a
// small 16:9 phone (568 x 320) to a tall 20:9 one, with and without the browser's address bar (915 x 356 is a
// RedMagic 9 Pro out of full screen, 915 x 412 the same phone in full screen). On each, no control of the game (the
// buttons, the joystick, the skills, the minimap, the allies' cards, the score) lies over another one or runs out of
// the screen.
// The games run on a stand-in for the bots server (src/testing/fake-bots-server.js), as in simulation.e2e.mjs.
//   SIM_SHOTS=<folder>: also saves a picture of each screen, for a human to look at
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { startFakeBots } from "../../../testing/fake-bots-server.js";
import { startTestServer } from "../../../testing/test-app.js";

const SCREENS = [
  [568, 320],
  [640, 360],
  [667, 375],
  [740, 360],
  [844, 390],
  [915, 356],
  [915, 412],
  [932, 430],
  [1024, 480],
  [1280, 800]
];
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const ids = ["105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116"];
const secret = randomBytes(32).toString("hex");
const bots = await startFakeBots({ secret, roster: ids });
process.env.BOTS_URL = bots.url;
process.env.BOTS_SHARED_SECRET = secret;
const app = await startTestServer();
bots.setSite(app.baseUrl);
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
const player = await app.signIn("SimScreens");

const problems = [];
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : ` ${detail}`}`);
  if (!condition) {
    problems.push(label);
  }
};

// Runs in the page: the boxes of the game's controls, what runs out of the screen and which lie over each other.
function crowding() {
  const game = document.querySelector(".sim-game--play");
  const shown = element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      box.width > 2 &&
      box.height > 2 &&
      !element.closest("[hidden], .sim-scores")
    );
  };
  const controls = [
    ...game.querySelectorAll(".sim-hud button, .sim-stick, .sim-mini, .sim-cards, .sim-hud__right")
  ].filter(shown);
  const name = element =>
    `${String(element.className).split(" ")[0]}${element.dataset.call ? `[${element.dataset.call}]` : ""}`;
  const out = [];
  const over = [];
  for (const element of controls) {
    const box = element.getBoundingClientRect();
    if (
      box.left < -0.5 ||
      box.top < -0.5 ||
      box.right > innerWidth + 0.5 ||
      box.bottom > innerHeight + 0.5
    ) {
      out.push(name(element));
    }
  }
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const [a, b] = [controls[i], controls[j]];
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const p = a.getBoundingClientRect();
      const q = b.getBoundingClientRect();
      const width = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const height = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (width > 1 && height > 1) {
        over.push(`${name(a)} × ${name(b)}`);
      }
    }
  }
  return { count: controls.length, out, over };
}

const browser = await chromium.launch();
for (const [width, height] of SCREENS) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true
  });
  await context.addCookies([
    { name: "hok_session", value: player.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  await page.goto(`${app.baseUrl}/simulation`);
  await page.click('[data-act="start"]');
  await page.waitForSelector(".sim-game--play .sim-hud", { state: "attached", timeout: 20000 });
  // the skills, the spell and the cards are filled once the catalogue and the heroes have come
  await page.waitForTimeout(1500);
  if (process.env.SIM_SHOTS) {
    await page.screenshot({ path: `${process.env.SIM_SHOTS}/screen-${width}x${height}.png` });
  }
  const { count, out, over } = await page.evaluate(crowding);
  const screen = `${width} × ${height}`;
  check(`${screen}: the controls are found`, count >= 15, `(${count})`);
  check(`${screen}: no control runs out of the screen`, out.length === 0, out.join(", "));
  check(`${screen}: no control lies over another`, over.length === 0, over.join(", "));
  await context.close();
}
await browser.close();
await bots.close();
await app.close?.();
if (problems.length) {
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log("\nsimulation screens: all good");
process.exit(0);
