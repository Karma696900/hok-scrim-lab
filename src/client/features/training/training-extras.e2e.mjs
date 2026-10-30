// Browser check of what the training area gained after the reflex exercises: routines (several
// exercises one after the other), the ranking of a team, the hero goals of a team, the daily review of
// combos and the notes about a video. Phone width has no horizontal scroll.
//
// The random numbers of the pages are fixed (always 0) so that the exercises are the same each time.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const player = await app.signIn("Dan");

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
  page.traffic = [];
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) {
      page.traffic.push(`${request.method()} ${pathname}`);
    }
  });
  page.on("console", message => {
    // asking twice for the same hero (409) and a link that is not https (400) are refused on
    // purpose, and the page says so
    if (
      ["error", "warning"].includes(message.type()) &&
      !/Failed to load resource.*(400|409)/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};
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
const runsOf = async who =>
  (
    await app.store.pool.query(
      "SELECT exercise, score FROM reflex_runs WHERE user_id = ? ORDER BY created_at",
      [who.user.id]
    )
  )[0];
const notesOf = async (who, kind) =>
  Number(
    (
      await app.store.pool.query(
        "SELECT COUNT(*) AS n FROM training_notes WHERE user_id = ? AND kind = ?",
        [who.user.id, kind]
      )
    )[0][0].n
  );
const SAVE = "POST /api/training/reflex/runs";
const BACKGROUND = "GET /api/backgrounds";

// ---- routines -------------------------------------------------------------------------------------------
const page = await open(player);
await page.goto(`${app.baseUrl}/training/reflex`);
await page.waitForSelector(".rx-card");
check(
  "the list of exercises offers the routines, and nothing is marked as played today yet",
  (await page.locator('.rx-banner a[href="/training/reflex/routine"]').count()) === 1 &&
    (await page.locator(".rx-card__done").count()) === 0
);
await page.click('.rx-banner a[href="/training/reflex/routine"]');
await page.waitForSelector(".rx-routine");
check(
  "the routines page has four routines, each with its exercises and a start button",
  (await page.locator(".rx-routine").count()) === 4 &&
    (await page.locator(".rx-routine [data-routine]").count()) === 4 &&
    /8 exercises/.test(await text(page, '.rx-routine:has([data-routine="everything"])')) &&
    (await page
      .locator('.rx-routine:has([data-routine="warmup"]) .rx-routine__steps li')
      .count()) === 3
);
await page.check('#rx-custom input[value="sequence"]');
await page.click('#rx-custom button[type="submit"]');
check(
  "a routine of one exercise is refused: it would only be the exercise",
  /at least two/.test(await text(page, "#rx-custom-error"))
);

// the routine of one's own: the sequence, then the chimp test (the two shortest to lose)
await page.check('#rx-custom input[value="chimp"]');
await page.click('#rx-custom button[type="submit"]');
await page.waitForSelector(".rx-steps");
check(
  "starting it shows where it stands: two steps, the first is the current one, and the exercise intro",
  (await page.locator(".rx-steps li").count()) === 2 &&
    (await page.locator(".rx-steps li.is-now").innerText()).includes("Sequence memory") &&
    (await page.locator(".rx-steps li.is-done").count()) === 0 &&
    /How it is played/.test(await textOf(page, "#rx-area"))
);
check(
  "the intro of a step offers to start, to skip it and to stop the routine, not the list of exercises",
  (await page.locator("[data-start]").count()) === 1 &&
    (await page.locator("[data-routine-next]").count()) === 1 &&
    (await page.locator("[data-routine-stop]").count()) === 1 &&
    (await page.locator('#rx-area a[href="/training/reflex"]').count()) === 0
);
let since = page.traffic.length;
await page.click("[data-start]");
await page.waitForFunction(
  () => /your turn/.test(document.querySelector(".rx-status")?.innerText ?? ""),
  null,
  {
    timeout: 15_000
  }
);
await page.click('[data-pad="1"]');
await page.waitForSelector(".rx-result", { timeout: 15_000 });
check(
  "the result of a step has its next step as the main button, disabled until the run is saved",
  /Next: Chimp test/.test(await textOf(page, ".rx-result [data-routine-next]"))
);
await page.waitForFunction(() =>
  /Saved\./.test(document.querySelector("#rx-saved")?.innerText ?? "")
);
check(
  "once saved the next step can be started: it is enabled and has the focus; the only request was the save",
  (await page.locator("[data-routine-next]").isEnabled()) &&
    (await page.evaluate(() => document.activeElement?.hasAttribute("data-routine-next"))) &&
    page.traffic
      .slice(since)
      .filter(call => call !== BACKGROUND)
      .join("|") === SAVE
);
await page.click("[data-routine-next]");
await page.waitForSelector("[data-start]");
check(
  "the next step is the chimp test: the first step is marked done, the second is the current one",
  (await page.locator(".rx-steps li.is-done").innerText()).includes("Sequence memory") &&
    (await page.locator(".rx-steps li.is-now").innerText()).includes("Chimp test") &&
    /Chimp test/.test(await textOf(page, "h1"))
);
since = page.traffic.length;
await page.click("[data-start]");
for (let strike = 1; strike <= 3; strike += 1) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".rx-num").length === 4 && !document.querySelector(".rx-num.wrong")
  );
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  await page.click('[data-n="2"]');
}
await page.waitForSelector(".rx-result", { timeout: 15_000 });
check(
  "the last step ends on 'See how you did' instead of a next step",
  /See how you did/.test(await textOf(page, ".rx-result [data-routine-end]")) &&
    (await page.locator("[data-routine-next]").count()) === 0
);
await page.waitForFunction(() =>
  /Saved\./.test(document.querySelector("#rx-saved")?.innerText ?? "")
);
check(
  "the chimp run asked nothing of the server but its save",
  page.traffic
    .slice(since)
    .filter(call => call !== BACKGROUND)
    .join("|") === SAVE
);
await page.click("[data-routine-end]");
await page.waitForSelector("#rx-routine-summary");
check(
  "the summary lists the two exercises with their scores",
  /Routine complete/.test(await textOf(page, "h1")) &&
    (await page.locator("#rx-routine-summary tbody tr").count()) === 2 &&
    /Sequence memory/.test(await text(page, "#rx-routine-summary")) &&
    /Chimp test/.test(await text(page, "#rx-routine-summary"))
);
const kept = await runsOf(player);
check(
  "both runs were kept for the player, in the order they were played",
  kept.map(entry => entry.exercise).join() === "sequence,chimp"
);
await page.click('.rx-actions a[href="/training/reflex"]');
await page.waitForSelector(".rx-card");
check(
  "back on the list, the two exercises are marked as played today and the others are not",
  (await page.locator(".rx-card__done").count()) === 2 &&
    (await page.locator('.rx-card[href="/training/reflex/sequence"] .rx-card__done').count()) ===
      1 &&
    (await page.locator('.rx-card[href="/training/reflex/chimp"] .rx-card__done').count()) === 1
);

// skipping and stopping
await page.goto(`${app.baseUrl}/training/reflex/routine`);
await page.waitForSelector(".rx-routine");
check(
  "the routines page ticks the exercises that were played today",
  (await page.locator('.rx-routine:has([data-routine="focus"]) li.is-done').count()) === 2
);
since = page.traffic.length;
await page.click('[data-routine="focus"]');
await page.waitForSelector(".rx-steps");
check(
  "a routine of the list has its three steps",
  (await page.locator(".rx-steps li").count()) === 3
);
await page.click("[data-routine-next]");
await page.waitForSelector('.rx-steps li.is-now:has-text("Chimp test")');
check(
  "skipping an exercise goes to the next one without playing anything",
  (await runsOf(player)).length === 2 && !page.traffic.slice(since).includes(SAVE)
);
await page.click("[data-routine-stop]");
await page.waitForSelector(".rx-card");
check(
  "stopping the routine goes back to the list; nothing was kept",
  /\/training\/reflex$/.test(page.url()) && (await runsOf(player)).length === 2
);

// ---- a team: its owner, a coach and two players -------------------------------------------------------
const owner = await app.signIn("Boss");
const coach = await app.signIn("Cleo");
const eve = await app.signIn("Eve");
const teamId = (
  await owner.browser.post("/api/teams", {
    name: "Extras Club",
    tag: "XTRA",
    description: "",
    region: "EU",
    timezone: "UTC+1",
    languages: ["en"],
    level: "amateur"
  })
).body.id;
for (const [who, role] of [
  [coach, "coach"],
  [player, "player"],
  [eve, "player"]
]) {
  await app.store.pool.execute(
    "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, '', ?)",
    [teamId, who.user.id, role, Date.now()]
  );
}
const openTraining = async (page, who = null) => {
  await page.goto(`${app.baseUrl}/teams/${teamId}`);
  await page.waitForSelector('[data-team="tab"][data-tab="training"]');
  await page.click('[data-team="tab"][data-tab="training"]');
  await page.waitForSelector("#team-goals");
  return who;
};

// ---- the ranking of a team ---------------------------------------------------------------------------------
await eve.browser.post("/api/training/reflex/runs", {
  exercise: "reaction",
  score: 240,
  durationMs: 20000
});
await player.browser.post("/api/training/reflex/runs", {
  exercise: "reaction",
  score: 250,
  durationMs: 20000
});
await app.store.pool.execute(
  "INSERT INTO reflex_runs (id, user_id, exercise, score, duration_ms, created_at) VALUES (UUID(), ?, 'reaction', 200, 20000, ?)",
  [eve.user.id, Date.now() - 30 * 86_400_000]
);
const staff = await open(coach, { steady: false });
await openTraining(staff);
await staff.waitForSelector("#team-ranking-body tbody tr");
check(
  "the staff has a ranking card: the exercise and the period are chosen, the best of each player is listed",
  (await staff.locator("#team-ranking").count()) === 1 &&
    (await staff.inputValue("#rank-exercise")) === "reaction" &&
    (await staff.locator('[data-team="rank-period"].on').innerText()) === "This week" &&
    (await staff.locator("#team-ranking-body tbody tr").count()) === 2
);
check(
  "lowest time first: Eve is first with 240 ms (the run of last month is left out this week), then Dan",
  (await staff.locator("#team-ranking-body tbody tr").first().innerText()).includes("Eve") &&
    (await staff.locator("#team-ranking-body tbody tr").first().innerText()).includes("240 ms") &&
    (await staff.locator("#team-ranking-body .rank-place").allInnerTexts()).join() === "1,2"
);
await staff.click('[data-team="rank-period"][data-period="all"]');
await staff.waitForFunction(() =>
  /200 ms/.test(document.querySelector("#team-ranking-body tbody")?.innerText ?? "")
);
check(
  "over all time the old run counts: Eve's best is 200 ms now",
  (await staff.locator('[data-team="rank-period"].on').innerText()) === "All time" &&
    (await staff.locator("#team-ranking-body tbody tr").first().innerText()).includes("200 ms")
);
await staff.selectOption("#rank-exercise", "lasthit");
await staff.waitForFunction(() =>
  /Nobody has played this exercise yet/.test(
    document.querySelector("#team-ranking-body")?.innerText ?? ""
  )
);
await staff.click('[data-team="rank-period"][data-period="week"]');
await staff.waitForFunction(() =>
  /Nobody has played this exercise this week/.test(
    document.querySelector("#team-ranking-body")?.innerText ?? ""
  )
);
check("an exercise nobody played says so, for the period that is chosen", true);
check(
  "the staff decides who sees it: the box is not ticked at first",
  !(await staff.isChecked("#rank-visible"))
);

// a player, before and after the staff opens the ranking
const dan = await open(player, { steady: false });
await openTraining(dan);
check(
  "a player sees no ranking while the staff keeps it for itself, and has no box to open it",
  (await dan.locator("#team-ranking").count()) === 0 &&
    (await dan.locator("#rank-visible").count()) === 0
);
const opened = staff.waitForResponse(
  reply =>
    reply.url().endsWith(`/teams/${teamId}/training/settings`) && reply.request().method() === "PUT"
);
await staff.check("#rank-visible");
check("ticking the box opens the ranking to the players", (await opened).status() === 200);
await dan.reload();
await dan.waitForSelector("#team-ranking", { state: "attached" });
await dan.click('[data-team="tab"][data-tab="training"]');
await dan.waitForSelector("#team-ranking-body tbody tr");
check(
  "the player now sees it, finds their own line marked, and still has no box to change it",
  (await dan.locator("#team-ranking-body tr.is-me").innerText()).includes("Dan") &&
    (await dan.locator("#rank-visible").count()) === 0
);
await staff.uncheck("#rank-visible");
await dan.reload();
await dan.waitForSelector("#team-goals", { state: "attached" });
check(
  "unticking closes it again for the players",
  (await dan.locator("#team-ranking").count()) === 0
);

// ---- the hero goals of a team and the daily check of the combos ------------------------------------------
const skill = (id, index, name) => ({
  id,
  index,
  type: "skill",
  label: `Skill ${index}`,
  name,
  icon: null,
  description: [{ t: `${name}.`, c: null }],
  cost: null,
  cooldownSeconds: 5,
  tags: [],
  video: null
});
for (const id of ["h01", "h02"]) {
  await app.store.saveHeroDetails(id, {
    schema: 1,
    skills: [skill("1101", 1, "Dash"), skill("1102", 2, "Slam")],
    adjustments: [],
    adjustmentsDetailed: false,
    world: { region: "", identity: "", height: "", energy: "", video: null },
    mainClass: "",
    minorClass: "",
    lane: "",
    listedAt: null,
    gallery: [],
    art: {}
  });
}
const editor = await app.signIn("Chief", { admin: true });
const writeCombos = async (heroId, names) => {
  const ids = [];
  for (const name of names) {
    const created = await editor.browser.post(`/api/combos/${heroId}`, {
      name,
      steps: [{ skillId: "1101", hint: "then" }, { skillId: "1102" }]
    });
    ids.push(created.body.id);
  }
  return ids;
};

await openTraining(staff);
check(
  "no combo is written yet: the hero goals say where the combos come from and offer no form",
  (await staff.locator("#team-hero-goals").count()) === 1 &&
    (await staff.locator("#hero-goal-form").count()) === 0 &&
    /No hero has a combo yet/.test(await text(staff, "#team-hero-goals")) &&
    /No goal about a hero yet/.test(await text(staff, "#team-hero-goals"))
);
const [firstCombo, secondCombo] = await writeCombos("h01", ["Opener", "Burst", "Escape"]);
await writeCombos("h02", ["Poke", "Reset"]);
await openTraining(staff);
check(
  "once combos exist the form lists the heroes that have some, with how many each",
  (await staff.locator("#hero-goal-hero option").allInnerTexts()).join("|") ===
    "Hero h01 · 3 combos|Hero h02 · 2 combos"
);
await staff.selectOption("#hero-goal-hero", "h01");
await staff.click('#hero-goal-form button[type="submit"]');
await staff.waitForSelector("#team-hero-goals .goal-row");
const askedRow = await text(staff, "#team-hero-goals .goal-row");
check(
  "asking for a hero adds its line (hero, form, number of combos) and counts it in the card",
  (await staff.locator("#team-hero-goals .goal-row").count()) === 1 &&
    askedRow.includes("Hero h01") &&
    askedRow.includes("Both forms") &&
    askedRow.includes("3 combos") &&
    (await text(staff, "#team-hero-goals .card__head")).includes("1 / 10")
);
check(
  "the progress table gets a column for the hero; the two players asked to train start at 0 / 3",
  (await text(staff, "#team-progress thead")).includes("Hero h01") &&
    (await staff.locator("#team-progress tbody tr").count()) === 2 &&
    (await staff.locator("#team-progress tbody .goal-cell").allInnerTexts()).join("|") ===
      "0 / 3|0 / 3"
);
await staff.click('#hero-goal-form button[type="submit"]');
await staff.waitForFunction(() =>
  /already asks/.test(document.querySelector("#hero-goal-error")?.innerText ?? "")
);
check(
  "asking again for the same hero in the same form is refused, and the reason is written",
  (await staff.locator("#team-hero-goals .goal-row").count()) === 1
);

// the player: what the team asks, then what to learn, with the combos of the hero below
const train = await open(player, { steady: false });
await train.goto(`${app.baseUrl}/training`);
await train.waitForSelector("#train-assigned");
const asks = await text(train, "#train-assigned");
check(
  "the player's page starts with what the team asks: team, hero, form, progress, a Practise button",
  asks.includes("Extras Club") &&
    asks.includes("Hero h01") &&
    asks.includes("Both forms") &&
    asks.includes("0 / 3") &&
    (await train.locator('#train-assigned [data-practise="h01"]').count()) === 1
);
check(
  "nothing is due yet; the three combos of the asked hero are offered to learn, with their steps",
  /Nothing to check today/.test(await text(train, "#train-review")) &&
    (await train.locator("#train-learn .review-row").count()) === 3 &&
    (await text(train, "#train-learn .card__head")).includes("3") &&
    (await train.locator("#train-learn .review-row").first().locator(".combo-step").count()) === 2
);
await train.click('#train-assigned [data-practise="h01"]');
await train.waitForSelector(".combo-train");
check(
  "Practise opens the combos of the hero below the cards",
  (await train.locator(".combo-train").count()) === 3
);
const tick = async (index, form) => {
  const [reply] = await Promise.all([
    train.waitForResponse(
      call => call.request().method() === "PUT" && call.url().includes("/api/training/combos/")
    ),
    train.locator(".combo-train").nth(index).locator(`[data-form="${form}"]`).click()
  ]);
  return reply.status();
};
check("ticking the normal form of the first combo is saved", (await tick(0, "normal")) === 200);
await train.waitForFunction(
  () => document.querySelectorAll("#train-learn .review-row").length === 2
);
check(
  "the combo leaves the list to learn at once; the goal still needs the other form (0 / 3)",
  (await text(train, "#train-assigned .goal-row__count")) === "0 / 3"
);
check("ticking the other form is saved", (await tick(0, "animationCancel")) === 200);
await train.waitForFunction(
  () => document.querySelector("#train-assigned .goal-row__count")?.innerText === "1 / 3"
);
check(
  "with both forms ticked the goal moves to 1 / 3 without reloading the page",
  (await train.locator(".combo-train").count()) === 3
);
const [scheduled] = await app.store.pool.query(
  "SELECT box, due_at FROM combo_reviews WHERE user_id = ?",
  [player.user.id]
);
check(
  "the combo joined the schedule in the first box, to be checked again in about a day",
  scheduled.length === 1 &&
    Number(scheduled[0].box) === 1 &&
    Math.abs(Number(scheduled[0].due_at) - Date.now() - 86_400_000) < 120_000
);

// the staff sees the progress of each player; a player sees their own line and cannot change the goals
await openTraining(staff);
check(
  "the staff's table follows: one combo done by Dan, none by Eve",
  (await text(staff, '#team-progress tbody tr:has-text("Dan") .goal-cell')) === "1 / 3" &&
    (await text(staff, '#team-progress tbody tr:has-text("Eve") .goal-cell')) === "0 / 3"
);
await openTraining(dan);
check(
  "a player sees the hero goal and their own progress, with no form and no delete button",
  (await dan.locator("#team-hero-goals .goal-row").count()) === 1 &&
    (await dan.locator('#team-hero-goals [data-team="hero-goal-delete"]').count()) === 0 &&
    (await dan.locator("#hero-goal-form").count()) === 0 &&
    (await dan.locator("#team-progress tbody tr").count()) === 1 &&
    (await text(dan, "#team-progress .goal-cell")) === "1 / 3"
);

// a combo whose day has come is listed to check
await app.store.pool.execute("UPDATE combo_reviews SET due_at = ? WHERE user_id = ?", [
  Date.now() - 60_000,
  player.user.id
]);
await train.reload();
await train.waitForSelector("#train-review .review-row");
const dueRow = await text(train, "#train-review .review-row");
check(
  "the combo is listed to check today with its hero, its steps and the two answers",
  dueRow.includes("Opener") &&
    dueRow.includes("Hero h01") &&
    (await train.locator("#train-review .combo-step").count()) === 2 &&
    (await train.locator('#train-review [data-answer="sharp"]').count()) === 1 &&
    (await train.locator('#train-review [data-answer="rusty"]').count()) === 1 &&
    (await text(train, "#train-review .card__head")).includes("1") &&
    (await train.locator("#train-learn .review-row").count()) === 2
);
const narrow = await open(player, { width: 390 });
await narrow.goto(`${app.baseUrl}/training`);
await narrow.waitForSelector("#train-review .review-row");
check(
  "the cards (asked heroes, combo to check, combos to learn) fit a phone",
  (await narrow.locator("#train-learn .review-row").count()) === 2 && (await noSideScroll(narrow))
);
await train.click('#train-review [data-answer="sharp"]');
await train.waitForFunction(() =>
  /Nothing to check today/.test(document.querySelector("#train-review")?.innerText ?? "")
);
const [afterSharp] = await app.store.pool.query(
  "SELECT box, due_at FROM combo_reviews WHERE user_id = ? AND combo_id = ?",
  [player.user.id, firstCombo]
);
check(
  "'Still sharp' moves it to the second box, says when it comes back, and takes it off the list",
  /You will see it again in 3 days/.test(await text(train, "#toasts")) &&
    Number(afterSharp[0].box) === 2 &&
    Math.abs(Number(afterSharp[0].due_at) - Date.now() - 3 * 86_400_000) < 120_000
);

// 'Rusty' starts the combo over; a combo acquired in one form only is checked too
await player.browser.put(`/api/training/combos/${secondCombo}`, { normal: true });
await app.store.pool.execute(
  "UPDATE combo_reviews SET box = 3, due_at = ? WHERE user_id = ? AND combo_id = ?",
  [Date.now() - 60_000, player.user.id, secondCombo]
);
await train.reload();
await train.waitForSelector('#train-review [data-answer="rusty"]');
check(
  "the combo acquired in one form is listed as well, and only one combo is left to learn",
  (await text(train, "#train-review .review-row")).includes("Burst") &&
    (await train.locator("#train-learn .review-row").count()) === 1
);
await train.click('#train-review [data-answer="rusty"]');
await train.waitForFunction(() =>
  /Nothing to check today/.test(document.querySelector("#train-review")?.innerText ?? "")
);
const [afterRusty] = await app.store.pool.query(
  "SELECT box, due_at FROM combo_reviews WHERE user_id = ? AND combo_id = ?",
  [player.user.id, secondCombo]
);
check(
  "'Rusty' starts it again from the first box, for tomorrow",
  /You will see it again in 1 day/.test(await text(train, "#toasts")) &&
    Number(afterRusty[0].box) === 1 &&
    Math.abs(Number(afterRusty[0].due_at) - Date.now() - 86_400_000) < 120_000
);

// a second hero in one form only, then the goals are removed
await staff.selectOption("#hero-goal-hero", "h02");
await staff.selectOption("#hero-goal-form-kind", "normal");
await staff.click('#hero-goal-form button[type="submit"]');
await staff.waitForFunction(
  () => document.querySelectorAll("#team-hero-goals .goal-row").length === 2
);
check(
  "a second hero asked in one form only: two lines, each names its form",
  /Normal/.test(await text(staff, '#team-hero-goals .goal-row:has-text("Hero h02")')) &&
    /Both forms/.test(await text(staff, '#team-hero-goals .goal-row:has-text("Hero h01")'))
);
await train.reload();
await train.waitForSelector("#train-assigned");
check(
  "the player's card lists both heroes with their own progress",
  (await train.locator("#train-assigned .goal-row").count()) === 2 &&
    (await train.locator("#train-assigned .goal-row__count").allInnerTexts()).join("|") ===
      "1 / 3|0 / 2"
);
for (const hero of ["h01", "h02"]) {
  staff.once("dialog", dialog => dialog.accept());
  await staff.click(
    `#team-hero-goals .goal-row:has-text("Hero ${hero}") [data-team="hero-goal-delete"]`
  );
  await staff.waitForFunction(
    count => document.querySelectorAll("#team-hero-goals .goal-row").length === count,
    hero === "h01" ? 1 : 0
  );
}
check(
  "deleting the goals empties the list and the progress card has nothing to follow",
  /No goal about a hero yet/.test(await text(staff, "#team-hero-goals")) &&
    /Nothing to follow until a goal is set/.test(await text(staff, "#team-progress"))
);
await train.reload();
await train.waitForSelector("#train-cards", { state: "attached" });
check(
  "the player no longer has the card of asked heroes; with nothing due and nothing to learn, no card at all",
  (await train.locator("#train-assigned").count()) === 0 &&
    (await train.locator("#train-learn").count()) === 0 &&
    (await train.locator("#train-cards").isHidden())
);
await openTraining(dan);
check(
  "a player of the team is told the staff has not asked anything about heroes",
  /The staff has not asked anything about the heroes yet/.test(await text(dan, "#team-hero-goals"))
);

// ---- the review of a video in the notebook ----------------------------------------------------------------
const book = await open(player, { steady: false });
await book.goto(`${app.baseUrl}/training/notebook`);
await book.waitForSelector("#trn-notes");
await book.click("[data-new]");
await book.selectOption("#note-kind", "vod");
await book.waitForSelector("#note-url");
check(
  "choosing a video review adds the link and the moments; it needs a hero; its statuses are for a video",
  (await book.locator("#note-marks").count()) === 1 &&
    (await book.locator('#note-hero option[value=""]').count()) === 0 &&
    (await book.locator("#note-status option").allInnerTexts()).join("|") ===
      "To watch|Being reviewed|Reviewed" &&
    (await book.locator("#note-marks").getAttribute("aria-describedby")) === "note-marks-help"
);
await book.fill("#note-title", "Scrim vs Wolves");
await book.selectOption("#note-hero", "h01");
await book.fill("#note-url", "http://youtu.be/abc123");
await book.click('#note-form button[type="submit"]');
await book.waitForFunction(() =>
  /https/.test(document.querySelector("#note-error")?.innerText ?? "")
);
check(
  "a link that is not https is refused by the server, with the reason, and nothing is kept",
  (await book.locator("#note-form").count()) === 1 && (await notesOf(player, "vod")) === 0
);
await book.fill("#note-url", "https://www.youtube.com/watch?v=abc123");
await book.fill("#note-marks", "12:30 late rotation\n0:45 early ping\nnot a time");
since = book.traffic.length;
await book.click('#note-form button[type="submit"]');
check(
  "a moment that cannot be read is named by its line, and nothing is sent",
  /Line 3: write a time such as 12:30/.test(await text(book, "#note-error")) &&
    book.traffic.slice(since).filter(call => call.startsWith("POST /api/training/notes")).length ===
      0
);
await book.fill(
  "#note-marks",
  "12:30 late rotation\n0:45 early ping\n1:02:03 - lost the objective"
);
await book.click('#note-form button[type="submit"]');
await book.waitForSelector(".note-card.vod");
const card = book.locator(".note-card.vod");
const link = card.locator("a.vod-link");
check(
  "the review is a card with its hero, a link that opens outside with the site named, and its status",
  (await text(book, ".note-card.vod b")) === "Scrim vs Wolves" &&
    (await card.locator(".pill").allInnerTexts()).join("|") === "Video review|Hero h01" &&
    (await link.getAttribute("href")) === "https://www.youtube.com/watch?v=abc123" &&
    (await link.getAttribute("target")) === "_blank" &&
    /noopener/.test((await link.getAttribute("rel")) ?? "") &&
    (await textOf(book, ".note-card.vod a.vod-link small")) === "youtube.com" &&
    (await card.locator(".note-status").inputValue()) === "todo" &&
    (await card.locator(".note-status option").allInnerTexts()).join("|") ===
      "To watch|Being reviewed|Reviewed"
);
check(
  "the moments are in the order of the video, each a link that opens the video at that time",
  (await card.locator(".vod-mark").allInnerTexts()).join("|") === "0:45|12:30|1:02:03" &&
    (await card.locator(".vod-mark").evaluateAll(links => links.map(entry => entry.href))).join(
      "|"
    ) ===
      [
        "https://www.youtube.com/watch?v=abc123&t=45",
        "https://www.youtube.com/watch?v=abc123&t=750",
        "https://www.youtube.com/watch?v=abc123&t=3723"
      ].join("|") &&
    (await card.locator(".vod-mark").first().getAttribute("aria-label")) === "Watch from 0:45" &&
    (await card.locator(".vod-marks li span").allInnerTexts()).join("|") ===
      "early ping|late rotation|lost the objective"
);
const [[stored]] = await app.store.pool.query(
  "SELECT url, marks_json FROM training_notes WHERE user_id = ? AND kind = 'vod'",
  [player.user.id]
);
check(
  "the link and the moments are kept as seconds in the order of the video",
  stored.url === "https://www.youtube.com/watch?v=abc123" &&
    JSON.parse(stored.marks_json)
      .map(mark => mark.at)
      .join() === "45,750,3723"
);

// the status of a video review and of an other kind of note can be changed from the card
const reviewId = await card.getAttribute("data-note");
const noteSaved = () =>
  book.waitForResponse(
    call => call.request().method() === "PUT" && call.url().includes("/api/training/notes/")
  );
const [reviewed] = await Promise.all([
  noteSaved(),
  card.locator(".note-status").selectOption("mastered")
]);
check(
  "the status of a video review is changed from its card",
  reviewed.status() === 200 &&
    (await app.store.pool.query("SELECT status FROM training_notes WHERE id = ?", [reviewId]))[0][0]
      .status === "mastered"
);
await book.click("[data-new]");
await book.fill("#note-title", "Wave control");
await book.click('#note-form button[type="submit"]');
await book.waitForSelector(".note-card.goal");
const [moved] = await Promise.all([
  noteSaved(),
  book.selectOption(".note-card.goal .note-status", "practicing")
]);
check(
  "the status of a goal changes from its card too (it used to be refused: a goal has no steps)",
  moved.status() === 200 && (await moved.json()).status === "practicing"
);

// editing: the moments come back as the text they were typed in
await book.click(".note-card.vod [data-edit]");
await book.waitForSelector("#note-url");
check(
  "editing shows the link and the moments as lines, in the order of the video",
  (await book.inputValue("#note-url")) === "https://www.youtube.com/watch?v=abc123" &&
    (await book.inputValue("#note-marks")) ===
      "0:45 early ping\n12:30 late rotation\n1:02:03 lost the objective" &&
    (await book.inputValue("#note-kind")) === "vod" &&
    (await book.inputValue("#note-status")) === "mastered"
);
await book.fill("#note-url", "https://www.twitch.tv/videos/99");
await book.fill("#note-marks", "75:30 second objective");
await book.click('#note-form button[type="submit"]');
await book.waitForFunction(
  () => document.querySelector(".note-card.vod a.vod-link small")?.textContent === "twitch.tv"
);
check(
  "saving the changes shows the new site and the moment, with the time in the address of Twitch",
  (await book.locator(".note-card.vod .vod-mark").count()) === 1 &&
    (await book.locator(".note-card.vod .vod-mark").evaluate(entry => entry.href)) ===
      "https://www.twitch.tv/videos/99?t=1h15m30s" &&
    (await text(book, ".note-card.vod .vod-mark")) === "1:15:30"
);
await book.click('.segmented [data-kind="vod"]');
check(
  "the notebook can show only the video reviews",
  (await book.locator(".note-card").count()) === 1 &&
    (await book.locator(".note-card.vod").count()) === 1
);

// what is not a fine address is text, never a link (the server refuses it, but it is checked again)
await app.store.pool.execute(
  "UPDATE training_notes SET url = 'javascript:alert(1)' WHERE user_id = ? AND kind = 'vod'",
  [player.user.id]
);
await book.reload();
await book.waitForSelector(".note-card.vod");
check(
  "an address that is not https is shown as text and is not a link",
  (await book.locator('.note-card.vod a[href^="javascript"]').count()) === 0 &&
    (await book.locator(".note-card.vod a.vod-link").count()) === 0 &&
    (await text(book, ".note-card.vod .vod")).includes("javascript:alert(1)")
);
await app.store.pool.execute(
  "UPDATE training_notes SET url = 'https://www.twitch.tv/videos/99' WHERE user_id = ? AND kind = 'vod'",
  [player.user.id]
);

// the review is shown in the shared space, where the people it is shared with can follow the links
const { token } = (await player.browser.post("/api/space/links", { sections: ["training"] })).body;
const guest = await open(null, { steady: false });
await guest.goto(`${app.baseUrl}/space/shared#${token}`);
await guest.waitForSelector("#sp-training .sp-notes .vod");
check(
  "a shared space shows the review: its link, the moments, and the status in the words of a video",
  (await guest.locator("#sp-training .vod a.vod-link").getAttribute("href")) ===
    "https://www.twitch.tv/videos/99" &&
    (await guest.locator("#sp-training .vod-mark").count()) === 1 &&
    (await text(guest, "#sp-training .sp-notes:has(.vod)")).includes("Reviewed") &&
    (await guest
      .locator("#sp-training .vod a")
      .evaluateAll(links =>
        links.every(entry => entry.rel.includes("noopener") && entry.target === "_blank")
      ))
);
const little = await open(player, { width: 390, steady: false });
await little.goto(`${app.baseUrl}/training/notebook`);
await little.waitForSelector(".note-card.vod");
const cardFits = await noSideScroll(little);
await little.click(".note-card.vod [data-edit]");
await little.waitForSelector("#note-marks");
check("the card of a review and its form fit a phone", cardFits && (await noSideScroll(little)));
const sharedLittle = await open(null, { width: 390, steady: false });
await sharedLittle.goto(`${app.baseUrl}/space/shared#${token}`);
await sharedLittle.waitForSelector("#sp-training .sp-notes .vod");
check("the shared space with a review fits a phone", await noSideScroll(sharedLittle));
await book.reload();
await book.waitForSelector(".note-card.vod");
book.once("dialog", dialog => dialog.accept());
await book.click(".note-card.vod [data-remove]");
await book.waitForFunction(() => document.querySelectorAll(".note-card.vod").length === 0);
check("a review can be deleted", (await notesOf(player, "vod")) === 0);

// ---- phone width ----------------------------------------------------------------------------------------------
const phone = await open(player, { width: 390 });
await phone.goto(`${app.baseUrl}/training/reflex/routine`);
await phone.waitForSelector(".rx-routine");
check("the routines page has no horizontal scroll on a phone", await noSideScroll(phone));
await phone.click('[data-routine="everything"]');
await phone.waitForSelector(".rx-steps");
check("a routine of eight steps fits a phone", await noSideScroll(phone));

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ntraining extras e2e clean"
);
process.exit(problems.length ? 1 : 0);
