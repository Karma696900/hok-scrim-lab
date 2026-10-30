// Browser check of the reflex training: the list of exercises, each exercise played from the first
// click to its result (and the one request that keeps the result, made only once the run is over),
// leaving a run, the goals a coach sets for a team and the progress of the players, phone width.
//
// The generator of random numbers of the page is fixed (always 0) so that the waits are the shortest
// ones and the boards are the same each time; the tracking exercise needs real random balls (fixed
// ones would all sit on one spot), so it is played in a page of its own.
import { chromium } from "playwright";
import { startTestServer } from "../../../../testing/test-app.js";
import { textOf } from "../../../../testing/text.js";

const app = await startTestServer();
const owner = await app.signIn("Boss");
const coach = await app.signIn("Mentor");
const player = await app.signIn("Rookie");

// the team: its owner creates it, the coach and the player are added to the roster
const created = await owner.browser.post("/api/teams", {
  name: "Reflex Club",
  tag: "RFXC",
  description: "",
  region: "EU",
  timezone: "UTC+1",
  languages: ["en"],
  level: "amateur"
});
const teamId = created.body.id;
for (const [who, role] of [
  [coach, "coach"],
  [player, "player"]
]) {
  await app.store.pool.execute(
    "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, '', ?)",
    [teamId, who.user.id, role, Date.now()]
  );
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, { width = 1440, steady = true } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  if (steady) {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
  }
  // The page writes down each request it makes and whether a run was going on at that moment. Playwright's
  // "request" event can come a little after the request was made: a request made just before the start
  // (the video list, once its timer is due) would otherwise be counted as made during the run.
  await page.addInitScript(() => {
    window.__asked = [];
    const fetchOf = window.fetch;
    window.fetch = function (...args) {
      const address = new URL(String(args[0]?.url ?? args[0]), location.href);
      window.__asked.push({
        call: `${(args[1]?.method ?? args[0]?.method ?? "GET").toUpperCase()} ${address.pathname}`,
        during: document.documentElement.classList.contains("is-quiet")
      });
      return fetchOf.apply(this, args);
    };
  });
  // what the page asks of the server, in order
  page.traffic = [];
  // what went wrong in the page, in order: printed when a wait runs out (see `whereIs`)
  page.trail = [];
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) {
      page.traffic.push(`${request.method()} ${pathname}`);
    }
  });
  page.on("requestfailed", request =>
    page.trail.push(
      `request failed: ${request.method()} ${new URL(request.url()).pathname} (${request.failure()?.errorText})`
    )
  );
  page.on("response", response => {
    if (response.status() >= 400) {
      page.trail.push(`answer ${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });
  page.on("console", message => {
    page.trail.push(`console.${message.type()}: ${message.text()}`);
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => {
    page.trail.push(`pageerror: ${error.message}`);
    problems.push(`pageerror: ${error.message}`);
  });
  return page;
};
/**
 * Says where a page is when a wait ran out (the script then stops, so nothing else would tell): its
 * address, what is drawn, what went wrong in it, and a picture. Never waits more than 5 seconds itself.
 */
async function whereIs(page, label) {
  const look = page.evaluate(() => ({
    url: location.href,
    readyState: document.readyState,
    ready: document.documentElement.dataset.ready ?? null,
    cards: document.querySelectorAll(".rx-card").length,
    view: (document.querySelector("#view")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 240)
  }));
  const now = await Promise.race([
    look,
    new Promise(resolve => setTimeout(() => resolve("the page did not answer in 5 s"), 5000))
  ]).catch(error => `the page could not be read: ${error.message}`);
  console.log(`     ${label}:`, JSON.stringify(now));
  console.log("     trail of the page:", page.trail.slice(-12).join(" | ") || "(empty)");
  console.log("     requests of the page, the last ones:", page.traffic.slice(-6).join(" | "));
  await page
    .screenshot({ path: `${process.env.TEMP ?? "."}/reflex-e2e-stuck.png`, timeout: 5000 })
    .catch(() => {});
}
const frames = (page, count = 2) =>
  page.evaluate(
    left =>
      new Promise(resolve => {
        const step = remaining =>
          remaining ? requestAnimationFrame(() => step(remaining - 1)) : resolve();
        step(left);
      }),
    count
  );
/** True when the page does not scroll sideways; when it does, says which elements stick out. */
async function noSideScroll(page) {
  const wide = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
      ? []
      : [...document.querySelectorAll("body *")]
          .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 8)
          .map(element => `${element.localName}.${String(element.className).slice(0, 50)}`)
  );
  if (wide.length) {
    console.log("     sticking out:", wide.join(" | "));
  }
  return wide.length === 0;
}
const text = (page, selector) => page.locator(selector).innerText();
const reflexRuns = async () =>
  (
    await app.store.pool.query("SELECT exercise, score FROM reflex_runs WHERE user_id = ?", [
      player.user.id
    ])
  )[0];

/** Opens an exercise from the list, as a person would, and waits for its Start button. */
async function openExercise(page, id) {
  await page.goto(`${app.baseUrl}/training/reflex`);
  try {
    await page.click(`.rx-card[href="/training/reflex/${id}"]`);
  } catch (error) {
    await whereIs(page, `the card of ${id} never came`);
    throw error;
  }
  await page.waitForSelector("[data-start]");
}
/**
 * Starts the exercise that is open and returns how many requests the page had made at that moment.
 * `calm` and `savedOnce` then tell what the page asked of the server after it.
 */
async function start(page) {
  // Playwright first hears of every request the page has already made, so that none of them is counted
  // after the start
  const asked = await page.evaluate(
    () => window.__asked.filter(entry => entry.call.includes(" /api/")).length
  );
  for (let tries = 0; page.traffic.length < asked && tries < 100; tries += 1) {
    await page.waitForTimeout(20);
  }
  const since = {
    traffic: page.traffic.length,
    asked: await page.evaluate(() => window.__asked.length)
  };
  await page.click("[data-start]");
  await page.waitForSelector("#rx-stage");
  return since;
}
const SAVE = "POST /api/training/reflex/runs";
// the video behind the page may be fetched once the run is over, not before
const BACKGROUND = "GET /api/backgrounds";
const afterStart = (page, since) => page.traffic.slice(since.traffic);
/**
 * Called just before the last action of a run: the page has asked nothing of the server since the
 * run began, and the shell, the video and the animations were told to hold still.
 */
async function calm(page, since, label) {
  const { before, during } = await page.evaluate(
    from => ({
      before: window.__asked
        .slice(from)
        .filter(entry => !entry.during)
        .map(entry => entry.call),
      during: window.__asked
        .slice(from)
        .filter(entry => entry.during)
        .map(entry => entry.call)
    }),
    since.asked
  );
  // a request the page made between the count and the click, before the run began, is not one of the run
  const calls = afterStart(page, since).filter(call => {
    const index = before.indexOf(call);
    if (index === -1) {
      return true;
    }
    before.splice(index, 1);
    return false;
  });
  if (calls.length || during.length) {
    console.log("     requests during the run:", [...new Set([...calls, ...during])].join(" | "));
  }
  check(
    `${label}: nothing is asked of the server while it runs, the page holds still`,
    calls.length === 0 &&
      during.length === 0 &&
      (await page.evaluate(async () => (await import("/app/app-state.js")).state.quiet)) &&
      (await page.evaluate(() => document.documentElement.classList.contains("is-quiet")))
  );
}
/** True when the only thing asked since the start (but the video, afterwards) is the save. */
function savedOnce(page, since) {
  const calls = afterStart(page, since).filter(call => call !== BACKGROUND);
  if (calls.join("|") !== SAVE) {
    console.log("     requests since the start:", calls.join(" | ") || "(none)");
  }
  return calls.join("|") === SAVE;
}
/** The result is shown, then the run is kept (or the page says why it was not). */
async function waitSaved(page) {
  await page.waitForSelector(".rx-result", { timeout: 60_000 });
  try {
    await page.waitForFunction(
      () => /Saved\./.test(document.querySelector("#rx-saved")?.innerText ?? ""),
      null,
      { timeout: 10_000 }
    );
  } catch {
    const said = await text(page, "#rx-saved");
    console.log("     the save said:", said.replace(/\s+/g, " "));
    problems.push(`a run was not kept: ${said}`);
  }
}

// ---- a person without an account --------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/training/reflex`);
await visitor.waitForSelector(".sign-in-prompt");
check(
  "without an account the reflex page asks to sign in (and comes back to it), and no exercise is offered",
  (await visitor.locator(".rx-card").count()) === 0 &&
    (await visitor
      .locator('.sign-in-prompt a[href="/login?next=%2Ftraining%2Freflex"]')
      .count()) === 1
);
check(
  "the server keeps the runs of accounts only",
  (
    await app
      .browser()
      .post("/api/training/reflex/runs", { exercise: "aim", score: 400, durationMs: 9000 })
  ).status === 401
);

// ---- the list of exercises ------------------------------------------------------------------------------
const page = await open(player);
await page.goto(`${app.baseUrl}/training/reflex`);
await page.waitForSelector(".rx-card");
check(
  "the Reflex tab is in the head of the training area and is the one that is open",
  (await page.locator(".training-tabs a").count()) === 4 &&
    (await textOf(page, ".training-tabs a.on .trn-tab__name")) === "Reflex"
);
check(
  "eight exercises are offered, none played yet",
  (await page.locator(".rx-card").count()) === 8 &&
    (await page.locator(".rx-card__best").allInnerTexts()).every(line =>
      /Not played yet/.test(line)
    )
);
check(
  "today, this week and the streak are shown, at zero",
  (await page.locator(".rx-stats .stat").count()) === 3 &&
    /0 runs/.test(await text(page, ".rx-stats")) &&
    /0 days/.test(await text(page, ".rx-stats"))
);
check(
  "no goal of a team is shown while there is none",
  (await page.locator("#rx-assigned").count()) === 0
);

// ---- the coach sets the goals on the page of the team ---------------------------------------------------
const staff = await open(coach, { steady: false });
await staff.goto(`${app.baseUrl}/teams/${teamId}`);
await staff.waitForSelector('[data-team="tab"][data-tab="training"]');
await staff.click('[data-team="tab"][data-tab="training"]');
await staff.waitForSelector("#goal-form");
check(
  "a coach has the Training tab of the team, with a form and nothing set yet",
  /No goal yet/.test(await text(staff, "#team-goals")) &&
    (await staff.locator("#team-progress .goal-table").count()) === 0
);
const addGoal = async (page, { period, metric, amount, exercise }) => {
  await page.selectOption("#goal-period", period);
  await page.selectOption("#goal-metric", metric);
  await page.fill("#goal-amount", String(amount));
  await page.selectOption("#goal-exercise", exercise);
  await page.click("[data-goal-submit]");
};
await addGoal(staff, { period: "day", metric: "runs", amount: 2, exercise: "" });
await staff.waitForSelector("#team-goals .goal-row");
await addGoal(staff, { period: "week", metric: "minutes", amount: 1, exercise: "aim" });
await staff.waitForFunction(() => document.querySelectorAll("#team-goals .goal-row").length === 2);
await addGoal(staff, { period: "week", metric: "runs", amount: 5, exercise: "" });
await staff.waitForFunction(() => document.querySelectorAll("#team-goals .goal-row").length === 3);
check(
  "goals are added one by one and listed in the order they were set, words not codes",
  (await staff.locator("#team-goals .goal-row__what").allInnerTexts())
    .map(line => line.replace(/\s+/g, " "))
    .join("|") ===
    "Every day 2 runs Any exercise|Every week 1 minute Aim trainer|Every week 5 runs Any exercise"
);
check(
  "the tab stays where it was after each change",
  (await staff.locator('[data-team="tab"][data-tab="training"].on').count()) === 1
);
await staff.locator('#team-goals [data-team="goal-edit"]').nth(1).click();
check(
  "editing puts the goal in the form, which now saves it",
  (await staff.inputValue("#goal-exercise")) === "aim" &&
    /Save the goal/.test(await textOf(staff, "[data-goal-submit]"))
);
await staff.fill("#goal-amount", "2");
await staff.click("[data-goal-submit]");
await staff.waitForFunction(() =>
  /2 minutes/.test(document.querySelectorAll("#team-goals .goal-row")[1]?.innerText ?? "")
);
check(
  "a goal is changed where it is: still three, the second one now asks for 2 minutes",
  (await staff.locator("#team-goals .goal-row").count()) === 3
);
staff.once("dialog", dialog => dialog.dismiss());
await staff.locator('#team-goals [data-team="goal-delete"]').nth(2).click();
check(
  "deleting asks first: nothing goes when the answer is no",
  (await staff.locator("#team-goals .goal-row").count()) === 3
);
staff.once("dialog", dialog => dialog.accept());
await staff.locator('#team-goals [data-team="goal-delete"]').nth(2).click();
await staff.waitForFunction(() => document.querySelectorAll("#team-goals .goal-row").length === 2);
check(
  "and removes it when the answer is yes",
  (await staff.locator("#team-goals .goal-row").count()) === 2
);
check(
  "the staff sees the progress of every player who is asked to train, at zero",
  (await staff.locator("#team-progress .goal-table tbody tr").count()) === 1 &&
    /Rookie/.test(await text(staff, "#team-progress .goal-table tbody")) &&
    (await staff.locator("#team-progress .goal-cell").allInnerTexts()).join("|") === "0 / 2|0 / 2"
);

// ---- the player sees what the team asks --------------------------------------------------------------------
await page.reload();
await page.waitForSelector("#rx-assigned");
check(
  "the player sees the goals of the team above the exercises, with how far they are",
  /Reflex Club/.test(await text(page, "#rx-assigned")) &&
    (await page.locator("#rx-assigned .goal-row").count()) === 2 &&
    (await page.locator("#rx-assigned .goal-row__count").allInnerTexts()).join("|") ===
      "0 / 2|0 / 2"
);
check(
  "a goal that is for one exercise has a link to play it",
  (await page.locator('#rx-assigned a[href="/training/reflex/aim"]').count()) === 1
);

// ---- reaction time: five rounds, the shortest honest run ------------------------------------------------
await page.click('.rx-card[href="/training/reflex/reaction"]');
await page.waitForSelector("[data-start]");
check(
  "an exercise opens with how it is played and how it is scored; only the goal it counts for is shown",
  /green/.test(await text(page, ".rx-how")) &&
    /Lower is better/.test(await text(page, ".rx-how")) &&
    (await page.locator("#rx-assigned .goal-row").count()) === 1 &&
    /not played this one yet/.test(await text(page, ".rx-record"))
);
let since = await start(page);
check(
  "the goals of the teams step aside while a run lasts, so that the stage is the first thing on the page",
  await page.locator("#rx-assigned-slot").isHidden()
);
await page.waitForSelector('.rx-pad[data-state="wait"]');
await page.click(".rx-pad");
check(
  "a hit before the green is refused and the round is played again",
  /Too soon/.test(await text(page, ".rx-pad")) &&
    (await page.getAttribute(".rx-pad", "data-state")) === "soon"
);
for (let round = 1; round <= 5; round += 1) {
  await page.waitForSelector('.rx-pad[data-state="go"]', { timeout: 10_000 });
  if (round === 5) {
    await calm(page, since, "reaction time");
  }
  await page.click(".rx-pad");
  if (round === 1) {
    check(
      "a hit on the green shows the time at once",
      /^\d+ ms/.test(await text(page, ".rx-pad")) &&
        (await page.getAttribute(".rx-pad", "data-state")) === "hit"
    );
  }
}
await waitSaved(page);
check(
  "five rounds end the run: the average time, and the only thing asked of the server is to keep it",
  savedOnce(page, since)
);
const reaction = Number(await page.getAttribute(".rx-result__score", "data-score"));
check(
  "the result is a time in milliseconds, a new best the first time, kept for the player",
  reaction > 0 &&
    reaction < 2000 &&
    /New best/.test(await text(page, "#rx-record")) &&
    (await reflexRuns()).some(run => run.exercise === "reaction" && run.score === reaction)
);
check(
  "the shell may ask again now that the run is over",
  !(await page.evaluate(async () => (await import("/app/app-state.js")).state.quiet))
);
check("the goals are back with the result", await page.locator("#rx-assigned-slot").isVisible());
check(
  "the goal the run counts for moves: one run of the two asked",
  (await text(page, "#rx-assigned-slot .goal-row__count")).includes("1 / 2")
);

// ---- sequence memory --------------------------------------------------------------------------------------
await openExercise(page, "sequence");
// something that moves for ever (a placeholder that is waiting for its data): the run must hold it still
await page.evaluate(() => {
  const probe = document.createElement("div");
  probe.id = "quiet-probe";
  probe.className = "skeleton";
  document.body.append(probe);
});
since = await start(page);
const yourTurn = level =>
  page.waitForFunction(
    wanted =>
      new RegExp(`Level ${wanted}: your turn`).test(
        document.querySelector(".rx-status")?.innerText ?? ""
      ),
    level,
    { timeout: 15_000 }
  );
// started as soon as the page came in: its entrance is not frozen, what moves forever is
await page.waitForTimeout(800);
const frozen = await page.evaluate(() => ({
  card: getComputedStyle(document.querySelector("#rx-stage").closest(".card")).opacity,
  // the light of a placeholder is a layer (::after) that slides: that layer is what holds still
  endless: getComputedStyle(document.querySelector("#quiet-probe"), "::after").animationPlayState
}));
check(
  "a run started as the page comes in shows its card at once; an animation that never ends is paused",
  frozen.card === "1" && frozen.endless === "paused"
);
if (frozen.card !== "1" || frozen.endless !== "paused") {
  console.log(`     card opacity ${frozen.card}, endless animation ${frozen.endless}`);
}
await yourTurn(1);
await page.click('[data-pad="0"]');
await yourTurn(2);
await page.click('[data-pad="0"]');
await page.click('[data-pad="0"]');
await yourTurn(3);
await calm(page, since, "sequence memory");
await page.click('[data-pad="1"]');
await waitSaved(page);
check(
  "sequence memory: two levels repeated, the third missed, the score is the last level done",
  (await page.getAttribute(".rx-result__score", "data-score")) === "2" && savedOnce(page, since)
);

check(
  "and it moves again once the run is over",
  (await page.evaluate(
    () => getComputedStyle(document.querySelector("#quiet-probe"), "::after").animationPlayState
  )) === "running"
);

// ---- the chimp test ---------------------------------------------------------------------------------------------
await openExercise(page, "chimp");
since = await start(page);
await page.waitForSelector(".rx-num");
check(
  "chimp test: four numbers on the board, all of them shown at first",
  (await page.locator(".rx-num").count()) === 4 &&
    (await page.locator(".rx-chimp.rx-hidden").count()) === 0
);
await page.click('[data-n="1"]');
check(
  "once the 1 is touched the others are hidden",
  (await page.locator(".rx-chimp.rx-hidden").count()) === 1
);
for (const number of [2, 3, 4]) {
  await page.click(`[data-n="${number}"]`);
}
await page.waitForFunction(() => document.querySelectorAll(".rx-num").length === 5, null, {
  timeout: 8000
});
check(
  "a cleared board gives a new one with one number more",
  /Touch 1 to 5/.test(await text(page, ".rx-status"))
);
for (let strike = 1; strike <= 3; strike += 1) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".rx-num").length === 5 && !document.querySelector(".rx-num.wrong")
  );
  await frames(page, 1);
  if (strike === 3) {
    await calm(page, since, "chimp test");
  }
  await page.click('[data-n="3"]');
  if (strike < 3) {
    check(
      `touching the wrong number is strike ${strike} of 3`,
      new RegExp(`Strike ${strike} of 3`).test(await text(page, ".rx-status"))
    );
  }
}
await waitSaved(page);
check(
  "chimp test: three strikes end the run, the score is the last board that was cleared",
  (await page.getAttribute(".rx-result__score", "data-score")) === "4" && savedOnce(page, since)
);

// ---- aim ----------------------------------------------------------------------------------------------------------
await openExercise(page, "aim");
since = await start(page);
for (let target = 1; target <= 30; target += 1) {
  await page.waitForFunction(
    wanted =>
      new RegExp(`Target ${wanted} of 30`).test(
        document.querySelector(".rx-status")?.innerText ?? ""
      ),
    target
  );
  await frames(page, 2);
  if (target === 1) {
    // a click in the arena but next to the target is a miss: it adds 150 ms to this target and does not move on
    const arena = await page.locator(".rx-arena").boundingBox();
    await page.mouse.click(arena.x + arena.width - 30, arena.y + arena.height - 30);
    check(
      "aim: a click next to the target is a miss: the arena says so and the target stays",
      (await page.locator(".rx-arena.miss").count()) === 1 &&
        /Target 1 of 30/.test(await text(page, ".rx-status"))
    );
  }
  // the server refuses a run shorter than a person can make: the bot takes its time
  await page.waitForTimeout(120);
  if (target === 30) {
    await calm(page, since, "aim");
  }
  await page.dispatchEvent(".rx-target", "pointerdown");
}
await waitSaved(page);
const aim = Number(await page.getAttribute(".rx-result__score", "data-score"));
check(
  "aim: thirty targets, the score is the average time per target (a miss adds to it)",
  aim >= 5 && aim < 3000 && savedOnce(page, since)
);

// ---- friend or foe -------------------------------------------------------------------------------------------------
await openExercise(page, "discern");
since = await start(page);
let allies = 0,
  enemies = 0;
for (let unit = 1; unit <= 30; unit += 1) {
  await page.waitForSelector(".rx-unit:not([hidden])", { timeout: 5000 });
  await frames(page, 2);
  const kind = await page.getAttribute(".rx-unit", "data-kind");
  if (unit === 30) {
    await calm(page, since, "friend or foe");
  }
  await page.dispatchEvent(".rx-unit", "pointerdown");
  if (unit === 1 || unit === 4) {
    check(
      `friend or foe: the ${kind} that is hit is marked ${kind === "enemy" ? "as a good hit" : "as a mistake"}`,
      (await page.locator(kind === "enemy" ? ".rx-unit.good" : ".rx-unit.bad").count()) === 1
    );
  }
  if (kind === "enemy") {
    enemies += 1;
  } else {
    allies += 1;
  }
  await page
    .waitForFunction(
      () =>
        document.querySelector(".rx-unit")?.hidden !== false ||
        document.querySelector(".rx-result") !== null,
      null,
      { timeout: 5000 }
    )
    .catch(() => {});
}
await waitSaved(page);
const discern = Number(await page.getAttribute(".rx-result__score", "data-score"));
check(
  "friend or foe: thirty units, 250 ms for each ally that was hit is added to the average time",
  allies + enemies === 30 &&
    allies > enemies &&
    discern >= allies * 250 &&
    discern < allies * 250 + 1100 &&
    savedOnce(page, since)
);

// ---- skill keys ------------------------------------------------------------------------------------------------------
await openExercise(page, "inputs");
since = await start(page);
for (let prompt = 1; prompt <= 15; prompt += 1) {
  await page.waitForFunction(
    wanted =>
      new RegExp(`Prompt ${wanted} of 15`).test(
        document.querySelector(".rx-status")?.innerText ?? ""
      ),
    prompt
  );
  await frames(page, 2);
  const keys = await page.locator(".rx-prompt li").allInnerTexts();
  if (prompt === 1) {
    check(
      "skill keys: four different keys in a row, the first is the one to press",
      keys.length === 4 && keys.every((key, at) => at === 0 || key !== keys[at - 1])
    );
    await page.keyboard.press(keys[0] === "4" ? "1" : "4");
    check(
      "a wrong key is shown and does not move on",
      (await page.locator('.rx-prompt li[data-state="now"]').count()) === 1 &&
        (await page.locator('.rx-prompt li[data-state="done"]').count()) === 0
    );
  }
  for (const [at, key] of keys.entries()) {
    if (prompt === 15 && at === keys.length - 1) {
      await calm(page, since, "skill keys");
    }
    await page.keyboard.press(key);
  }
  // the server refuses a run shorter than a person can make: the bot takes its time
  await page.waitForTimeout(600);
}
await waitSaved(page);
const inputs = Number(await page.getAttribute(".rx-result__score", "data-score"));
check(
  "skill keys: fifteen prompts typed with the keyboard, the wrong key of the first is in the score",
  inputs > 20 && inputs < 5000 && savedOnce(page, since)
);

// ---- last hit ---------------------------------------------------------------------------------------------------------
await openExercise(page, "lasthit");
since = await start(page);
await page.waitForFunction(
  () => document.querySelector(".rx-life-fill")?.style.transform !== "scaleX(1)",
  null,
  { timeout: 5000 }
);
await page.waitForTimeout(1000);
await page.click(".rx-strike");
// the verdict is drawn in capitals (innerText gives what is drawn): the words are what is read, not their case
await page.waitForFunction(() =>
  /ms (early|late)|Dead on/i.test(document.querySelector(".rx-verdict")?.innerText ?? "")
);
const verdict = await text(page, ".rx-verdict");
const off = Number(/(\d+) ms/i.exec(verdict)?.[1] ?? 0);
check(
  "last hit: a strike near the notch says how far off it was, early or late",
  off < 450 && !/gone/i.test(verdict)
);
await page.waitForFunction(
  () => /Minion 2 of 10/.test(document.querySelector(".rx-status")?.innerText ?? ""),
  null,
  { timeout: 5000 }
);
await page.waitForFunction(
  () =>
    /Too late: the minion is gone/i.test(document.querySelector(".rx-verdict")?.innerText ?? ""),
  null,
  { timeout: 6000 }
);
check(
  "a minion that is not struck is lost, and counts as the worst strike (late)",
  (await page.getAttribute(".rx-verdict", "data-side")) === "late"
);
await calm(page, since, "last hit");
await page.click("[data-quit]");
await page.waitForSelector("[data-start]");
check(
  "Stop leaves the run: nothing was kept, nothing but the video was asked, the page moves again",
  afterStart(page, since).every(call => call === BACKGROUND) &&
    !(await page.evaluate(() => document.documentElement.classList.contains("is-quiet"))) &&
    !(await reflexRuns()).some(run => run.exercise === "lasthit") &&
    !(await page.evaluate(async () => (await import("/app/app-state.js")).state.quiet))
);

// ---- tracking, with real balls --------------------------------------------------------------------------------
const tracker = await open(player, { steady: false });
await openExercise(tracker, "tracking");
// a page that has just been opened: the shell asks for the video behind it a little after the first move
// of the pointer (1.2 s, once idle), which is its business and not the run's: let it be over first
await tracker.waitForTimeout(2600);
since = await start(tracker);
await tracker.waitForFunction(() => document.querySelectorAll(".rx-ball.hot").length === 3);
const lit = await tracker
  .locator(".rx-ball.hot")
  .evaluateAll(nodes => nodes.map(node => node.dataset.ball));
check(
  "tracking: three balls are lit to begin with, ten balls in the field",
  lit.length === 3 && (await tracker.locator(".rx-ball").count()) === 10
);
await tracker.waitForFunction(() => document.querySelectorAll(".rx-ball.hot").length === 0, null, {
  timeout: 8000
});
await tracker.waitForFunction(
  () => /Touch the balls you followed/.test(document.querySelector(".rx-status")?.innerText ?? ""),
  null,
  { timeout: 12_000 }
);
for (const ball of lit) {
  await tracker.dispatchEvent(`[data-ball="${ball}"]`, "pointerdown");
}
await tracker.waitForFunction(() =>
  /Found them all/.test(document.querySelector(".rx-status")?.innerText ?? "")
);
await tracker.waitForFunction(
  () => /\(4\)/.test(document.querySelector(".rx-status")?.innerText ?? ""),
  null,
  { timeout: 6000 }
);
check(
  "tracking: the right three are found, the next level has four to follow",
  (await tracker.locator(".rx-ball.hot").count()) === 4
);
await calm(tracker, since, "tracking");
await tracker.click("[data-quit]");
await tracker.waitForSelector("[data-start]");
check(
  "and the run that is left is not kept: nothing was asked but the video, once it was over",
  afterStart(tracker, since).every(call => call === BACKGROUND)
);

// ---- leaving a run by another link ------------------------------------------------------------------------
await openExercise(page, "inputs");
await start(page);
// while a run lasts the screen is the run's (the top bar and the tab bar are under it): the ways out are Stop, Escape and the
// Back button of the browser
await page.goBack();
await page.waitForSelector(".rx-card");
await page.keyboard.press("1");
await page.keyboard.press("2");
await page.waitForTimeout(700);
check(
  "leaving an exercise by the Back button stops it: no key reaches it any more and the shell is free",
  !(await page.evaluate(async () => (await import("/app/app-state.js")).state.quiet))
);
check(
  "a run covers the page and the menu is under it: nothing at the centre of the top bar is the bar",
  await (async () => {
    await openExercise(page, "inputs");
    await start(page);
    const covered = await page.evaluate(() => {
      const bar = document.querySelector(".topbar").getBoundingClientRect();
      const hit = document.elementFromPoint(bar.x + bar.width / 2, bar.y + bar.height / 2);
      return (
        Boolean(hit?.closest(".rx-play")) &&
        getComputedStyle(document.documentElement).overflow === "hidden"
      );
    });
    return covered;
  })()
);
await page.keyboard.press("Escape");
await page.waitForSelector("[data-start]");
check(
  "Escape leaves the run: the first page of the exercise is back, nothing was kept, the shell is free",
  !(await page.evaluate(async () => (await import("/app/app-state.js")).state.quiet)) &&
    !(await page.evaluate(() => document.querySelector(".is-running"))) &&
    (await reflexRuns()).length === 6
);

// ---- what was kept and what the team sees -----------------------------------------------------------------
await page.goto(`${app.baseUrl}/training/reflex`);
await page.waitForSelector(".rx-card");
const played = await reflexRuns();
check(
  "six runs were kept for the player (the ones that were played to the end)",
  played.length === 6 &&
    ["reaction", "sequence", "chimp", "aim", "discern", "inputs"].every(id =>
      played.some(run => run.exercise === id)
    )
);
check(
  "the list shows the best of each exercise and today's work",
  (await page.locator(".rx-card__best b").count()) === 6 &&
    /6 runs/.test(await text(page, ".rx-stats")) &&
    /1 day/.test(await text(page, ".rx-stats"))
);
check(
  "the goals of the team show the progress: the day's two runs are done, the aim goal is not",
  (await page.locator("#rx-assigned .goal-row.is-done").count()) === 1 &&
    (await text(page, "#rx-assigned")).includes("6 / 2") &&
    (await text(page, "#rx-assigned")).includes("0 / 2")
);

await staff.reload();
await staff.waitForSelector('[data-team="tab"][data-tab="training"]');
await staff.click('[data-team="tab"][data-tab="training"]');
await staff.waitForSelector("#team-progress .goal-cell");
check(
  "the coach sees it too: the player has done the daily goal, not yet the aim goal",
  (await staff.locator("#team-progress .goal-cell").allInnerTexts())
    .map(cell => cell.trim())
    .join("|") === "6 / 2|0 / 2" &&
    (await staff.locator("#team-progress .goal-cell.is-done").count()) === 1
);

const member = await open(player, { steady: false });
await member.goto(`${app.baseUrl}/teams/${teamId}`);
await member.waitForSelector('[data-team="tab"][data-tab="training"]');
await member.click('[data-team="tab"][data-tab="training"]');
await member.waitForSelector("#team-progress");
check(
  "the player sees their own line and cannot change the goals",
  /Your progress/.test(await textOf(member, "#team-progress")) &&
    (await member.locator("#goal-form").count()) === 0 &&
    (await member.locator('#team-goals [data-team="goal-edit"]').count()) === 0 &&
    (await member.locator("#team-progress .goal-table tbody tr").count()) === 1
);
const stranger = await app.signIn("Stranger");
const outside = await open(stranger, { steady: false });
await outside.goto(`${app.baseUrl}/teams/${teamId}`);
await outside.waitForSelector(".teams-tabs");
check(
  "somebody who is not in the team has no Training tab",
  (await outside.locator('[data-team="tab"][data-tab="training"]').count()) === 0
);

// ---- phone width --------------------------------------------------------------------------------------------------
const phone = await open(player, { width: 390 });
await phone.goto(`${app.baseUrl}/training/reflex`);
await phone.waitForSelector(".rx-card");
check("the list of exercises has no horizontal scroll on a phone", await noSideScroll(phone));
for (const id of ["reaction", "sequence", "chimp", "aim", "discern", "lasthit", "inputs"]) {
  await openExercise(phone, id);
  await phone.click("[data-start]");
  await phone.waitForSelector("#rx-stage");
  await frames(phone, 3);
  check(`${id}: the stage fits a phone`, await noSideScroll(phone));
  await phone.click("[data-quit]");
}
const phoneTracker = await open(player, { width: 390, steady: false });
await openExercise(phoneTracker, "tracking");
await phoneTracker.click("[data-start]");
await phoneTracker.waitForSelector(".rx-ball");
check("tracking: the field fits a phone", await noSideScroll(phoneTracker));
const phoneTeam = await open(coach, { width: 390, steady: false });
await phoneTeam.goto(`${app.baseUrl}/teams/${teamId}`);
await phoneTeam.waitForSelector('[data-team="tab"][data-tab="training"]');
await phoneTeam.click('[data-team="tab"][data-tab="training"]');
await phoneTeam.waitForSelector("#team-progress .goal-cell");
check(
  "the training tab of a team (goals and progress table) fits a phone",
  await noSideScroll(phoneTeam)
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nreflex e2e clean");
process.exit(problems.length ? 1 : 0);
