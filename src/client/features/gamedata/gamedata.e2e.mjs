// Browser check of the data of the game: /items, /arcana and /spells (public pages, a shop of icons with
// a filter and the details of the open piece), the spells tab of the catalogue (an administrator writes
// them like the items) and the spells in a build (one or two in the lab, kept by the shared link).
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Keeper", { admin: true });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
await post("/api/admin/catalog/stats", { name: "Attack" });
const sword = await post("/api/admin/catalog/items", {
  name: "Long Sword",
  category: "regular",
  shopCategory: "physical",
  price: 1200,
  stats: []
});
await post("/api/admin/catalog/items", {
  name: "Swift Boots",
  category: "boots",
  shopCategory: "movement",
  stats: []
});
await post("/api/admin/catalog/arcana", { name: "Zeal", color: "red", stats: [] });
await post("/api/admin/catalog/arcana", { name: "Insight", color: "blue", stats: [] });
await post("/api/admin/catalog/spells", {
  name: "Flash",
  description: "Teleports a short distance.",
  cooldownSeconds: 120,
  unlockLevel: 1
});
await post("/api/admin/catalog/spells", { name: "Heal" }); // nothing entered about it: nothing shown
await post("/api/admin/catalog/spells", { name: "Stun", cooldownSeconds: 90 });

const browser = await chromium.launch();
const open = async (who, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
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
const count = (page, selector) => page.locator(selector).count();

// ---- the three public pages, as a visitor ------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/items`);
await visitor.waitForSelector(".gd-tile");
check("the items page shows both items as tiles", (await count(visitor, ".gd-tile")) === 2);
check(
  "its heading and its tab are the right ones",
  /^items$/i.test(await visitor.locator("h1").innerText()) &&
    (await visitor.locator('.gd-tab[aria-current="page"]').textContent()) === "Items"
);
check(
  "the tab bar has the three pages",
  (await visitor.locator(".gd-tab").allTextContents()).join("|") === "Items|Arcana|Spells"
);
check(
  "the menu entry is highlighted",
  (await visitor.locator("#main-nav .nav-link.active").textContent()).trim() === "Items"
);
check("the title of the tab is the one of the route", /items/i.test(await visitor.title()));
check(
  "the six categories of the shop are all drawn, with how many items each holds (none: 0)",
  (
    await visitor
      .locator(".gd-chips [data-shop]:not([data-shop=''])")
      .evaluateAll(chips =>
        chips.map(chip => `${chip.dataset.shop}:${chip.querySelector("em").textContent}`)
      )
  ).join(" ") === "physical:1 magical:0 defense:0 movement:1 jungling:0 roaming:0"
);
await visitor.click('.gd-chips [data-shop="movement"]');
check(
  "the shop category narrows the list to the boots",
  (await count(visitor, ".gd-tile")) === 1 &&
    /Swift Boots/.test(await visitor.locator(".gd-grid").innerText())
);
await visitor.click('.gd-chips [data-shop=""]');
await visitor.fill("#gd-search", "sword");
check(
  "the search narrows by name and keeps the focus",
  (await count(visitor, ".gd-tile")) === 1 &&
    (await visitor.evaluate(() => document.activeElement?.id)) === "gd-search"
);
await visitor.click(".gd-tile");
check(
  "a tile opens its details (name, price)",
  /Long Sword/i.test(await visitor.locator("#gd-detail").innerText()) &&
    /1,200/.test(await visitor.locator("#gd-detail").innerText())
);
await visitor.click(".gd-tile");
check(
  "a second click closes them",
  /Choose a piece/i.test(await visitor.locator("#gd-detail").innerText())
);

await visitor.click('.gd-tab[href="/arcana"]');
await visitor.waitForURL("**/arcana");
await visitor.waitForSelector(".gd-tile");
check(
  "arcana: both, with their colour as a filter",
  (await count(visitor, ".gd-tile")) === 2 &&
    (await count(visitor, '.gd-chips [data-color="red"]')) === 1
);
await visitor.click('.gd-chips [data-color="red"]');
check(
  "red arcana only",
  (await count(visitor, ".gd-tile")) === 1 &&
    /Zeal/.test(await visitor.locator(".gd-grid").innerText())
);

await visitor.click('.gd-tab[href="/spells"]');
await visitor.waitForURL("**/spells");
await visitor.waitForSelector(".gd-tile");
check(
  "spells: the three, the menu entry highlighted",
  (await count(visitor, ".gd-tile")) === 3 &&
    (await visitor.locator("#main-nav .nav-link.active").textContent()).trim() === "Spells"
);
const flashTile = visitor.locator(".gd-tile", { hasText: "Flash" });
check(
  "a spell tile says its cooldown and level",
  /Cooldown: 120 s/.test(await flashTile.innerText()) && /level 1/.test(await flashTile.innerText())
);
const healTile = visitor.locator(".gd-tile", { hasText: "Heal" });
check(
  "nothing is invented for a spell nobody described",
  !/Cooldown|level/.test(await healTile.innerText())
);
await flashTile.click();
check(
  "the details give the description",
  /Teleports a short distance/.test(await visitor.locator("#gd-detail").innerText())
);
check(
  "direct address works too (a reload)",
  await visitor.reload().then(async () => {
    await visitor.waitForSelector(".gd-tile");
    return (await count(visitor, ".gd-tile")) === 3;
  })
);
check(
  "the page does not scroll sideways on desktop",
  await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);

// On a phone and on a small laptop the sheet of a piece is a sheet at the bottom of the screen (above the tab bar of the
// phone), never a block stretched from under the top bar: its `top` of the desktop (sticky) must not leak into it.
for (const [width, lift] of [
  [390, 76],
  [1100, 12]
]) {
  const small = await open(null, width);
  await small.goto(`${app.baseUrl}/spells`);
  await small.waitForSelector(".gd-tile");
  await small.locator(".gd-tile", { hasText: "Flash" }).click();
  const sheet = await small.evaluate(() => {
    const box = document.querySelector("#gd-detail").getBoundingClientRect();
    return { bottom: box.bottom, width: box.width, screen: window.innerHeight };
  });
  check(
    `at ${width} px the sheet of a piece rests on the bottom of the screen, and is not wider than 640 px`,
    Math.abs(sheet.bottom - (sheet.screen - lift)) <= 1 && sheet.width <= 640
  );
}

// ---- the catalogue: the spells tab -------------------------------------------------------------------------
const staff = await open(admin);
await staff.goto(`${app.baseUrl}/catalog`);
await staff.waitForSelector("[data-tab]");
await staff.click('[data-tab="spells"]');
await staff.waitForSelector(".catalog-entry");
check("the spells tab lists the three spells", (await count(staff, ".catalog-entry")) === 3);
await staff.click("[data-new]");
await staff.fill('#catalog-form [name="name"]', "Purify");
await staff.fill('#catalog-form [name="cooldownSeconds"]', "75");
await staff.fill('#catalog-form [name="unlockLevel"]', "4");
await staff.fill('#catalog-form [name="description"]', "Removes control effects.");
await staff.click('#catalog-form [type="submit"]');
for (let attempt = 0; attempt < 60; attempt += 1) {
  if ((await count(staff, ".catalog-entry")) === 4) {
    break;
  }
  await staff.waitForTimeout(100);
}
check("a new spell is saved and listed", (await count(staff, ".catalog-entry")) === 4);
const seen = (await app.browser().get("/api/catalog")).body.spells.find(
  spell => spell.name === "Purify"
);
check("with the numbers that were typed", seen?.cooldownSeconds === 75 && seen?.unlockLevel === 4);
await staff.click(".catalog-entry:has-text('Purify')");
await staff.fill('#catalog-form [name="cooldownSeconds"]', "60");
await staff.click('#catalog-form [type="submit"]');
await staff.waitForTimeout(600);
check(
  "a spell is edited",
  (await app.browser().get("/api/catalog")).body.spells.find(spell => spell.name === "Purify")
    ?.cooldownSeconds === 60
);

// ---- spells in a build ---------------------------------------------------------------------------------------
const lab = await open(null);
await lab.goto(`${app.baseUrl}/build-lab`);
await lab.waitForSelector('.lab-tabs [data-tab="spells"]');
await lab.click('.lab-tabs [data-tab="spells"]');
check("the picker has a Spells tab with every spell", (await count(lab, "#lab-grid .it")) === 4);
await lab.click('#lab-grid .it:has-text("Flash")');
check(
  "a spell goes into one of the two spell slots",
  (await count(lab, '.build-group--spells .build-slot[data-piece^="spell:"]')) === 1 &&
    (await count(lab, ".build-group--spells .slot-free")) === 1
);
await lab.click('#lab-grid .it:has-text("Stun")');
check(
  "a second one fills the other",
  (await count(lab, '.build-group--spells .build-slot[data-piece^="spell:"]')) === 2 &&
    (await count(lab, ".build-group--spells .slot-free")) === 0
);
check(
  "a third one is not offered",
  (await count(lab, "#lab-grid .it:not([disabled])")) === 2 &&
    (await lab.locator('#lab-grid .it:has-text("Heal")').isDisabled())
);
const address = new URL(lab.url());
check("the address keeps both (s=)", /^\d+\.\d+$/.test(address.searchParams.get("s") ?? ""));
await lab.click('#lab-grid .it:has-text("Stun")');
check(
  "clicking a chosen spell takes it out",
  (await count(lab, '.build-group--spells .build-slot[data-piece^="spell:"]')) === 1
);
await lab.click('#lab-grid .it:has-text("Stun")');

const shared = await open(null);
await shared.goto(lab.url());
await shared.waitForSelector('.build-group--spells .build-slot[data-piece^="spell:"]');
check(
  "the shared link opens the same two spells",
  (await count(shared, '.build-group--spells .build-slot[data-piece^="spell:"]')) === 2
);
await shared.click('.build-group--spells .build-slot[data-piece^="spell:"]');
check(
  "a spell of the build opens its details with its cooldown",
  /Cooldown: \d+ s/.test(await shared.locator(".piece-details").first().innerText())
);

// a build with an item and a spell, kept on the device
await shared.click('.lab-tabs [data-tab="items"]');
await shared.click(`#lab-grid .it:has-text("Long Sword")`);
const kept = await shared.evaluate(() => document.querySelector("#lab-keep") !== null);
check("the page still draws the keep form (nothing broke)", kept);
void sword;

// ---- the order of the pieces ---------------------------------------------------------------------------------
// arcana by colour (red, blue, green) then by name; the Roaming items by type (Guardian, Crimson Shadow) then by name
for (const [name, color] of [
  ["Vigor", "green"],
  ["Ardor", "red"],
  ["Calm", "green"],
  ["Balance", "blue"]
]) {
  await post("/api/admin/catalog/arcana", { name, color, stats: [] });
}
for (const name of [
  "Crimson Shadow - Radiance",
  "Guardian - Starspring",
  "Crimson Shadow - Howl",
  "Guardian - Howl"
]) {
  await post("/api/admin/catalog/items", {
    name,
    category: "regular",
    shopCategory: "roaming",
    stats: []
  });
}
const titles = page =>
  page
    .locator(".gd-tile")
    .evaluateAll(tiles => tiles.map(tile => tile.getAttribute("title")).join("|"));
const ordered = await open(null);
await ordered.goto(`${app.baseUrl}/arcana`);
await ordered.waitForSelector(".gd-tile");
check(
  "arcana: the reds, then the blues, then the greens, by name inside a colour",
  (await titles(ordered)) === "Ardor|Zeal|Balance|Insight|Calm|Vigor"
);
await ordered.click('.gd-chips [data-color="green"]');
check("one colour: the same order", (await titles(ordered)) === "Calm|Vigor");
await ordered.click('.gd-chips [data-color=""]');
check(
  "all of them again: the same order",
  (await titles(ordered)) === "Ardor|Zeal|Balance|Insight|Calm|Vigor"
);
await ordered.goto(`${app.baseUrl}/items`);
await ordered.waitForSelector(".gd-tile");
check(
  "items: all of them go by name",
  (await titles(ordered)) ===
    "Crimson Shadow - Howl|Crimson Shadow - Radiance|Guardian - Howl|Guardian - Starspring|Long Sword|Swift Boots"
);
await ordered.click('.gd-chips [data-shop="roaming"]');
check(
  "Roaming: Guardian first, then Crimson Shadow, by name inside a type",
  (await titles(ordered)) ===
    "Guardian - Howl|Guardian - Starspring|Crimson Shadow - Howl|Crimson Shadow - Radiance"
);
check(
  "and the Roaming chip says how many",
  (await ordered.locator('.gd-chips [data-shop="roaming"] em').textContent()) === "4"
);

// the picker of the build lab lists them the same way
const picker = await open(null);
await picker.goto(`${app.baseUrl}/build-lab`);
await picker.waitForSelector("#lab-grid .it");
const cells = page =>
  page
    .locator("#lab-grid .it")
    .evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")).join("|"));
await picker.click('.lab-categories [data-shop="roaming"]');
check(
  "the picker: Roaming goes by type, then by name",
  (await cells(picker)) ===
    "Guardian - Howl|Guardian - Starspring|Crimson Shadow - Howl|Crimson Shadow - Radiance"
);
await picker.click('.lab-tabs [data-tab="red"]');
check("the picker: the red arcana by name", (await cells(picker)) === "Ardor|Zeal");
await picker.click('.lb-pills [data-tab="blue"]');
check("the picker: the blue arcana by name", (await cells(picker)) === "Balance|Insight");

// ---- the search of the top bar finds the pieces of the game ---------------------------------------------------------
const finder = await open(null);
await finder.goto(`${app.baseUrl}/`);
await finder.waitForSelector("html[data-ready='1']");
await finder.keyboard.press("Control+k");
await finder.fill("#palette-input", "zeal");
await finder.waitForSelector('.palette__item:has-text("Zeal")');
check(
  "the search finds an arcana, under its own heading, with its colour",
  (await finder.locator(".palette__group").allTextContents()).includes("Arcana") &&
    /Red/.test(await finder.locator('.palette__item:has-text("Zeal")').innerText())
);
await finder.fill("#palette-input", "sword");
await finder.waitForSelector('.palette__item:has-text("Long Sword")');
await finder.keyboard.press("Enter");
await finder.waitForURL(/\/items\?piece=\d+$/);
await finder.waitForSelector(".gd-tile.is-open");
check(
  "choosing an item opens /items on the sheet of that item",
  (await finder.locator(".gd-tile.is-open b").textContent()) === "Long Sword" &&
    (await finder.locator("#gd-detail h3").first().textContent()) === "Long Sword"
);
await finder.keyboard.press("Control+k");
await finder.fill("#palette-input", "flash");
await finder.waitForSelector('.palette__item:has-text("Flash")');
await finder.keyboard.press("Enter");
await finder.waitForURL(/\/spells\?piece=\d+$/);
await finder.waitForSelector(".gd-tile.is-open");
check(
  "a spell too, from another page of the data",
  (await finder.locator(".gd-tile.is-open b").textContent()) === "Flash"
);
await finder.keyboard.press("Control+k");
check(
  "nothing typed: no piece in the list",
  (await finder.locator(".palette__item").count()) > 0 &&
    (await finder
      .locator('.palette__group:text-is("Items"), .palette__group:text-is("Arcana")')
      .count()) === 0
);

// ---- a phone ---------------------------------------------------------------------------------------------------
const phone = await open(null, 390);
await phone.goto(`${app.baseUrl}/spells`);
await phone.waitForSelector(".gd-tile");
check(
  "on a phone: no sideways scroll",
  await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);
check(
  "on a phone: the tabs fill the width",
  (await phone.locator(".gd-tabs").boundingBox()).width > 300
);

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
