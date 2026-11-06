// Browser check of the Game Simulation (/simulation). The games run on the bots server (private repository
// hok-bots): here a stand-in plays a short scripted game over the same WebSocket messages (src/testing/
// fake-bots-server.js). Checked: the set-up screen a visitor sees and that a game needs an account, a game signed
// in (the ticket, the board, the joystick held, an enemy locked and the attack, the pause that hides the map, the grade
// alone at the end, kept by
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
// true as soon as `test` holds (the orders cross a WebSocket), false after `ms`
const until = async (test, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (test()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return test();
};
const ana = await app.signIn("SimPlayer");
// SIM_SHOTS=<folder>: also saves pictures of the screen of the game, for a human to look at
const shot = async (page, name) =>
  process.env.SIM_SHOTS && page.screenshot({ path: `${process.env.SIM_SHOTS}/${name}.png` });

const browser = await chromium.launch();
// the game is played on touch screens only (simulation.css): every page is a touch device unless `touch` is false
const open = async (
  who,
  viewport = { width: 1280, height: 800 },
  { quiet = [], touch = true } = {}
) => {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
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

// ---- a computer with a mouse ---------------------------------------------------------------------------------------
const desk = await open(null, undefined, { quiet: ["401"], touch: false });
await desk.goto(`${app.baseUrl}/simulation`);
await desk.waitForSelector(".sim-phone-only", { state: "attached", timeout: 20000 });
const fine = await desk.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
check(
  `with a mouse (${fine ? "fine pointer" : "no fine pointer"}), the page asks for a phone instead of the set-up`,
  (await desk.locator(".sim-phone-only").isVisible()) &&
    !(await desk.locator(".sim-columns").isVisible())
);
await desk.close();

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
const fullscreen = page => page.evaluate(() => document.fullscreenElement !== null);
check("the tap on start put the page in full screen", await fullscreen(player));
await player.evaluate(() => document.exitFullscreen());
await player.waitForSelector(".sim-full:not([hidden])", { timeout: 5000 });
check(
  "out of full screen, a button covers the board",
  await player.locator(".sim-full").isVisible()
);
await player.click('[data-sim="fullscreen"]');
await player.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 5000 });
check(
  "its tap takes the full screen back and the button goes",
  (await fullscreen(player)) && !(await player.locator(".sim-full").isVisible())
);
const ticket = bots.seen.tickets.at(-1);
check(
  "the ticket names the player and the set-up",
  ticket?.userId === ana.user.id && LANES.includes(ticket?.choice?.lane)
);
check("no decision box", (await player.locator(".sim-decision").count()) === 0);
check("four calls", (await player.locator(".sim-call").count()) === 4);
const stick = await player.locator("[data-stick]").boundingBox();
check("the joystick bottom left", stick !== null && stick.x < 400 && stick.y > 500);
const attack = await player.locator('[data-sim="aim"][data-kind="auto"]').boundingBox();
check(
  "the attack bottom right, big enough",
  attack !== null && attack.x > 880 && attack.width >= 64
);
await player.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
await player.mouse.down();
await player.mouse.move(stick.x + stick.width, stick.y + stick.height / 2, { steps: 4 });
check(
  "the held stick moves the hero",
  await settles(player.waitForFunction(() => document.querySelector(".sim-stick.is-held")))
);
check(
  "the stick reached the bots server",
  await until(() => bots.seen.moves.some(([x]) => Math.abs(x) > 0.5))
);
await player.mouse.up();
check("let go, the hero stops", await until(() => bots.seen.moves.at(-1)?.join() === "0,0"));
const mini = await player.locator(".sim-mini").boundingBox();
check("the minimap top left", mini !== null && mini.x < 40 && mini.y < 40);
check("the cards of the side's five heroes", (await player.locator(".sim-card").count()) === 5);
check(
  "the camera follows the hero, the map tilted like the game's",
  await settles(
    player.waitForFunction(() => {
      const transform = document.querySelector(".sim-game--play .sim-map")?.style.transform ?? "";
      return transform.includes("translate3d") && transform.includes("rotateX");
    })
  )
);
await player.waitForTimeout(400);
const centred = await player.evaluate(() => {
  const view = document.querySelector(".sim-view").getBoundingClientRect();
  const me = document.querySelector(".sim-dot--me");
  const dot = me.getBoundingClientRect();
  // the frame and the player's own dot on the minimap, where they are drawn (the frame is moved by its transform)
  const frame = document.querySelector(".sim-mini__frame").getBoundingClientRect();
  const mine = document.querySelector(".sim-mini__hero.is-me").getBoundingClientRect();
  const miniBox = document.querySelector(".sim-mini").getBoundingClientRect();
  return {
    screen: Math.hypot(
      dot.left + dot.width / 2 - (view.left + view.width / 2),
      dot.top + dot.height / 2 - (view.top + view.height / 2)
    ),
    // as a share of the minimap's side
    frame:
      (Math.hypot(
        frame.left + frame.width / 2 - (mine.left + mine.width / 2),
        frame.top + frame.height / 2 - (mine.top + mine.height / 2)
      ) /
        miniBox.width) *
      100,
    reach: (() => {
      // on the tilted ground the near half of the ring looks bigger: its box is centred across, a little low
      const ring = document.querySelector("[data-reach]").getBoundingClientRect();
      return {
        across: Math.abs(ring.left + ring.width / 2 - (view.left + view.width / 2)),
        down: (ring.top + ring.height / 2 - (view.top + view.height / 2)) / ring.height,
        wider: ring.width > dot.width
      };
    })(),
    flat: !document.querySelector(".sim-dots").style.transform.includes("rotate"),
    farther: [...document.querySelectorAll(".sim-dot:not([hidden])")].some(other => {
      const box = other.getBoundingClientRect();
      return box.top < dot.top - 40 && box.width < dot.width - 1;
    }),
    towers: document.querySelectorAll(".sim-dots .sim-spot--tower").length,
    onMap: document.querySelectorAll(".sim-map [data-tower], .sim-map [data-camp]").length,
    standing: (() => {
      const tower = document.querySelector(".sim-spot--tower");
      const box = tower.getBoundingClientRect();
      return Boolean(tower.querySelector(".sim-figure--tower")) && box.height > box.width;
    })()
  };
});
check(
  `the hero's dot in the middle of the screen (${centred.screen.toFixed(1)} px off)`,
  centred.screen < 6
);
check(
  `the minimap's frame centred on the hero (${centred.frame.toFixed(2)} % off)`,
  centred.frame < 1
);
check(
  `the gold ring of the attack reach lies around the hero (${centred.reach.across.toFixed(1)} px across, ${(centred.reach.down * 100).toFixed(0)} % low)`,
  centred.reach.across < 3 &&
    centred.reach.down >= 0 &&
    centred.reach.down < 0.15 &&
    centred.reach.wider
);
check("the dots stand on a flat layer above the tilted map", centred.flat);
const minions = await player.evaluate(() => {
  const marks = [...document.querySelectorAll(".sim-dots .sim-minion")];
  const heroDot = document.querySelector(".sim-dot--me").getBoundingClientRect();
  return {
    count: marks.length,
    pictures: marks.filter(mark => mark.querySelector(".sim-minion__face img")).length,
    hurt: marks.some(mark => mark.querySelector(".sim-bar--minion > i")?.dataset.p === "50"),
    smaller: marks.every(mark => mark.getBoundingClientRect().width < heroDot.width),
    widths: [heroDot.width, ...marks.map(mark => mark.getBoundingClientRect().width)].map(
      Math.round
    ),
    // where each is drawn on the screen (the dots are placed by their transform)
    apart:
      new Set(
        marks.map(mark => {
          const box = mark.getBoundingClientRect();
          return `${Math.round(box.left)},${Math.round(box.top)}`;
        })
      ).size === marks.length
  };
});
check(
  `a wave is one dot a minion, its picture inside, smaller than a hero, each in its own place (${JSON.stringify(minions)})`,
  minions.count === 4 && minions.pictures === 4 && minions.smaller && minions.apart
);
check("a hurt minion shows its health", minions.hurt);
const monsters = await player.evaluate(() => {
  const camp = document.querySelector('.sim-dots [data-camp="blue-camp-2"]');
  const faces = [...(camp?.querySelectorAll(".sim-monster") ?? [])];
  const widths = faces.map(face => Math.round(face.getBoundingClientRect().width));
  return {
    count: faces.length,
    pictures: faces.filter(face => face.querySelector("img")?.naturalWidth > 0).length,
    widths,
    // one dot a camp, as the game's minimap marks it (lesson 10, 0:36): the big boar, with some size
    bigger: widths.length === 1 && widths[0] > 8,
    icon: Boolean(camp?.querySelector("svg"))
  };
});
check(
  `a camp shows ONE dot, its main monster's picture (the boar of the boar camp) (${JSON.stringify(monsters)})`,
  monsters.count === 1 && monsters.pictures === 1 && monsters.bigger && !monsters.icon
);
check("a dot farther up the map is drawn smaller", centred.farther);
check(
  "the towers stand up on the field, drawn taller than wide, none drawn on the map",
  centred.towers === 2 && centred.onMap === 0 && centred.standing
);
check(
  "no skills on the screen: the AI casts them",
  (await player.locator(".sim-arc, [data-skill]").count()) === 0
);
const frameAt = () =>
  player.evaluate(() => {
    // where the frame is drawn, as shares of the minimap (it is moved by its transform)
    const frame = document.querySelector(".sim-mini__frame").getBoundingClientRect();
    const box = document.querySelector(".sim-mini").getBoundingClientRect();
    return [
      ((frame.left - box.left) / box.width) * 100,
      ((frame.top - box.top) / box.height) * 100
    ];
  });
const before = await frameAt();
await player.mouse.move(mini.x + mini.width - 6, mini.y + 6);
await player.mouse.down();
await player.waitForTimeout(150);
const looking = await frameAt();
check(
  "held, the minimap moves the camera to the finger",
  (await player.locator(".sim-mini.is-looking").count()) === 1 &&
    Math.hypot(looking[0] - before[0], looking[1] - before[1]) > 10
);
await shot(player, "minimap-look");
await player.mouse.up();
await player.waitForTimeout(450);
const back = await frameAt();
check(
  "lifted, the camera glides back to the hero",
  (await player.locator(".sim-mini.is-looking").count()) === 0 &&
    Math.hypot(back[0] - before[0], back[1] - before[1]) < 2
);
await shot(player, "hud");
if (process.env.SIM_SHOTS) {
  // a window in full screen cannot be resized
  await player.evaluate(() => document.exitFullscreen());
  await player.setViewportSize({ width: 844, height: 390 });
  await player.waitForTimeout(300);
  // the picture of the board, without the button back to full screen
  await player.evaluate(() => (document.querySelector(".sim-full").hidden = true));
  await shot(player, "hud-phone");
  await player.setViewportSize({ width: 1280, height: 800 });
}
await player.click('.sim-scorebar [data-sim="scoreboard"]');
check(
  "the scoreboard lists the ten heroes with their assists",
  (await settles(player.waitForSelector(".sim-scores__row:nth-child(5)", { timeout: 5000 }))) &&
    (await player.locator(".sim-scores__row").count()) === 10 &&
    (await player.locator(".sim-scores__kda").first().textContent()).endsWith("/ 2")
);
await shot(player, "scoreboard");
await player.click('.sim-scores [data-sim="scoreboard"]');
check("the scoreboard closes", await player.locator(".sim-scores").isHidden());
// two fingers, as in a game: the thumb holds the stick while the other one presses a button. A phone makes no click
// of a touch while another finger is down, so the buttons must answer the finger itself.
{
  const touch = await player.context().newCDPSession(player);
  const finger = (type, points) =>
    touch.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const held = await player.locator("[data-stick]").boundingBox();
  const thumb = { ...centre(held), id: 1 };
  const pressWithStickHeld = async selector => {
    const button = { ...centre(await player.locator(selector).first().boundingBox()), id: 2 };
    await finger("touchStart", [thumb]);
    await finger("touchMove", [{ ...thumb, x: thumb.x + 30 }]);
    await finger("touchStart", [{ ...thumb, x: thumb.x + 30 }, button]);
    await finger("touchEnd", [{ ...thumb, x: thumb.x + 30 }]);
    await finger("touchEnd", []);
  };
  const targets = bots.seen.targets.length;
  await pressWithStickHeld('[data-sim="aim"][data-kind="auto"]');
  check(
    "with the stick held, a press on the attack reaches the bots server",
    await until(
      () => bots.seen.targets.length === targets + 1 && bots.seen.targets.at(-1) === "auto"
    )
  );
  await pressWithStickHeld('.sim-scorebar [data-sim="scoreboard"]');
  check(
    "with the stick held, a press on the scoreboard opens it, once",
    await settles(player.waitForSelector(".sim-scores:not([hidden])", { timeout: 3000 }))
  );
  await player.waitForTimeout(400);
  check(
    "the scoreboard stays open (no second toggle from a click)",
    await player.locator(".sim-scores").isVisible()
  );
  await player.tap('.sim-scores [data-sim="scoreboard"]');
  await player.waitForTimeout(400);
  check("a lone tap closes it, once", await player.locator(".sim-scores").isHidden());
  await player.tap('.sim-scorebar [data-sim="scoreboard"]');
  await player.waitForTimeout(400);
  check("a lone tap opens it, once", await player.locator(".sim-scores").isVisible());
  await player.tap('.sim-scores [data-sim="scoreboard"]');
  await player.waitForTimeout(400);
  await touch.detach();
}
await player.click('[data-sim="pause"]');
check(
  "the pause hides the map",
  await settles(player.waitForSelector(".sim-game.is-hidden", { timeout: 5000 }))
);
await player.click('[data-sim="resume"]');
await player.waitForSelector(".sim-avatar", { timeout: 10000 });
check("the enemy in sight is a portrait", (await player.locator(".sim-avatar").count()) === 1);
await player.locator(".sim-avatar").click();
check(
  "the locked enemy is marked",
  await settles(player.waitForSelector('.sim-avatar[aria-pressed="true"]', { timeout: 5000 }))
);
check("and ringed on the map", (await player.locator(".sim-dot.is-target").count()) === 1);
check(
  "and its name and health shown at the top, as the game's target info",
  await settles(
    player.waitForSelector(".sim-target:not([hidden]) .sim-target__hp", { timeout: 5000 })
  )
);
await player.keyboard.press("KeyE");
await player.click('[data-sim="aim"][data-kind="auto"]');
await player.waitForSelector(".sim-end:not([hidden])", { timeout: 30000 });
check(
  "the orders reached the bots server",
  ["move", "target", "pause", "resume"].every(order => bots.seen.orders.includes(order))
);
check(
  "the portrait, the key E and the attack each aimed",
  bots.seen.targets.some(kind => /^(blue|red)-\d$/.test(kind)) &&
    bots.seen.targets.includes("minion") &&
    bots.seen.targets.includes("auto")
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
check("leaving the game gives the normal page back", !(await fullscreen(player)));
check("it answered 201", bots.seen.results.at(-1) === 201);

// ---- a watched game: ten bots, the speed and the view switched live, the winner at the end -------------------------
const viewer = await open(ana);
await viewer.goto(`${app.baseUrl}/simulation`);
await viewer.click('[data-act="mode"][data-value="watch"]');
check(
  "watching asks no side, role or difficulty",
  (await viewer
    .locator('[data-act="side"], [data-act="lane"], [data-act="difficulty"]')
    .count()) === 0
);
await viewer.click('[data-act="start"]');
await viewer.waitForSelector(".sim-game--watch .sim-map__svg", { timeout: 20000 });
check("the ticket asks to watch", bots.seen.tickets.at(-1)?.choice?.mode === "watch");
check("ten heroes in the two teams", (await viewer.locator("[data-row]").count()) === 10);
check("no fog over everything", (await viewer.locator(".sim-map.is-clear").count()) === 1);
await viewer.click('[data-sim="speed"][data-value="4"]');
await viewer.click('[data-sim="view"][data-value="red"]');
check(
  "the switch shows the speed the bots server plays",
  await settles(
    viewer.waitForSelector('[data-sim="speed"][data-value="4"][aria-pressed="true"]', {
      timeout: 5000
    })
  )
);
check(
  "the view of the red team brings its fog back",
  await settles(viewer.waitForSelector(".sim-map:not(.is-clear)", { timeout: 5000 }))
);
check(
  "the orders reached the bots server",
  ["speed", "view"].every(order => bots.seen.orders.includes(order))
);
// through a hero's eyes: the screen of a game by hand, nothing to press but the speed and the way back (the
// stand-in's game is short: paused meanwhile)
await viewer.click('[data-sim="speed"][data-value="0"]');
await settles(
  viewer.waitForSelector('[data-sim="speed"][data-value="0"][aria-pressed="true"]', {
    timeout: 5000
  })
);
const followed = await viewer.locator('[data-sim="follow"]').first().getAttribute("data-hero");
await viewer.click(`[data-sim="follow"][data-hero="${followed}"]`);
check(
  "a hero tapped in the teams gives its point of view: the tilted field, its team's cards, its fog",
  await settles(
    viewer.waitForSelector(`.sim-game--follow .sim-card.is-me[data-card="${followed}"]`, {
      timeout: 5000
    })
  )
);
check(
  "the camera follows that hero, tilted",
  await settles(
    viewer.waitForFunction(() =>
      (document.querySelector(".sim-game--follow .sim-map")?.style.transform ?? "").includes(
        "rotateX"
      )
    )
  )
);
check(
  "through a hero's eyes nothing is pressed for the bots: no stick, no attack, no spell",
  (await viewer
    .locator(
      ".sim-game--follow [data-stick], .sim-game--follow .sim-strike, .sim-game--follow .sim-spell"
    )
    .count()) === 0
);
await viewer.click('[data-sim="overview"]');
check(
  "the way back shows the whole map and the two teams again",
  await settles(viewer.waitForSelector('.sim-game--watch [data-sim="follow"]', { timeout: 5000 }))
);
check("the follow orders reached the bots server", bots.seen.orders.includes("follow"));
await viewer.click('.sim-game--watch [data-sim="speed"][data-value="16"]');
await viewer.waitForSelector(".sim-watch-end", { timeout: 30000 });
check(
  "the end names the winner",
  (await viewer.locator(".sim-watch-end h2").textContent()) === "Blue wins"
);
check(
  "no grade for a watched game",
  (await viewer.locator(".sim-watch-end .sim-grade").count()) === 0
);
await viewer.click('.sim-end [data-sim="leave"]');
await viewer.close();

// ---- a phone held upright ----------------------------------------------------------------------------------------------
const phone = await open(ana, { width: 390, height: 844 });
await phone.goto(`${app.baseUrl}/simulation`);
await phone.click('[data-act="start"]');
await phone.waitForSelector(".sim-layer", { timeout: 20000 });
check("upright, the phone is asked to turn", await phone.locator(".sim-turn").isVisible());
await phone.close();

// ---- a phone held sideways: every control takes the finger where it is drawn ----------------------------------------
const sideways = await open(ana, { width: 844, height: 390 });
await sideways.goto(`${app.baseUrl}/simulation`);
await sideways.click('[data-act="start"]');
await sideways.waitForSelector(".sim-layer .sim-map__svg", { timeout: 20000 });
await sideways.waitForTimeout(400);
const covered = await sideways.evaluate(() =>
  [
    "[data-stick]",
    '[data-sim="aim"][data-kind="auto"]',
    '[data-sim="aim"][data-kind="minion"]',
    '[data-sim="aim"][data-kind="tower"]',
    '[data-sim="spell"]',
    '[data-sim="scoreboard"]',
    '[data-sim="pause"]',
    ...[...document.querySelectorAll(".sim-call")].map((_, i) => `.sim-call:nth-child(${i + 1})`)
  ].filter(selector => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    if (!box || box.width < 44 || box.height < 44) {
      return true;
    }
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return !(hit === element || element.contains(hit));
  })
);
check(
  `sideways on a phone, every control is 44 px or more and takes the finger (${covered.join(", ") || "none covered"})`,
  covered.length === 0
);
const floated = await sideways.evaluate(async () => {
  const ring = document.querySelector("[data-stick]");
  const zone = document.querySelector("[data-stick-zone]");
  const rest = ring.getBoundingClientRect();
  const at = { clientX: rest.right + 60, clientY: rest.top + 10, pointerId: 7, bubbles: true };
  zone.dispatchEvent(new PointerEvent("pointerdown", at));
  const moved = ring.getBoundingClientRect();
  zone.dispatchEvent(new PointerEvent("pointerup", at));
  const back = ring.getBoundingClientRect();
  return {
    under: Math.hypot(
      moved.left + moved.width / 2 - at.clientX,
      moved.top + moved.height / 2 - at.clientY
    ),
    back: Math.hypot(back.left - rest.left, back.top - rest.top)
  };
});
check(
  `the stick floats under a finger put beside it (${floated.under.toFixed(1)} px off), and goes back after`,
  floated.under < 2 && floated.back < 1
);
await sideways.close();

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
