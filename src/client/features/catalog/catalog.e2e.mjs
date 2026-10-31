// Browser check of the Catalog page: administrators only; stats, a tag, an item with a picture,
// several effects and stats, an arcana.
import { chromium } from "playwright";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";
import { pickName } from "../../../testing/name-pick.js";

const app = await startTestServer();
const admin = await app.signIn("Admin", { admin: true });
const plain = await app.signIn("Plain");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async user => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([
    { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};

const visitor = await open(plain);
await visitor.goto(`${app.baseUrl}/catalog`);
await visitor.waitForSelector("text=This page is for administrators.");
check(
  "a plain account is told the page is for administrators",
  (await visitor.locator("#nav-catalog:not([hidden])").count()) === 0
);

const page = await open(admin);
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
check(
  "the administrator has the Catalog link",
  (await page.locator("#nav-catalog:not([hidden])").count()) === 1
);

// Stats
await page.click('[data-tab="stats"]');
await page.click("[data-new]");
for (const [name, unit] of [
  ["Max HP", "flat"],
  ["Crit Rate", "percent"],
  ["Physical Defense", "flat"],
  ["Magic Defense", "flat"]
]) {
  await page.fill('#catalog-form [name="name"]', name);
  await page.selectOption('#catalog-form [name="unit"]', unit);
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(
    text => document.querySelector(".catalog-list")?.innerText.includes(text),
    name
  );
}
check(
  "four stats are listed, each ready for the next (Ctrl+Enter)",
  (await page.locator(".catalog-entry").count()) === 4
);

// Tag
await page.click('[data-tab="tags"]');
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Physical");
await page.selectOption('#catalog-form [name="color"]', "red");
await page.click('#catalog-form button[type="submit"]');
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Physical")
);

// Item with a picture, two stats and three effects
await page.click('[data-tab="items"]');
await page.click("[data-new]");
await page.setInputFiles("#catalog-file", {
  name: "blade.png",
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 300, height: 300, channels: 4, background: "#ffa500" } })
    .png()
    .toBuffer()
});
await page.waitForSelector(".catalog-picture-big[src^='/catalog-images/']");
check("the picture is uploaded and shown", true);
await page.fill('#catalog-form [name="name"]', "Sunblade");
await page.selectOption('#catalog-form [name="category"]', "regular");
await page.click('[data-add-stat="stat"]');
await page.fill('[name="stat-0-value"]', "400");
await page.click('[data-add-stat="stat"]');
await pickName(page, "stat-1-id", { label: "Crit Rate (%)" });
await page.fill('[name="stat-1-value"]', "15");
for (const [kind, name] of [
  ["passive", "Edge"],
  ["passive", "Blaze"],
  ["active", "Flash"]
]) {
  await page.click("[data-add-effect]");
  const index = (await page.locator(".effect-row").count()) - 1;
  await page.selectOption(`[name="effect-${index}-kind"]`, kind);
  await page.fill(`[name="effect-${index}-name"]`, name);
  await page.fill(`[name="effect-${index}-text"]`, `${name} text`);
  if (kind === "active") {
    await page.fill(`[name="effect-${index}-cooldown"]`, "60");
  }
}
check(
  "the form keeps what was typed while rows are added",
  (await page.inputValue('[name="stat-0-value"]')) === "400" &&
    (await page.locator(".effect-row").count()) === 3
);
await page.check('input[name="tags"]');
await page.keyboard.press("Control+Enter");
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Sunblade")
);

const catalog = (await app.browser().get("/api/catalog")).body;
const item = catalog.items.find(entry => entry.name === "Sunblade");
check(
  "the item is stored with its picture, stats, three effects and tag",
  Boolean(item.imageId) &&
    item.stats.length === 2 &&
    item.effects.map(entry => entry.kind).join() === "passive,passive,active" &&
    item.effects[2].cooldownSeconds === 60 &&
    item.tags.length === 1
);

// Arcana with four stats; a fifth cannot be added
await page.click('[data-tab="arcana"]');
await page.click("[data-new]");
await page.fill('#catalog-form [name="name"]', "Zeal");
for (let index = 0; index < 4; index += 1) {
  if (index > 0) {
    await page.click('[data-add-stat="stat"]');
  }
  await page.fill(`[name="stat-${index}-value"]`, String(index + 1));
}
check(
  "an arcana offers at most four stats",
  (await page.locator('[data-add-stat="stat"]').count()) === 0
);
await page.click('#catalog-form button[type="submit"]');
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Zeal")
);
check(
  "the arcana is stored with its 4 stats",
  (await app.browser().get("/api/catalog")).body.arcana[0].stats.length === 4
);

// Edit (rename) and delete
await page.click('[data-tab="items"]');
await page.click('.catalog-entry:has-text("Sunblade")');
await page.fill('#catalog-form [name="name"]', "Sunblade II");
await page.click('#catalog-form button[type="submit"]');
await page.waitForFunction(() =>
  document.querySelector(".catalog-list")?.innerText.includes("Sunblade II")
);
page.once("dialog", dialog => dialog.accept());
await page.click('.catalog-entry:has-text("Sunblade II")');
await page.click("[data-delete]");
await page.waitForFunction(() => !document.querySelector(".catalog-list"));
check(
  "an item can be renamed and deleted",
  (await app.browser().get("/api/catalog")).body.items.length === 0
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ncatalog e2e clean");
process.exit(problems.length ? 1 : 0);
