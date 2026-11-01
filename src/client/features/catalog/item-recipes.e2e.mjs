// Browser check of the recipes of the items. An administrator gives an item its level and the items it is built
// from (up to three, the same one possibly twice) in its form, and takes a part out again. A visitor of /items
// filters the items by level, opens one and reads what it is built from (with the price of each part and the gold
// left to put them together) and what it goes into, and a part opens its own sheet. Phone width has no horizontal
// scroll.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Smith", { admin: true });

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
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};
const itemOf = async name =>
  (await app.browser().get("/api/catalog")).body.items.find(entry => entry.name === name);
async function until(page, what, ask) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await ask()) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`never happened: ${what}`);
}

// ---- the staff's items: two small ones, one big one with no recipe yet ------------------------------------------------
const post = async body =>
  (
    await admin.browser.post("/api/admin/catalog/items", {
      category: "regular",
      stats: [],
      ...body
    })
  ).body.id;
const tome = await post({ name: "Spell Tome", tier: "basic", price: 300, shopCategory: "magical" });
const gem = await post({ name: "Blue Gem", tier: "basic", price: 250, shopCategory: "magical" });
await post({ name: "Grand Staff", price: 900, shopCategory: "magical" });

// ---- the form ------------------------------------------------------------------------------------------------------------
const page = await open(admin);
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
await page.click('[data-tab="items"]');
await page.click('.catalog-entry:has-text("Grand Staff")');
await page.waitForSelector('#catalog-form [name="tier"]');
check(
  "the form of an item has its level and three places for its parts",
  (await page.inputValue('#catalog-form [name="tier"]')) === "" &&
    (await page.locator('#catalog-form [name^="component-"]').count()) === 3
);
const offered = await page.locator('#catalog-form [name="component-0"] option').allInnerTexts();
check(
  "a part is chosen among the other items, with their price, never the item itself",
  offered.some(label => /Spell Tome/.test(label) && /300/.test(label)) &&
    !offered.some(label => /Grand Staff/.test(label))
);
await page.selectOption('#catalog-form [name="tier"]', "intermediate");
await page.selectOption('#catalog-form [name="component-0"]', String(tome));
await page.selectOption('#catalog-form [name="component-1"]', String(tome));
await page.selectOption('#catalog-form [name="component-2"]', String(gem));
await page.keyboard.press("Control+Enter");
await until(
  page,
  "the recipe is saved",
  async () => (await itemOf("Grand Staff"))?.components.length === 3
);
const staff = await itemOf("Grand Staff");
check(
  "the level and the parts are saved in order, the same part twice",
  staff.tier === "intermediate" && staff.components.join() === [tome, tome, gem].join()
);
await page.click('.catalog-entry:has-text("Grand Staff")');
await page.waitForSelector('#catalog-form [name="component-2"]');
check(
  "the form opens again on what was saved",
  (await page.inputValue('#catalog-form [name="component-1"]')) === String(tome) &&
    (await page.inputValue('#catalog-form [name="tier"]')) === "intermediate"
);
await page.selectOption('#catalog-form [name="component-2"]', "");
await page.keyboard.press("Control+Enter");
await until(
  page,
  "a part is taken out",
  async () => (await itemOf("Grand Staff"))?.components.length === 2
);
check(
  "a part can be taken out",
  (await itemOf("Grand Staff")).components.join() === [tome, tome].join()
);

// ---- /items ----------------------------------------------------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/items`);
await visitor.waitForSelector(".gd-tile");
await visitor.click('[data-tier="basic"]');
await visitor.waitForFunction(() => document.querySelectorAll(".gd-tile").length === 2);
check("the level filter keeps the two small items", true);
await visitor.click('[data-tier=""]');
await visitor.click('.gd-tile:has-text("Grand Staff")');
await visitor.waitForSelector(".gd-recipe");
const sheet = await visitor.locator("#gd-detail").innerText();
check(
  "the sheet says the level, what it is built from and the gold to put them together",
  /intermediate/i.test(sheet) &&
    (await visitor.locator('.gd-recipe [data-pick="' + tome + '"]').count()) === 2 &&
    /\+ 300 gold/.test(sheet)
);
await visitor.click(`.gd-recipe [data-pick="${tome}"] >> nth=0`);
await visitor.waitForFunction(() =>
  /builds into/i.test(document.querySelector("#gd-detail")?.innerText ?? "")
);
check(
  "a part opens its own sheet, which says what it goes into",
  (await visitor.locator(".gd-recipe .gd-part:has-text('Grand Staff')").count()) === 1 &&
    new URL(visitor.url()).pathname === `/items/${tome}`
);
const phone = await open(null, 390);
await phone.goto(`${app.baseUrl}/items/${tome}`);
await phone.waitForSelector(".gd-recipe");
check(
  "the sheet with its recipe fits a phone",
  await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nitem recipes e2e clean"
);
process.exit(problems.length ? 1 : 0);
