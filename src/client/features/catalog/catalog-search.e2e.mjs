// Browser check of filling an item quickly in the Catalog: the panel keeps its place while lines are added
// and stats are chosen (it used to jump back to its top at each one), a stat is typed by name (without
// minding capitals or accents) and Enter takes it, a tag and a hero are found by a search over their
// boxes, and a name typed but not chosen from the list stops the save. What was saved is read back.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { pickName } from "../../../testing/name-pick.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const stats = {};
for (const [index, name] of [
  "Max HP",
  "Physical Attack",
  "Magical Attack",
  "Attack Speed",
  "Movement Speed",
  "Dégâts critiques",
  "Crit Rate",
  "Cooldown Reduction",
  "Physical Defense",
  "Magic Defense",
  "Lifesteal",
  "Mana"
].entries()) {
  stats[name] = await post("/api/admin/catalog/stats", { name, sortOrder: index });
}
const tags = [];
for (let index = 0; index < 40; index += 1) {
  tags.push(
    await post("/api/admin/catalog/tags", { name: `Tag ${String(index).padStart(2, "0")}` })
  );
}
const shield = await post("/api/admin/catalog/tags", { name: "Bouclier" });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
// a low window, so that the panel of the form has to scroll
const context = await browser.newContext({ viewport: { width: 1440, height: 760 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const panelTop = () =>
  page.evaluate(() => document.querySelector(".ct-panel .ws-panel__body").scrollTop);

await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-new]");
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Fast Blade");

// six lines, each chosen by typing its name: the panel never goes back to its top
const lines = [
  ["max hp", "Max HP", "300"],
  ["PHYSICAL att", "Physical Attack", "60"],
  ["degats", "Dégâts critiques", "20"],
  ["speed", "Attack Speed", "25"],
  ["cooldown", "Cooldown Reduction", "10"],
  ["life", "Lifesteal", "8"]
];
const jumps = [];
for (const [index, [typed, name, value]] of lines.entries()) {
  await page.click("[data-add-stat]");
  const field = page.locator(`[data-name-pick-input="stat-${index}-id"]`);
  check(
    `line ${index + 1}: the cursor is in the new line, ready to type its stat`,
    await field.evaluate(input => input === document.activeElement)
  );
  const before = await panelTop();
  await field.fill(typed);
  await field.press("Enter");
  await page.waitForFunction(
    ([line, id]) => document.querySelector(`input[name="stat-${line}-id"]`)?.value === String(id),
    [index, stats[name]]
  );
  const after = await panelTop();
  if (index >= 2 && after < before - 2) {
    jumps.push(`${index + 1}: ${before} -> ${after}`);
  }
  const valueField = page.locator(`[name="stat-${index}-value"]`);
  check(
    `line ${index + 1}: "${typed}" finds ${name}, and Enter takes the cursor on to the value`,
    await valueField.evaluate(input => input === document.activeElement)
  );
  await valueField.fill(value);
}
check(
  `the panel keeps its place while lines are added (${jumps.join(", ") || "no jump"})`,
  jumps.length === 0
);
check("the panel did scroll (the check above means something)", (await panelTop()) > 0);

// the arrows choose another name than the first one that matches
await page.click("[data-add-stat]");
const sixth = page.locator('[data-name-pick-input="stat-6-id"]');
await sixth.fill("defense");
await sixth.press("ArrowDown");
await sixth.press("Enter");
await page.waitForFunction(
  id => document.querySelector('input[name="stat-6-id"]')?.value === String(id),
  stats["Magic Defense"]
);
check("the arrows move to the second name that matches", true);
await page.fill('[name="stat-6-value"]', "40");

// a name typed but not chosen stops the save, and says so
await page.click("[data-add-stat]");
await page.locator('[data-name-pick-input="stat-7-id"]').fill("nothing like this");
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(400);
check(
  "a stat typed but not chosen stops the save",
  (await app.browser().get("/api/catalog")).body.items.length === 0 &&
    (await page
      .locator('[data-name-pick-input="stat-7-id"]')
      .evaluate(input => !input.validity.valid))
);
await page.click('[data-remove-stat="7"]');

// tags: a search over the boxes; a ticked box stays shown and is counted
const search = page.locator(".box-search__input").first();
await search.fill("bouc");
check(
  "the search over the tags shows only the matching ones",
  (await page.locator(".box-search .tag-box:visible").count()) === 1
);
await page.check(`input[name="tags"][value="${shield}"]`);
await search.fill("tag 3");
check(
  "a ticked tag stays shown while another is searched, and the count follows",
  (await page.locator(`input[name="tags"][value="${shield}"]`).isVisible()) &&
    (await page.locator(".box-search .tag-box:visible").count()) === 11 &&
    /1/.test(await page.locator("[data-box-count]").first().innerText())
);
await page.check(`input[name="tags"][value="${tags[31]}"]`);

// a condition on a line: its stat by name, then its heroes by a search
await page.click('[data-extra="0"] > summary');
await page.click('[data-w-add="stat-0"]');
await page.waitForSelector('[data-name-pick-input="w-stat-0-0-stat"]');
await pickName(page, "w-stat-0-0-stat", { value: String(stats.Mana) });
await page.selectOption('[name="w-stat-0-0-kind"]', "hero");
await page.waitForSelector('[name="w-stat-0-0-heroes"]');
const heroSearch = page.locator(".when-heroes .box-search__input");
const heroLabels = await page.locator(".when-heroes .tag-box").allInnerTexts();
const wanted = heroLabels[3].trim();
await heroSearch.fill(wanted.toLowerCase());
check(
  "the heroes of a condition are found by a search",
  (await page.locator(".when-heroes .tag-box:visible").count()) < heroLabels.length &&
    (await page.locator(".when-heroes .tag-box:visible", { hasText: wanted }).count()) >= 1
);
await page.locator(".when-heroes .tag-box", { hasText: wanted }).first().locator("input").check();

// saved, then read back
await page.keyboard.press("Control+Enter");
// polled from here: a waitForFunction given an async function does not poll
let item;
for (let tries = 0; tries < 40 && !item; tries += 1) {
  await page.waitForTimeout(250);
  item = (await app.browser().get("/api/catalog")).body.items[0];
}
if (!item) {
  console.log(
    "not saved; the form says:",
    await page.locator(".ct-panel .form-error").allInnerTexts()
  );
}
const wantedStats = [
  ...lines.map(([, name, value]) => [stats[name], Number(value)]),
  [stats["Magic Defense"], 40]
];
check(
  "the item is saved with its seven stats in order, its two tags and a condition for one hero",
  item?.name === "Fast Blade" &&
    JSON.stringify(item.stats.map(row => [row.statId, row.value])) ===
      JSON.stringify(wantedStats) &&
    [...item.tags].sort().join() === [shield, tags[31]].sort().join() &&
    JSON.stringify(item.stats[0].when).includes("hero")
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ncatalog search e2e clean"
);
process.exit(problems.length ? 1 : 0);
