// Browser check of the training area: a player picks the heroes to work on, writes goals and a
// combo drawn with skill pictures, an administrator uploads a map and builds a situation by
// clicking the map (heroes of both sides, one dead, a camp), the player studies it and writes an
// answer. Phone width has no horizontal scroll.
import { chromium } from "playwright";
import sharp from "../../../server/platform/images/sharp-safe.js";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const player = await app.signIn("Trainee");
const admin = await app.signIn("Coach", { admin: true });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

// Two skills for the first hero (what the Camp sheet would provide); the pictures are not reachable
// in a test, the tiles fall back
await app.store.saveHeroDetails("h01", {
  skills: [
    {
      id: "1101",
      index: 1,
      type: "skill",
      label: "Skill 1",
      name: "Dash",
      icon: null,
      description: [{ t: "Dash forward.", c: null }],
      cost: 40,
      cooldownSeconds: 6,
      tags: [],
      video: null
    },
    {
      id: "1102",
      index: 2,
      type: "skill",
      label: "Skill 2",
      name: "Slam",
      icon: null,
      description: [{ t: "Slam the ground.", c: null }],
      cost: null,
      cooldownSeconds: 9,
      tags: [],
      video: null
    }
  ]
});
const mapPicture = await sharp({
  create: { width: 800, height: 600, channels: 3, background: "#1f3a2e" }
})
  .png()
  .toBuffer();
const uploaded = await fetch(
  `${app.baseUrl}/api/training/maps?name=${encodeURIComponent("Test map")}`,
  {
    method: "POST",
    headers: {
      "content-type": "image/png",
      cookie: `hok_session=${admin.browser.jar.get("hok_session")}`
    },
    body: mapPicture
  }
);
check("an administrator can upload a map", uploaded.status === 200);

const browser = await chromium.launch();
const open = async (user, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  if (user) {
    await context.addCookies([
      { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
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
  page.on("dialog", dialog => dialog.accept());
  return page;
};

// ---- a visitor ----------------------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/training`);
await visitor.waitForSelector(".sign-in-prompt");
check(
  "a visitor is asked to sign in for the heroes",
  /Sign in/.test(await visitor.locator(".sign-in-prompt").innerText())
);
check(
  "the menu has the Training entry",
  (await visitor.locator('#main-nav .nav-link[data-view="training"]').count()) === 1
);
await visitor.goto(`${app.baseUrl}/training/scenarios`);
await visitor.waitForSelector(".scenario-grid");
check(
  "a visitor sees the situations page (no situation published yet)",
  /No situation yet/.test(await visitor.locator(".scenario-grid").innerText())
);
check(
  "a visitor has no editing tools",
  (await visitor.locator("[data-new-scenario], #map-form").count()) === 0
);

// ---- the player: heroes -------------------------------------------------------------------------
const page = await open(player);
await page.goto(`${app.baseUrl}/training`);
await page.waitForSelector("#focus-list");
await page.check('[data-toggle="h01"]');
await page.waitForSelector(".focus-card");
await page.check('[data-toggle="h02"]');
await page.waitForFunction(() => document.querySelectorAll(".focus-card").length === 2);
check(
  "ticking a hero puts it in the quick access",
  (await page.locator(".focus-card").count()) === 2
);
await page.reload();
await page.waitForSelector(".focus-card");
check("the chosen heroes are remembered", (await page.locator(".focus-card").count()) === 2);
await page.click('.focus-card[data-open="h01"]');
await page.waitForSelector(".skill-row");
check(
  "the details of a hero show its skills",
  (await page.locator(".skill-row").count()) === 2 &&
    /Dash/.test(await page.locator("#focus-details").innerText())
);
check(
  "quick links to the sheet, the build lab and the notes",
  (await page
    .locator(
      '#focus-details a[href^="/heroes/h01"], #focus-details a[href^="/build-lab"], #focus-details a[href^="/training/notebook"]'
    )
    .count()) === 3
);

// ---- the player: notebook -----------------------------------------------------------------------
await page.click('.training-tabs a[href="/training/notebook"]');
// the button is in the frame of the page, drawn before its data: the notes are what says the page is there
await page.waitForSelector("#trn-notes");
await page.click("[data-new]");
await page.fill("#note-title", "Last-hit under the tower");
await page.fill("#note-body", "Ten minutes a day in the practice mode.");
await page.click('#note-form button[type="submit"]');
await page.waitForSelector(".note-card");
check(
  "a goal is saved in the notebook",
  /Last-hit under the tower/.test(await page.locator(".note-list").innerText())
);

await page.click("[data-new]");
await page.selectOption("#note-kind", "combo");
await page.fill("#note-title", "Burst");
await page.waitForSelector(".skill-button");
await page.click('.skill-button[data-add-step="1101"]');
await page.click('.skill-button[data-add-step="1102"]');
await page.click('.skill-button[data-add-step="1101"]');
check(
  "a combo is built by picking skill pictures in order",
  (await page.locator(".step-editor li").count()) === 3
);
await page.click('[data-step-up="1"]');
await page.click('[data-step-remove="2"]');
check("steps can be moved and removed", (await page.locator(".step-editor li").count()) === 2);
await page.fill('[data-hint="0"]', "close the gap");
await page.click('#note-form button[type="submit"]');
await page.waitForSelector(".combo-steps");
check(
  "the combo is shown as a strip of skill pictures",
  (await page.locator(".combo-steps .combo-pic").count()) === 2 &&
    /close the gap/.test(await page.locator(".combo-steps").innerText())
);
await page.selectOption(".note-card.combo .note-status", "practicing");
await page.click('.segmented [data-kind="combo"]');
check("the notebook filters by type", (await page.locator(".note-card").count()) === 1);
await page.click('.segmented [data-kind="all"]');
await page.click(".note-card.goal [data-remove]");
await page.waitForFunction(() => document.querySelectorAll(".note-card").length === 1);
check("a note can be deleted", (await page.locator(".note-card").count()) === 1);

// ---- the administrator: a situation built on the map --------------------------------------------
const boss = await open(admin);
await boss.goto(`${app.baseUrl}/training/scenarios`);
// the button is in the frame of the page, drawn before its data: the tools of the maps are what says the page is there
await boss.waitForSelector("#map-form");
check(
  "an administrator sees the maps tools",
  (await boss.locator("#map-form").count()) === 1 &&
    /Test map/.test(await boss.locator(".map-list").innerText())
);
await boss.click("[data-new-scenario]");
await boss.waitForSelector(".map-board.editable");
const board = boss.locator(".map-board");
const place = async (x, y) =>
  board.click({
    position: {
      x: x * 800 * (await board.evaluate(node => node.clientWidth / 800)),
      y: y * 600 * (await board.evaluate(node => node.clientHeight / 600))
    }
  });
await boss.selectOption("#tool-hero", "h01");
await place(0.25, 0.7);
await boss.click('[data-tool="hero:red"]');
await boss.selectOption("#tool-hero", "h02");
await place(0.7, 0.3);
await boss.click('[data-tool="camp"]');
await boss.fill("#tool-label", "Red buff");
await place(0.5, 0.5);
check("three pins are placed by clicking the map", (await boss.locator(".map-pin").count()) === 3);
const left = await boss.locator(".map-pin.hero.blue").evaluate(node => node.style.left);
check(
  "a pin sits where it was clicked (share of the map)",
  left.endsWith("%") && Math.abs(parseFloat(left) - 25) < 3
);
await boss.click('.pin-row:has-text("Hero h02")');
await boss.click("[data-dead]");
check("a hero can be marked dead", (await boss.locator(".map-pin.hero.dead").count()) === 1);
// keyboard: arrows nudge the selected pin
const before = parseFloat(
  await boss.locator(".map-pin.hero.red").evaluate(node => node.style.left)
);
await boss.locator(".map-pin.hero.red").focus();
await boss.keyboard.press("ArrowRight");
const after = parseFloat(await boss.locator(".map-pin.hero.red").evaluate(node => node.style.left));
check("arrow keys move the selected pin", after > before);
await boss.fill("#sc-title", "Dragon fight");
await boss.fill("#sc-brief", "Blue is a man up. The objective spawns in ten seconds.");
await boss.check('input[name="published"]');
await boss.click('#scenario-form button[type="submit"]');
await boss.waitForURL(/\/training\/scenarios\/[0-9a-f-]{36}$/);
await boss.waitForSelector(".scenario-legend");
check(
  "the saved situation shows its pins and who is dead",
  (await boss.locator(".map-pin").count()) === 3 &&
    (await boss.locator(".scenario-legend .is-dead").count()) === 1
);
const scenarioUrl = boss.url();

// ---- the player studies it and answers ----------------------------------------------------------
await page.goto(scenarioUrl);
await page.waitForSelector(".scenario-legend");
check(
  "a player sees the published situation without editing tools",
  (await page.locator(".map-pin").count()) === 3 &&
    (await page.locator("[data-edit-scenario]").count()) === 0
);
check(
  "the pins of a player's view are not draggable buttons",
  (await page.locator("button.map-pin").count()) === 0
);
await page.fill("#answer-text", "Bait the objective, then flank through the bush.");
await page.click('#answer-form button[type="submit"]');
await page.waitForSelector("#toasts .toast", { timeout: 3000 }).catch(() => {});
await page.reload();
await page.waitForSelector("#answer-text");
check("the answer is remembered", /Bait the objective/.test(await page.inputValue("#answer-text")));

// ---- phone --------------------------------------------------------------------------------------
const phone = await open(player, 390);
for (const path of [
  "/training",
  "/training/notebook",
  "/training/scenarios",
  new URL(scenarioUrl).pathname
]) {
  await phone.goto(`${app.baseUrl}${path}`);
  await phone.waitForSelector("main h1, #app h1");
  await phone.waitForTimeout(400);
  check(
    `no horizontal scroll on a phone at ${path.replace(/[0-9a-f-]{36}/, "<id>")}`,
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
}

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\ntraining e2e passed");
