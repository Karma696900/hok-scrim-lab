// Browser check of the two ways to sort an item. An administrator sorts a list of items in a few clicks
// (ticks them, gives them a shop category or a slot), filters the list by category, changes the
// category of one item in its form, and an arcana can be saved before its stats are written. A visitor
// narrows the items of the build lab down by category (the chips only exist once some items are
// sorted). The pictures are asked for in the size they are drawn. Phone width has no horizontal scroll.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });

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
    // a slot that a recommended build needs cannot change (409), and the page says so: expected
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
const toast = (page, pattern) =>
  page.waitForFunction(
    source => new RegExp(source).test(document.querySelector("#toasts")?.innerText ?? ""),
    pattern.source
  );
const catalogOf = async () => (await app.browser().get("/api/catalog")).body;
const itemOf = async name => (await catalogOf()).items.find(entry => entry.name === name);
/**
 * Waits until the server answers what is wanted (a toast of an earlier action may still be on screen,
 * and waitForFunction does not poll an async function: it is asked again from here).
 */
async function until(page, what, ask) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await ask()) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`never happened: ${what}`);
}
const waitItem = (page, name, key, value) =>
  until(page, `${name}.${key} = ${value}`, async () => (await itemOf(name))?.[key] === value);

// ---- what the staff wrote: eight items that nobody has sorted yet ------------------------------------------------
const NAMES = [
  "Blade of Despair",
  "Staff of Embers",
  "Giant's Shield",
  "Boots of Deftness",
  "Hunter's Knife",
  "Guardian Charm",
  "Tidal Totem",
  "Late Edge"
];
const ids = {};
for (const name of NAMES) {
  const response = await admin.browser.post("/api/admin/catalog/items", {
    name,
    category: name.startsWith("Boots") ? "boots" : "regular",
    stats: []
  });
  ids[name] = response.body.id;
}
// an arcana form starts with one stat to fill: there has to be a stat of the game to offer
await admin.browser.post("/api/admin/catalog/stats", { name: "Attack" });

// ---- the list, before any sorting ------------------------------------------------------------------------------
const page = await open(admin);
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
await page.click('[data-tab="items"]');
await page.waitForSelector(".catalog-entry");
check(
  "the eight items are listed and none has a category yet",
  (await page.locator(".catalog-entry").count()) === 8 &&
    (await page.locator(".catalog-entry .pill").count()) === 0
);
check(
  "the list has two filters: the slot (Goes in) and the category",
  (await page.locator("#catalog-category").count()) === 1 &&
    (await page.locator("#catalog-shop").count()) === 1
);
const shopOptions = await page.locator("#catalog-shop option").allInnerTexts();
check(
  "the category filter offers all, none yet, and the six categories of the shop",
  shopOptions.join("|") ===
    "All categories|No category yet|Physical|Magical|Defense|Movement|Jungling|Roaming"
);

// ---- sorting several items at once -----------------------------------------------------------------------------------
await page.selectOption("#catalog-shop", "none");
check(
  '"No category yet" shows what is left to sort',
  (await page.locator(".catalog-entry").count()) === 8
);
await page.click("[data-sort-toggle]");
await page.waitForSelector(".sort-panel");
check(
  "sorting turns the lines into boxes to tick, with a panel, and nothing is ticked",
  (await page.locator(".catalog-entry--pick input").count()) === 8 &&
    /0 items selected/.test(await text(page, ".sort-panel")) &&
    (await page.locator("[data-sort-shop][disabled]").count()) === 7 &&
    (await page.locator("[data-sort-slot][disabled]").count()) === 4
);
check(
  "the card on the other side says what to do",
  /Tick the items in the list/.test(await text(page, ".catalog-layout .empty"))
);

const pick = async name => page.locator(`.catalog-entry--pick:has-text("${name}") input`).check();
await page.locator(".catalog-list").evaluate(list => {
  list.dataset.scrollProbe = String(list.scrollTop);
});
await pick("Blade of Despair");
await pick("Giant's Shield");
check(
  "ticking counts, and enables the buttons, without drawing the list again",
  /2 items selected/.test(await text(page, ".sort-panel")) &&
    (await page.locator("[data-sort-shop][disabled]").count()) === 0 &&
    (await page.locator(".catalog-list").getAttribute("data-scroll-probe")) === "0"
);
await page.click('[data-sort-shop="physical"]');
await toast(page, /2 items updated/);
await page.waitForSelector(".sort-panel");
check(
  'one click gives both the category, and the list (still "No category yet") has six left',
  (await itemOf("Blade of Despair")).shopCategory === "physical" &&
    (await itemOf("Giant's Shield")).shopCategory === "physical" &&
    (await page.locator(".catalog-entry").count()) === 6 &&
    /0 items selected/.test(await text(page, ".sort-panel"))
);

// "select all shown" then give them one category; then fix one that does not belong
await page.click("[data-sort-all]");
check(
  '"Select all shown" ticks every line of the list',
  /6 items selected/.test(await text(page, ".sort-panel")) &&
    (await page.locator(".catalog-entry--pick input:checked").count()) === 6
);
await page.click("[data-sort-clear]");
check(
  '"Clear the selection" unticks them',
  /0 items selected/.test(await text(page, ".sort-panel")) &&
    (await page.locator(".catalog-entry--pick input:checked").count()) === 0
);
await pick("Staff of Embers");
await page.click('[data-sort-shop="magical"]');
await toast(page, /1 item updated/);
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 5);
await pick("Boots of Deftness");
await page.click('[data-sort-shop="movement"]');
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 4);
await pick("Hunter's Knife");
await page.click('[data-sort-shop="jungling"]');
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 3);
await pick("Tidal Totem");
await pick("Guardian Charm");
await page.click('[data-sort-shop="roaming"]');
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 1);
check(
  "the other items were sorted the same way, and one is left",
  (await itemOf("Staff of Embers")).shopCategory === "magical" &&
    (await itemOf("Boots of Deftness")).shopCategory === "movement" &&
    (await itemOf("Hunter's Knife")).shopCategory === "jungling" &&
    (await itemOf("Tidal Totem")).shopCategory === "roaming" &&
    (await itemOf("Guardian Charm")).shopCategory === "roaming" &&
    (await itemOf("Late Edge")).shopCategory === null &&
    /Late Edge/.test(await text(page, ".catalog-list"))
);

// the slot, with the same panel
await page.selectOption("#catalog-shop", "");
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 8);
await pick("Guardian Charm");
await pick("Tidal Totem");
await page.click('[data-sort-slot="utility"]');
await waitItem(page, "Tidal Totem", "category", "utility");
await pick("Late Edge");
await page.click('[data-sort-slot="late"]');
await waitItem(page, "Late Edge", "category", "late");
check(
  "the slot is chosen with the same panel, and the category of those items is left alone",
  (await itemOf("Guardian Charm")).category === "utility" &&
    (await itemOf("Tidal Totem")).category === "utility" &&
    (await itemOf("Guardian Charm")).shopCategory === "roaming" &&
    (await itemOf("Late Edge")).category === "late"
);

// a slot that a recommended build needs cannot change, and the page says so
const saved = await admin.browser.put("/api/builds/h01/1", {
  name: "Dusk",
  build: {
    items: [ids["Blade of Despair"], ids["Giant's Shield"]],
    utility: [],
    late: [],
    core: [ids["Blade of Despair"], ids["Giant's Shield"]],
    arcana: {}
  }
});
check("a recommended build uses two of the items", saved.status === 200);
await page.reload();
await page.waitForSelector(".catalog-entry");
await page.click("[data-sort-toggle]");
await pick("Blade of Despair");
await page.click('[data-sort-slot="late"]');
await toast(page, /used by 1 recommended builds/);
check(
  "that item stays where it is, and nothing else changed",
  (await itemOf("Blade of Despair")).category === "regular"
);
await page.click('[data-sort-shop="defense"]');
await waitItem(page, "Blade of Despair", "shopCategory", "defense");
check(
  "its category, which is not a slot, can still change",
  (await itemOf("Blade of Despair")).shopCategory === "defense"
);
await page.click("[data-sort-toggle]");

// ---- the filters and the form -----------------------------------------------------------------------------------------
await page.waitForSelector(".catalog-entry:not(.catalog-entry--pick)");
await page.selectOption("#catalog-shop", "roaming");
await page.waitForFunction(() => document.querySelectorAll(".catalog-entry").length === 2);
check(
  "the category filter keeps the items of the category, and each line says its category",
  (await text(page, ".catalog-list")).includes("Guardian Charm") &&
    (await text(page, ".catalog-list")).includes("Tidal Totem") &&
    (await page.locator(".catalog-entry .pill").allInnerTexts()).every(label => label === "Roaming")
);
await page.selectOption("#catalog-shop", "");
await page.click('.catalog-entry:has-text("Hunter\'s Knife")');
await page.waitForSelector('#catalog-form [name="shopCategory"]');
check(
  "the form of an item has its category next to the slot it goes in",
  (await page.inputValue('#catalog-form [name="shopCategory"]')) === "jungling" &&
    (await page.inputValue('#catalog-form [name="category"]')) === "regular"
);
await page.selectOption('#catalog-form [name="shopCategory"]', "physical");
await page.keyboard.press("Control+Enter");
await waitItem(page, "Hunter's Knife", "shopCategory", "physical");
check("changing it there is saved", (await itemOf("Hunter's Knife")).shopCategory === "physical");
await page.click('.catalog-entry:has-text("Hunter\'s Knife")');
await page.waitForSelector('#catalog-form [name="shopCategory"]');
await page.selectOption('#catalog-form [name="shopCategory"]', "");
await page.keyboard.press("Control+Enter");
await waitItem(page, "Hunter's Knife", "shopCategory", null);
check(
  'and "No category yet" takes it away',
  (await itemOf("Hunter's Knife")).shopCategory === null
);

// ---- the pictures ---------------------------------------------------------------------------------------------------------
const badge = await page.evaluate(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "#c83";
  context.beginPath();
  context.arc(32, 32, 30, 0, 7);
  context.fill();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  return [...new Uint8Array(await blob.arrayBuffer())];
});
await page.click('[data-tab="arcana"]');
await page.click("[data-new]");
await page.waitForSelector("#catalog-file", { state: "attached" });
await page.setInputFiles("#catalog-file", {
  name: "badge.png",
  mimeType: "image/png",
  buffer: Buffer.from(badge)
});
await page.waitForSelector(".catalog-picture-big[src*='/catalog-images/']");
const picture = await page
  .locator(".catalog-picture-big")
  .first()
  .evaluate(image => ({
    src: image.getAttribute("src"),
    srcset: image.getAttribute("srcset")
  }));
check(
  "a picture is asked for in the size it is drawn (72 px: 128 px, and 256 px for a sharp screen)",
  /\?w=128$/.test(picture.src) && /\?w=128 1x, .*\?w=256 2x$/.test(picture.srcset ?? "")
);
const sizes = await page.evaluate(async source => {
  const get = async url => {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    return [bitmap.width, bitmap.height];
  };
  const base = source.split("?")[0];
  return {
    w64: await get(`${base}?w=64`),
    w128: await get(`${base}?w=128`),
    full: await get(base)
  };
}, picture.src);
check(
  "an arcana drawn at 64 px is kept at 128 px (made bigger with care), and every smaller size is cut from it",
  sizes.full[0] === 128 && sizes.w128[0] === 128 && sizes.w64[0] === 64
);

// an arcana before its stats: saved with none
await page.fill('#catalog-form [name="name"]', "Dawn");
await page.evaluate(() => {
  document.querySelector("[data-remove-stat]")?.click();
});
await page.waitForFunction(() => document.querySelectorAll("[data-stat-line]").length === 0);
await page.keyboard.press("Control+Enter");
await until(page, "the arcana Dawn is saved", async () =>
  (await catalogOf()).arcana.some(entry => entry.name === "Dawn")
);
check(
  "an arcana can be saved before its stats are written",
  (await catalogOf()).arcana.some(entry => entry.name === "Dawn" && entry.stats.length === 0)
);
const thumb = await page.locator(".catalog-list .catalog-picture").first().getAttribute("srcset");
check(
  "the small picture of a list line asks for 64 px (128 px for a sharp screen)",
  /\?w=64 1x, .*\?w=128 2x$/.test(thumb ?? "")
);

// ---- the build lab: the chips narrow the items down ---------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/build-lab`);
await visitor.waitForSelector(".lab-grid");
check(
  "the lab offers the categories now that some items are sorted",
  (await visitor.locator(".lab-categories button").allTextContents()).join("|") ===
    "All|Physical|Magical|Defense|Movement|Jungling|Roaming"
);
const labItems = async () =>
  (await visitor.locator(".lab-grid .it b").allTextContents()).sort().join("|");
await visitor.click('.lab-categories [data-shop="magical"]');
check(
  "a chip keeps the items of that category",
  (await labItems()) === "Staff of Embers" &&
    (await visitor
      .locator('.lab-categories [data-shop="magical"]')
      .getAttribute("aria-pressed")) === "true"
);
await visitor.click('.lab-categories [data-shop="roaming"]');
check(
  "the groups of slots and the chips work together: no Roaming item in the main group",
  /No match/.test(await text(visitor, "#lab-grid"))
);
await visitor.click('.lab-tabs [data-tab="utility"]');
check(
  "...and in the utility group there they are",
  (await labItems()) === "Guardian Charm|Tidal Totem"
);
await visitor.click('.lab-categories [data-shop=""]');
check('"All" shows the group again', (await labItems()) === "Guardian Charm|Tidal Totem");
await visitor.click('.lab-grid .it:has-text("Tidal Totem")');
await visitor.waitForSelector(".piece-details");
check(
  "the details of an item say its slot and its category",
  /Utility item\s*·\s*Roaming/.test(await text(visitor, ".piece-details"))
);

// ---- phone width ----------------------------------------------------------------------------------------------------------
const phone = await open(admin, 390);
await phone.goto(`${app.baseUrl}/catalog`);
await phone.waitForSelector("[data-tab]");
await phone.click('[data-tab="items"]');
await phone.click("[data-sort-toggle]");
await phone.waitForSelector(".sort-panel");
check("the catalog sorting panel fits a phone", await noSideScroll(phone));
const labPhone = await open(null, 390);
await labPhone.goto(`${app.baseUrl}/build-lab`);
await labPhone.waitForSelector(".lab-categories");
check("the lab with its category chips fits a phone", await noSideScroll(labPhone));

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nitem categories e2e clean"
);
process.exit(problems.length ? 1 : 0);
