// Browser check of the guides editor (/guides): who sees it, the list of heroes, writing a build with
// the rules checked live, saving it, the unsaved-changes question, deleting it.
import { chromium } from "playwright";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";
import { openHeroTab } from "../../../testing/nav.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const helper = await app.signIn("Helper");
const plain = await app.signIn("Plain");

const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const hp = await post("/api/admin/catalog/stats", { name: "Max HP", sortOrder: 1 });
const upload = await fetch(`${app.baseUrl}/api/admin/catalog/images`, {
  method: "POST",
  headers: {
    "content-type": "image/png",
    cookie: `hok_session=${admin.browser.jar.get("hok_session")}`
  },
  body: await sharp({ create: { width: 64, height: 64, channels: 3, background: "#33aa77" } })
    .png()
    .toBuffer()
});
const image = (await upload.json()).id;
const item = (name, category) =>
  post("/api/admin/catalog/items", {
    name,
    category,
    imageId: image,
    stats: [{ statId: hp, value: 10 }]
  });
const boots = await item("Swift Boots", "boots");
const blade = await item("Blade", "regular");
const staff = await item("Staff", "regular");
await post("/api/admin/catalog/arcana", {
  name: "Zeal",
  color: "red",
  imageId: image,
  stats: [{ statId: hp, value: 1 }]
});
// the Contributor label opens the page to a person who is not an administrator
await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, {
  labels: ["contributor"]
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, width = 1440, height = 1200) => {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies([
    { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
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

// ---- a person who is not an editor ---------------------------------------------------------------
const visitor = await open(plain);
await visitor.goto(`${app.baseUrl}/guides`);
await visitor.waitForSelector("main h1");
check(
  "a person who is not an editor sees no entry in the menu and a sentence on the page",
  (await visitor.locator("#nav-guides[hidden]").count()) === 1 &&
    /Contributor label/.test(await visitor.locator("main").innerText()) &&
    (await visitor.locator(".bed").count()) === 0
);

// ---- the editor ------------------------------------------------------------------------------------
const page = await open(helper);
await page.goto(`${app.baseUrl}/guides`);
await page.waitForSelector(".bed-hero");
check(
  "a Contributor has the entry in the menu, under the separator of the editors",
  (await page.locator("#nav-guides:not([hidden])").count()) === 1 &&
    (await page.locator("#nav-catalog[hidden]").count()) === 1 &&
    (await page.locator("#nav-tournaments[hidden]").count()) === 1
);
check(
  "the heroes are listed with how many builds each has, and none is chosen yet",
  (await page.locator(".bed-hero").count()) >= 30 &&
    /0\/2/.test(await page.locator('.bed-hero[data-bed-hero="h05"]').textContent()) &&
    /Choose a hero/.test(await textOf(page, "#bed-main")) // the title is written in capitals by the style
);
await page.fill("#bed-search", "05");
check(
  "the search narrows the list",
  (await page.locator(".bed-hero").count()) === 1 &&
    (await page.locator('.bed-hero[data-bed-hero="h05"]').count()) === 1
);
await page.click('.bed-hero[data-bed-hero="h05"]');
await page.waitForSelector("#bed-name");
check(
  "choosing a hero opens its two builds, in the address too",
  /\/guides\/h05$/.test(page.url()) &&
    (await page.locator(".bed-variants button").count()) === 2 &&
    (await page.locator("[data-bed-save]").isDisabled())
);
check(
  "the rules are listed, none is met yet",
  (await page.locator(".bed-checks li.todo").count()) === 2 &&
    /2 or 3 core items/.test(await page.locator("#bed-checks").innerText())
);

await page.click(`[data-add="item:${boots}"]`);
await page.click(`[data-add="item:${blade}"]`);
await page.click(`[data-add="item:${staff}"]`);
check(
  "adding pieces does not meet the rules by itself (the core items are to be marked)",
  (await page.locator("[data-bed-save]").isDisabled()) &&
    (await page.locator(".bed-checks li.todo").count()) === 1
);
await page.click(`[data-toggle-core="${staff}"]`);
await page.click(`.build-slot[data-piece="item:${blade}"]`);
await page.click(`[data-toggle-core="${blade}"]`);
check(
  "two core items are marked: the rules are met and the build can be saved",
  (await page.locator(".bed-checks li.todo").count()) === 0 &&
    (await page.locator("[data-bed-save]").isEnabled()) &&
    /not saved yet/i.test(await page.locator("#bed-dirty").innerText())
);
await page.fill("#bed-name", "Burst");
await page.fill("#bed-note", "Take the blade first.");
await page.fill("#bed-source", "http://example.test/not-https");
check(
  "a source that is not a https link is refused before saving",
  (await page.locator("[data-bed-save]").isDisabled()) &&
    (await page.locator(".bed-checks li.todo").count()) === 1
);
await page.fill("#bed-source", "https://example.test/guide");
check("and accepted once it is", await page.locator("[data-bed-save]").isEnabled());

// leaving a build that is not saved asks first
page.once("dialog", dialog => dialog.dismiss());
await page.click('[data-bed-variant="2"]');
check(
  "going to the other build with changes not saved asks first, and stays when the answer is no",
  (await page.locator('[data-bed-variant="1"].on').count()) === 1 &&
    (await page.inputValue("#bed-name")) === "Burst"
);

await page.click("[data-bed-save]");
await page.waitForFunction(() => document.querySelector("#toasts")?.innerText.length > 0);
const stored = (await app.browser().get("/api/heroes/h05")).body.builds;
check(
  "the build is saved with its name, note, source and core items",
  stored.length === 1 &&
    stored[0].variant === 1 &&
    stored[0].name === "Burst" &&
    stored[0].note === "Take the blade first." &&
    stored[0].sourceUrl === "https://example.test/guide" &&
    stored[0].build.core.length === 2 &&
    stored[0].build.items.length === 3
);
await page.fill("#bed-search", "");
check(
  "the list counts it (1/2) and nothing is left unsaved",
  /1\/2/.test(await page.locator('.bed-hero[data-bed-hero="h05"]').textContent()) &&
    (await page.locator("#bed-dirty").innerText()).trim() === ""
);
const [[row]] = await app.store.pool.query(
  "SELECT updated_by FROM hero_build_sets WHERE hero_id = 'h05' AND variant = 1"
);
check("the build records who wrote it", row.updated_by === helper.user.id);

// the second build is empty, and the first one is still there when coming back
await page.click('[data-bed-variant="2"]');
check(
  "the second build is empty: no name, nothing in it, nothing to delete",
  (await page.inputValue("#bed-name")) === "" &&
    (await page.locator(".build-view .slot-item").count()) === 0 &&
    (await page.locator("[data-bed-delete]").count()) === 0
);
await page.click('[data-bed-variant="1"]');
check(
  "the first one comes back as it was saved",
  (await page.inputValue("#bed-name")) === "Burst" &&
    (await page.locator(".build-view .slot-item").count()) === 3 &&
    (await page.locator(".build-slot.is-core").count()) === 2
);

// the filters of the list
await page.click('[data-bed-filter="none"]');
check(
  "the list can show the heroes without a build only",
  (await page.locator('.bed-hero[data-bed-hero="h05"]').count()) === 0 &&
    (await page.locator(".bed-hero").count()) >= 29
);
await page.click('[data-bed-filter="some"]');
check("or the ones that have one", (await page.locator(".bed-hero").count()) === 1);
await page.click('[data-bed-filter="all"]');

// the hero sheet, for this person and for a visitor
await page.goto(`${app.baseUrl}/heroes`);
await page.click('.hcard[data-hero-id="h05"]');
await openHeroTab(page, "builds");
await page.waitForSelector(".build-card");
check(
  "on the hero sheet an editor has a way back to the editor, a visitor has not",
  (await page.locator('.build-card a[href^="/guides/h05"]').count()) === 1 &&
    /Edit the builds/i.test(await page.locator(".build-lab-link").innerText())
);
await page.click('.build-card a[href^="/guides/h05"]');
await page.waitForSelector("#bed-name");
check(
  "that link opens the editor on this hero and this build",
  /\/guides\/h05/.test(page.url()) && (await page.inputValue("#bed-name")) === "Burst"
);

// deleting asks first, then removes
page.once("dialog", dialog => dialog.dismiss());
await page.click("[data-bed-delete]");
check(
  "deleting a build asks first: nothing is removed when the answer is no",
  (await (await app.browser().get("/api/heroes/h05")).body.builds.length) === 1
);
page.once("dialog", dialog => dialog.accept());
await page.click("[data-bed-delete]");
await page.waitForFunction(
  () => document.querySelector(".bed-hero.active .pill")?.textContent === "0/2"
);
check(
  "and removes it when the answer is yes: the hero is back to 0/2",
  (await (await app.browser().get("/api/heroes/h05")).body.builds.length) === 0
);

// an administrator has the same page, and the rest of the administrators' entries
const chief = await open(admin);
await chief.goto(`${app.baseUrl}/guides/h05`);
await chief.waitForSelector("#bed-name");
check(
  "an administrator reaches the editor too, with the other entries of the administrators",
  (await chief.locator("#nav-guides:not([hidden])").count()) === 1 &&
    (await chief.locator("#nav-catalog:not([hidden])").count()) === 1 &&
    /h05|Hero/i.test(await chief.locator(".bed-hero.active").textContent())
);

// ---- a phone: the pieces to pick from stay in their box --------------------------------------------------------
// (the build lab lets them run down the page because its sheet is a drawer; here the sheet is in the page, under the
// box: the box has to scroll inside, or the sheet is drawn over the pieces that run out of it)
for (let index = 0; index < 24; index += 1) {
  await item(`Piece ${String(index).padStart(2, "0")}`, "regular");
}
const small = await open(admin, 390, 844);
await small.goto(`${app.baseUrl}/guides/h05`);
await small.waitForSelector("#bed-name");
await small.waitForSelector("#lab-grid .it");
const reach = await small.evaluate(() => {
  const grid = document.querySelector("#lab-grid");
  const tiles = [...grid.querySelectorAll(".it")];
  const covered = [];
  for (const tile of tiles) {
    tile.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const box = tile.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    if (!top || !tile.contains(top)) {
      covered.push(tile.textContent.trim().slice(0, 20));
    }
  }
  return { tiles: tiles.length, covered, scrolls: grid.scrollHeight > grid.clientHeight };
});
check(
  `on a phone the ${reach.tiles} pieces to pick from scroll inside their box and none is under the sheet of the build`,
  reach.tiles > 20 && reach.scrolls && reach.covered.length === 0
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nguides e2e clean");
process.exit(problems.length ? 1 : 0);
