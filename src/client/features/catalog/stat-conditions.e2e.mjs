// Browser check of what a stat can hold and of the values that depend on the hero: an administrator
// writes a choice stat (Melee or Ranged), an item whose lines are temporary or only for some heroes
// (conditions with "all" and "any", a group, a tag, a class, a level) and passives and actives for
// melee and for ranged heroes; the hero data editor takes the option of a hero; the build lab, with no
// account, counts only what applies to the hero of the build, says what it did not count and why, and
// marks the passives that are not for the hero. Phone width has no horizontal scroll.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { pickName, pickNames } from "../../../testing/name-pick.js";
import { openHeroTab } from "../../../testing/nav.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const marksman = (await admin.browser.post("/api/admin/catalog/tags", { name: "Marksman" })).body
  .id;

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1300 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    // a stat that is used cannot change or go (409), and the page says so: expected
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
const text = (page, selector) => page.locator(selector).innerText();
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
const catalogOf = async () => (await app.browser().get("/api/catalog")).body;
const listHas = (page, label) =>
  page.waitForFunction(
    name => document.querySelector(".catalog-list")?.innerText.includes(name),
    label
  );

// ---- the stats, written on the page ---------------------------------------------------------------------
const page = await open(admin);
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
await page.click('[data-tab="stats"]');
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Attack range");
await page.selectOption('#catalog-form [name="unit"]', "choice");
await page.waitForSelector('[name="option-1-name"]');
check(
  "a stat shown as a choice asks for its options: two empty ones to start with",
  (await page.locator(".option-row").count()) === 2 &&
    (await page.locator("[data-add-option]").count()) === 1
);
await page.fill('[name="option-0-name"]', "Melee");
await page.fill('[name="option-1-name"]', "Ranged");
await page.keyboard.press("Control+Enter");
await listHas(page, "Attack range");
check(
  "the list says what the stat is, with its options",
  /Choice: Melee \/ Ranged/.test(await text(page, ".catalog-list"))
);
for (const [name, unit] of [
  ["Max HP", "whole"],
  ["Range bonus", "flat"]
]) {
  await page.fill('#catalog-form [name="name"]', name);
  await page.selectOption('#catalog-form [name="unit"]', unit);
  await page.keyboard.press("Control+Enter");
  await listHas(page, name);
}
let catalog = await catalogOf();
const [range, hp, bonus] = ["Attack range", "Max HP", "Range bonus"].map(
  name => catalog.stats.find(stat => stat.name === name).id
);
check(
  "the three stats are kept: a choice with its options, a whole number, a number",
  catalog.stats.find(stat => stat.id === range).unit === "choice" &&
    catalog.stats
      .find(stat => stat.id === range)
      .options.map(option => `${option.id}:${option.name}`)
      .join() === "1:Melee,2:Ranged" &&
    catalog.stats.find(stat => stat.id === hp).unit === "whole" &&
    catalog.stats.find(stat => stat.id === bonus).unit === "flat" &&
    catalog.stats.find(stat => stat.id === bonus).options.length === 0
);

// ---- an item whose lines and effects depend on the hero --------------------------------------------------------
await page.click('[data-tab="items"]');
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Bow of dusk");
await page.fill('#catalog-form [name="description"]', "A bow that likes distance.");
// line 1: Max HP, whatever the hero
await page.click("[data-add-stat]");
await pickName(page, "stat-0-id", { value: String(hp) });
await page.fill('[name="stat-0-value"]', "300");
// line 2: Max HP, for a melee hero (the first condition is already the stat of the hero: Melee)
await page.click("[data-add-stat]");
await pickName(page, "stat-1-id", { value: String(hp) });
await page.fill('[name="stat-1-value"]', "120");
await page.click('[data-extra="1"] > summary');
await page.click('[data-w-add="stat-1"]');
await page.waitForSelector('[name="w-stat-1-0-kind"]');
check(
  "a line has a way to say it is only for some heroes: the first condition is already filled in",
  (await page.inputValue('[name="w-stat-1-0-kind"]')) === "stat" &&
    (await page.inputValue('[name="w-stat-1-0-stat"]')) === String(range) &&
    (await page.isChecked('[name="w-stat-1-0-options"][value="1"]')) &&
    !(await page.isChecked('[name="w-stat-1-0-options"][value="2"]')) &&
    (await page.inputValue('[name="stat-0-value"]')) === "300"
);
// line 3: a temporary range bonus, for a ranged hero, or a Marksman, or a Fighter from level 8
await page.click("[data-add-stat]");
await pickName(page, "stat-2-id", { value: String(bonus) });
await page.fill('[name="stat-2-value"]', "1.5");
await page.click('[data-extra="2"] > summary');
check(
  "the duration waits for the value to be temporary",
  await page.locator('[name="stat-2-duration"]').isDisabled()
);
await page.check('[name="stat-2-temporary"]');
check(
  "ticking Temporary lets the duration be written",
  await page.locator('[name="stat-2-duration"]').isEnabled()
);
await page.fill('[name="stat-2-duration"]', "3");
await page.fill('[name="stat-2-note"]', "after using the active");
await page.click('[data-w-add="stat-2"]');
await page.uncheck('[name="w-stat-2-0-options"][value="1"]');
await page.check('[name="w-stat-2-0-options"][value="2"]');
await page.click('[data-w-add="stat-2"]'); // a second condition, then its kind
await page.selectOption('[name="w-stat-2-1-kind"]', "tag");
await page.waitForSelector('[name="w-stat-2-1-tag"]', { state: "attached" });
check(
  "choosing the kind of a condition draws what it asks for: a tag to choose",
  (await pickNames(page, "w-stat-2-1-tag").count()) === 1
);
await page.selectOption('[name="w-stat-2-match"]', "any");
await page.click('[data-w-group="stat-2"]'); // a group: its first condition is a level
await page.waitForSelector('[name="w-stat-2-2-0-kind"]');
await page.fill('[name="w-stat-2-2-0-value"]', "8");
await page.click('[data-w-add="stat-2"][data-w-path="2"]');
await page.selectOption('[name="w-stat-2-2-1-kind"]', "role");
await page.waitForSelector('[name="w-stat-2-2-1-role"]');
check(
  "a group holds conditions of its own, all of them or any",
  (await page.inputValue('[name="w-stat-2-2-match"]')) === "all" &&
    (await page.locator(".when-group .when-atom").count()) === 3 &&
    (await page.inputValue('[name="w-stat-2-2-0-value"]')) === "8" &&
    (await page.inputValue('[name="w-stat-2-1-tag"]')) === String(marksman)
);
// the passives: one for melee heroes, one for ranged ones
for (const [index, label, option] of [
  [0, "Melee heroes: 5%.", "1"],
  [1, "Ranged heroes: 3%.", "2"]
]) {
  await page.click("[data-add-effect]");
  await page.fill(`[name="effect-${index}-name"]`, "Pierce");
  await page.fill(`[name="effect-${index}-text"]`, label);
  await page.click(`[data-effect-extra="${index}"] > summary`);
  await page.click(`[data-w-add="effect-${index}"]`);
  if (option === "2") {
    await page.uncheck(`[name="w-effect-${index}-0-options"][value="1"]`);
    await page.check(`[name="w-effect-${index}-0-options"][value="2"]`);
  }
}
check(
  "the passives have conditions of their own",
  (await page.locator(".effect-row .when-atom").count()) === 2
);
await page.check('input[name="tags"]');
await page.keyboard.press("Control+Enter");
await listHas(page, "Bow of dusk");

catalog = await catalogOf();
const bow = catalog.items.find(item => item.name === "Bow of dusk");
const meleeSet = { match: "all", of: [{ kind: "stat", statId: range, options: [1] }] };
const rangedSet = { match: "all", of: [{ kind: "stat", statId: range, options: [2] }] };
check(
  "the item is kept as it was written: values, a temporary one with its duration, its note and its conditions",
  JSON.stringify(bow.stats[0]) === JSON.stringify({ statId: hp, value: 300 }) &&
    JSON.stringify(bow.stats[1]) === JSON.stringify({ statId: hp, value: 120, when: meleeSet }) &&
    bow.stats[2].statId === bonus &&
    bow.stats[2].value === 1.5 &&
    bow.stats[2].temporary === true &&
    bow.stats[2].durationSeconds === 3 &&
    bow.stats[2].note === "after using the active" &&
    bow.stats[2].when.match === "any" &&
    bow.stats[2].when.of.length === 3
);
check(
  "the group is kept inside the set: a class and a level",
  JSON.stringify(bow.stats[2].when.of[2]) ===
    JSON.stringify({
      kind: "group",
      match: "all",
      of: [
        { kind: "level", op: ">=", value: 8 },
        { kind: "role", role: "Fighter" }
      ]
    }) &&
    JSON.stringify(bow.stats[2].when.of[1]) === JSON.stringify({ kind: "tag", tagId: marksman })
);
check(
  "each passive keeps its conditions",
  JSON.stringify(bow.effects.map(effect => effect.when)) === JSON.stringify([meleeSet, rangedSet])
);

// ---- the same item, opened again and saved again: nothing changes -------------------------------------------------------------
await page.click('.catalog-entry:has-text("Bow of dusk")');
await page.waitForSelector('[name="stat-2-id"]', { state: "attached" });
check(
  "the item opens with its conditions drawn: the stat and its options, the tag, the group",
  (await page.inputValue('[name="w-stat-2-match"]')) === "any" &&
    (await page.isChecked('[name="w-stat-2-0-options"][value="2"]')) &&
    (await page.isChecked('[name="stat-2-temporary"]')) &&
    (await page.inputValue('[name="stat-2-duration"]')) === "3" &&
    (await page.inputValue('[name="w-stat-2-2-1-role"]')) === "Fighter" &&
    (await text(page, '[data-extra="2"] > summary')).includes("4 conditions")
);
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() => !document.querySelector('[name="stat-2-id"]'));
const again = (await catalogOf()).items.find(item => item.name === "Bow of dusk");
check(
  "saved again without a change, it is exactly the same (nothing is lost in the form)",
  JSON.stringify(again.stats) === JSON.stringify(bow.stats) &&
    JSON.stringify(again.effects) === JSON.stringify(bow.effects)
);

// ---- a condition that is not finished is refused before anything is sent --------------------------------------------------------
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Unfinished");
await page.click("[data-add-stat]");
await pickName(page, "stat-0-id", { value: String(hp) });
await page.fill('[name="stat-0-value"]', "10");
await page.click('[data-extra="0"] > summary');
await page.click('[data-w-add="stat-0"]');
await pickName(page, "w-stat-0-0-stat", { value: String(hp) }); // a number to compare: no number written yet
await page.waitForSelector('[name="w-stat-0-0-op"]');
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  /not finished/.test(document.querySelector(".form-error")?.innerText ?? "")
);
check(
  "a condition left half written is refused with a sentence, and nothing is kept",
  (await catalogOf()).items.every(item => item.name !== "Unfinished")
);
await page.fill('[name="w-stat-0-0-value"]', "2000");
await page.selectOption('[name="w-stat-0-0-op"]', "!=");
await page.keyboard.press("Control+Enter");
await listHas(page, "Unfinished");
const unfinished = (await catalogOf()).items.find(item => item.name === "Unfinished");
check(
  "a number compared with the sign ≠ is kept as the one that is not: = with not",
  JSON.stringify(unfinished.stats[0].when) ===
    JSON.stringify({
      match: "all",
      of: [{ kind: "stat", statId: hp, op: "=", value: 2000, negate: true }]
    })
);
await page.click('.catalog-entry:has-text("Unfinished")');
await page.waitForSelector('[name="w-stat-0-0-op"]');
check(
  "and opened again it is written with the sign again",
  (await page.inputValue('[name="w-stat-0-0-op"]')) === "!="
);
await page.click('[data-w-remove="stat-0"]');
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() => !document.querySelector('[name="stat-0-id"]'));
check(
  "removing its only condition leaves the line for every hero",
  !("when" in (await catalogOf()).items.find(item => item.name === "Unfinished").stats[0])
);

// ---- a line can carry the option of a choice stat -------------------------------------------------------------------------------
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Wings");
await page.click("[data-add-stat]");
await page.waitForSelector('[name="stat-0-option"]');
check(
  "a line of a choice stat asks for an option, not a number",
  (await page.locator('[name="stat-0-value"]').count()) === 0 &&
    (await page.locator('[name="stat-0-option"] option').allInnerTexts()).join() === "Melee,Ranged"
);
await page.selectOption('[name="stat-0-option"]', "2");
await page.click('[data-extra="0"] > summary');
await page.check('[name="stat-0-temporary"]');
await page.fill('[name="stat-0-duration"]', "5");
await page.keyboard.press("Control+Enter");
await listHas(page, "Wings");
check(
  "it is kept with the option and as temporary",
  JSON.stringify((await catalogOf()).items.find(item => item.name === "Wings").stats) ===
    JSON.stringify([{ statId: range, option: 2, temporary: true, durationSeconds: 5 }])
);

// ---- what is used cannot change or go ----------------------------------------------------------------------------------------------
await page.click('[data-tab="stats"]');
await page.click('.catalog-entry:has-text("Attack range")');
await page.selectOption('#catalog-form [name="unit"]', "flat");
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  /cannot change/.test(document.querySelector(".form-error")?.innerText ?? "")
);
check(
  "a stat that items use cannot become a number: the page says so",
  (await catalogOf()).stats.find(stat => stat.id === range).unit === "choice"
);
await page.click('.catalog-entry:has-text("Attack range")');
await page.fill('[name="option-0-name"]', "Close");
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Close")
);
check(
  "an option can be renamed: it keeps its id, so what refers to it still does",
  (await catalogOf()).stats
    .find(stat => stat.id === range)
    .options.map(option => `${option.id}:${option.name}`)
    .join() === "1:Close,2:Ranged" &&
    JSON.stringify(
      (await catalogOf()).items.find(item => item.name === "Bow of dusk").effects[0].when
    ) === JSON.stringify(meleeSet)
);
await page.click('.catalog-entry:has-text("Attack range")');
await page.click('[data-remove-option="0"]');
await page.click("[data-add-option]");
await page.fill('[name="option-1-name"]', "Far");
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  /Close|used by/.test(document.querySelector(".form-error")?.innerText ?? "")
);
check(
  "an option that conditions use cannot be taken away: the page names it",
  (await catalogOf()).stats.find(stat => stat.id === range).options.length === 2
);
page.once("dialog", dialog => dialog.accept());
await page.click("[data-delete]");
await page.waitForFunction(() =>
  /used by/.test(document.querySelector(".form-error")?.innerText ?? "")
);
check(
  "nor can the stat be deleted",
  (await catalogOf()).stats.some(stat => stat.id === range)
);
await page.click('.catalog-entry:has-text("Attack range")');
await page.fill('[name="option-0-name"]', "Melee");
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Melee")
);

// ---- the data of a hero: its option, then its numbers ------------------------------------------------------------------------------------
await page.goto(`${app.baseUrl}/heroes`);
await page.click('.hcard[data-hero-id="h01"]');
await page.waitForSelector('[data-action="edit-hero-data"]');
await page.click('[data-action="edit-hero-data"]');
await page.waitForSelector(".hero-editor-dialog[open] .hero-editor");
await page.click("[data-add-base]");
await page.waitForSelector('[name="base-0-option"]');
check(
  "the base stat of a hero that is a choice asks for an option and has no growth",
  (await page.locator('[name="base-0-growth"]').count()) === 0 &&
    (await page.locator('[name="base-0-option"] option').allInnerTexts()).join() === "Melee,Ranged"
);
await page.selectOption('[name="base-0-option"]', "1");
await page.click("[data-add-base]");
await page.selectOption('[name="base-1-id"]', String(hp));
await page.waitForSelector('[name="base-1-value"]');
check(
  "choosing another stat in the row gives it its own fields (the option kept above)",
  (await page.inputValue('[name="base-0-option"]')) === "1"
);
await page.fill('[name="base-1-value"]', "3000");
await page.fill('[name="base-1-growth"]', "100");
await page.click('.hero-editor-dialog button[type="submit"]');
await page.waitForFunction(() => !document.querySelector(".hero-editor-dialog[open]"));
check(
  "the profile keeps the option and the numbers",
  JSON.stringify((await app.browser().get("/api/heroes/h01")).body.profile.baseStats) ===
    JSON.stringify([
      { statId: range, option: 1 },
      { statId: hp, value: 3000, growth: 100 }
    ])
);
check(
  "the sheet shows the option of the hero in the table of its stats, and the numbers at each level",
  /Attack range\s+Melee/.test(await text(page, "main")) && /3,?000/.test(await text(page, "main"))
);
await admin.browser.put("/api/admin/heroes/h02/profile", {
  baseStats: [
    { statId: range, option: 2 },
    { statId: hp, value: 2500, growth: 90 }
  ],
  tags: [marksman],
  skills: []
});
await admin.browser.put("/api/admin/heroes/h03/profile", {
  baseStats: [{ statId: hp, value: 2000, growth: 80 }],
  tags: [],
  skills: []
});

// ---- the build lab: what applies to the hero of the build -------------------------------------------------------------------------------------
const charm = (
  await admin.browser.post("/api/admin/catalog/items", {
    name: "Charm",
    category: "regular",
    stats: [{ statId: hp, value: 50 }]
  })
).body.id;
const visitor = await open(null);
const lab = async (hero, level = 15) => {
  const query = new URLSearchParams({ i: `${bow.id}.${charm}` });
  if (hero) {
    query.set("h", hero);
    query.set("lv", String(level));
  }
  await visitor.goto(`${app.baseUrl}/build-lab?${query}`);
  await visitor.waitForSelector(".stats-table");
  await visitor.click(`.build-slot[data-piece="item:${bow.id}"]`);
  await visitor.waitForSelector(".piece-stat");
};
const rowOf = async name => {
  const cells = await visitor
    .locator(`.stats-table tbody tr:has(th:text-is("${name}")) td`)
    .allInnerTexts();
  return cells.map(cell => cell.replace(/\s+/g, " ").trim());
};
const notes = () => text(visitor, ".stat-notes");

await lab(null);
check(
  "with no hero, only what has no condition counts, and the page says what waits for a hero",
  (await rowOf("Max HP")).join("|") === "—|+350|—|350" &&
    /2 values depend on the hero: choose one to count them/.test(await notes()) &&
    (await visitor.locator(".stats-table tbody tr").count()) === 1
);
check(
  "the details of the item write the conditions of each line and of each passive",
  (await visitor.locator(".piece-stat").count()) === 3 &&
    (await visitor.locator(".piece-stat.is-off, .effect-line.is-off").count()) === 0 &&
    /When: Attack range is Melee/.test(await text(visitor, ".piece-details")) &&
    /Temporary, 3 s/.test(await text(visitor, ".piece-details")) &&
    /after using the active/.test(await text(visitor, ".piece-details")) &&
    /When: Attack range is Ranged, Has the tag Marksman, or \(Level is at least 8 and Class is Fighter\)/.test(
      await text(visitor, ".piece-details")
    )
);

await lab("h01", 10);
check(
  "a melee Fighter at level 10: the line for melee heroes counts, the temporary bonus is under the total",
  (await rowOf("Attack range")).join("|") === "Melee|—|—|Melee" &&
    (await rowOf("Max HP")).join("|") === "3,900|+470|—|4,370" &&
    /\+1\.5/.test((await rowOf("Range bonus")).join(" ")) &&
    (await visitor.locator(".stat-temp").count()) === 1
);
check(
  "the passive for ranged heroes is shown as not for this hero, the other one is not",
  (await visitor.locator(".effect-line.is-off").count()) === 1 &&
    /Ranged heroes: 3%\./.test(await text(visitor, ".effect-line.is-off")) &&
    /Does not apply to this hero\./.test(await text(visitor, ".effect-line.is-off")) &&
    (await visitor.locator(".piece-stat.is-off").count()) === 0
);
check(
  "what is temporary is listed apart, with its duration and its note",
  /1 temporary value, not in the total/.test(await notes())
);
await visitor.locator("#lab-level").evaluate(input => {
  input.value = "5";
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await visitor.waitForFunction(() =>
  /Level 5/.test(document.querySelector(".lvl-line")?.innerText ?? "")
);
check(
  "at level 5 the Fighter does not meet the level of the group: the temporary bonus no longer counts",
  (await visitor.locator(".stat-temp").count()) === 0 &&
    /1 value does not apply to this hero/.test(await notes()) &&
    (await rowOf("Max HP")).join("|") === "3,400|+470|—|3,870"
);

await lab("h02", 10);
check(
  "a ranged Marksman: its own line counts, the one for melee heroes does not",
  (await rowOf("Attack range")).join("|") === "Ranged|—|—|Ranged" &&
    (await rowOf("Max HP")).join("|") === "3,310|+350|—|3,660" &&
    (await visitor.locator(".stat-temp").count()) === 1 &&
    /1 value does not apply to this hero/.test(await notes())
);
check(
  "its details strike the line for melee heroes and grey the passive for melee heroes",
  (await visitor.locator(".piece-stat.is-off").count()) === 1 &&
    /\+120/.test(await text(visitor, ".piece-stat.is-off")) &&
    /Melee heroes: 5%\./.test(await text(visitor, ".effect-line.is-off"))
);

await lab("h03", 5);
check(
  "a hero whose range was never entered: what depends on it cannot be checked, and is not counted as false",
  (await rowOf("Max HP")).join("|") === "2,320|+350|—|2,670" &&
    /2 values cannot be checked: the data of the hero is incomplete/.test(await notes()) &&
    (await visitor.locator(".piece-stat.is-unknown").count()) === 2 &&
    (await visitor.locator(".piece-stat.is-off").count()) === 0
);
check(
  "the lab explains how it counts",
  /counts only when it applies to the hero you chose/.test(await text(visitor, ".bl-side"))
);

// the sheet of a hero: a recommended build shows what applies to this hero
await admin.browser.put("/api/builds/h01/1", {
  name: "Dusk",
  build: { items: [bow.id, charm], utility: [], late: [], core: [bow.id, charm], arcana: {} }
});
await visitor.goto(`${app.baseUrl}/heroes`);
await visitor.click('.hcard[data-hero-id="h01"]');
await openHeroTab(visitor, "builds");
await visitor.waitForSelector(`.build-card .build-slot[data-piece="item:${bow.id}"]`);
await visitor.click(`.build-card .build-slot[data-piece="item:${bow.id}"]`);
await visitor.waitForSelector(".build-info .piece-stat");
check(
  "on the sheet of a hero, a recommended build marks the passives that are not for this hero",
  (await visitor.locator(".build-info .effect-line.is-off").count()) === 1 &&
    /Ranged heroes: 3%\./.test(await text(visitor, ".build-info .effect-line.is-off"))
);

// ---- phone width ----------------------------------------------------------------------------------------------------------------------------------
const phone = await open(null, 390);
await phone.goto(`${app.baseUrl}/build-lab?i=${bow.id}.${charm}&h=h02&lv=10`);
// on a phone the sheet of the build is a drawer that the bar at the bottom opens
await phone.click(".lb-dock__open");
await phone.waitForSelector(".stats-table");
await phone.click(`.build-slot[data-piece="item:${bow.id}"]`);
await phone.waitForSelector(".piece-stat");
check("the build lab with values that depend on the hero fits a phone", await noSideScroll(phone));
const adminPhone = await open(admin, 390);
await adminPhone.goto(`${app.baseUrl}/catalog`);
await adminPhone.waitForSelector("[data-tab]");
await adminPhone.click('[data-tab="items"]');
await adminPhone.click('.catalog-entry:has-text("Bow of dusk")');
await adminPhone.waitForSelector('[name="w-stat-2-match"]');
check("the form of an item with conditions fits a phone", await noSideScroll(adminPhone));

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nstat conditions e2e clean"
);
process.exit(problems.length ? 1 : 0);
