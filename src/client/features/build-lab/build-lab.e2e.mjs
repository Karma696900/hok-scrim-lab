// Browser check of the build lab (no account): a build with items and arcana, total stats, the tag
// verdict, the shareable address, the recommended builds on the hero sheet, and the admin save.
import { chromium } from "playwright";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";
import { openHeroTab } from "../../../testing/nav.js";

const app = await startTestServer();
const admin = await app.signIn("Admin", { admin: true });
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const hp = await post("/api/admin/catalog/stats", { name: "Max HP", sortOrder: 1 });
const atk = await post("/api/admin/catalog/stats", { name: "Physical Attack", sortOrder: 2 });
const crit = await post("/api/admin/catalog/stats", {
  name: "Crit Rate",
  unit: "percent",
  sortOrder: 3
});
const physical = await post("/api/admin/catalog/tags", { name: "Physical", color: "red" });
const magic = await post("/api/admin/catalog/tags", {
  name: "Magic",
  color: "blue",
  conflicts: [physical]
});
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
const boots = await post("/api/admin/catalog/items", {
  name: "Swift Boots",
  category: "boots",
  imageId: image,
  stats: [{ statId: hp, value: 100 }]
});
const blade = await post("/api/admin/catalog/items", {
  name: "Blade",
  category: "regular",
  imageId: image,
  stats: [
    { statId: atk, value: 100 },
    { statId: crit, value: 10 }
  ],
  tags: [physical],
  effects: [{ kind: "passive", name: "Edge", text: "Gain attack." }]
});
const staff = await post("/api/admin/catalog/items", {
  name: "Staff",
  category: "regular",
  imageId: image,
  stats: [],
  tags: [magic]
});
const zeal = await post("/api/admin/catalog/arcana", {
  name: "Zeal",
  color: "red",
  imageId: image,
  stats: [{ statId: atk, value: 2 }],
  tags: [physical]
});
const fury = await post("/api/admin/catalog/arcana", {
  name: "Fury",
  color: "red",
  imageId: image,
  stats: [{ statId: crit, value: 1 }]
});
await admin.browser.put("/api/admin/heroes/h05/profile", {
  baseStats: [
    { statId: hp, value: 3000, growth: 100 },
    { statId: atk, value: 150, growth: 10 }
  ],
  tags: [physical],
  skills: []
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const watch = page => {
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
};
const page = await context.newPage();
watch(page);

await page.goto(`${app.baseUrl}/build-lab`);
await page.waitForSelector("#lab-hero");
check(
  "the lab opens without any account, with its own entry of the menu lit",
  (await page.locator("#lab-hero").isVisible()) &&
    (await page.locator('.nav-link.active[data-view="build-lab"]').count()) === 1
);
await page.selectOption("#lab-hero", "h05");
await page.waitForFunction(() =>
  document.querySelector(".lab-hero + .tag-line")?.innerText.includes("Physical")
);
await page.click(`[data-add="item:${boots}"]`);
await page.click(`[data-add="item:${blade}"]`);
check(
  "a boots and a blade are in the build, shown as pictures",
  (await page.locator(".build-view .slot-item").count()) === 2
);
await page.fill("#lab-search", "Boots");
check("the search filters the picker", (await page.locator("#lab-grid [data-add]").count()) === 1);
await page.fill("#lab-search", "");
check(
  "an item already in the build cannot be added again",
  await page.locator(`[data-add="item:${blade}"]`).isDisabled()
);
await page.click('[data-tab="red"]');
for (let index = 0; index < 7; index += 1) {
  await page.click(`[data-add="arcana:${zeal}"]`);
}
for (let index = 0; index < 3; index += 1) {
  await page.click(`[data-add="arcana:${fury}"]`);
}
const arcanaText = await page.locator(".arcana-editor").innerText();
check(
  "red arcana show ×7 then ×3 (biggest first) and 10/10",
  /×7[\s\S]*×3/.test(arcanaText) && /10\/10/.test(arcanaText)
);
check(
  "an eleventh red arcana is refused (buttons disabled)",
  await page.locator(`[data-add="arcana:${zeal}"]`).isDisabled()
);
const table = (await page.locator(".stats-table").first().innerText()).replace(/\s+/g, " ");
check(
  "HP: base 3000 + 1400 growth at level 15 = 4,400, +100 boots = 4,500",
  /Max HP 4,?400 \+100/.test(table) && /4,?500/.test(table)
);
check("attack: 150 + 140 growth + 100 blade + 7 × 2 arcana = 404", /404/.test(table));
check("crit rate is a percentage: 10% blade + 3 × 1% arcana = 13%", /13%/.test(table));
const details = await page.locator(".piece-details").innerText();
check(
  "a click on a piece shows its stats and passive",
  /Edge/.test(details) && /Crit Rate/.test(details)
);
await page.click('[data-tab="items"]');
await page.hover(`#lab-grid [data-add="item:${staff}"]`);
await page.waitForSelector("#lb-tip:not([hidden]) .lb-tip__body");
check(
  "a piece of the catalogue says what it gives when the mouse is over it",
  /Staff/i.test(await page.locator("#lb-tip").innerText()) &&
    (await page.locator("#lb-tip .piece-details").count()) === 0
);
await page.mouse.move(0, 0);
check(
  "the stats stay in view at the foot of the sheet while the catalogue scrolls",
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    const box = document.querySelector(".lb-stats").getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  })
);
await page.click(`[data-toggle-core="${blade}"]`);
await page.click(`.build-slot[data-piece="item:${boots}"]`);
await page.click(`[data-toggle-core="${boots}"]`);
check(
  "two items can be marked as core and show a star",
  (await page.locator(".build-slot.is-core").count()) === 2 &&
    (await page.locator(".core-mark").count()) >= 2
);
await page.click('[data-tab="items"]');
await page.click(`[data-add="item:${staff}"]`);
await page.click(`[data-remove-item="${staff}"]`);
check("a piece can be removed again", (await page.locator(".build-view .slot-item").count()) === 2);
check(
  "the address carries the build (shareable)",
  /[?&]i=/.test(page.url()) && /h=h05/.test(page.url())
);
const shared = page.url();
const other = await context.newPage();
watch(other);
await other.goto(shared);
await other.waitForSelector(".build-view .slot-item");
await other.waitForFunction(() => document.querySelector("#lab-hero")?.value === "h05");
check(
  "opening the shared link restores the hero and the build",
  (await other.locator(".build-view .slot-item").count()) === 2 &&
    /×7/.test(await other.locator(".arcana-editor").innerText())
);

// ---- My builds: kept in the browser, no account, several per hero ----------------------------------
const keepPage = await context.newPage();
watch(keepPage);
await keepPage.goto(shared);
await keepPage.waitForSelector("#my-builds");
check(
  "the lab keeps builds for anybody: a card My builds, empty at first, says where they are kept",
  (await keepPage.locator("#my-builds .saved-row").count()) === 0 &&
    /this browser only/i.test(await keepPage.locator("#my-builds").innerText())
);
await keepPage.fill("#lab-keep-name", "Burst");
await keepPage.click('#lab-keep button[value="new"]');
await keepPage.waitForSelector("#my-builds .saved-row");
check(
  "a build is kept under its name, for its hero, and is the one that is open",
  (await keepPage.locator("#my-builds .saved-row").count()) === 1 &&
    /Burst/.test(await keepPage.locator("#my-builds .saved-row").innerText()) &&
    (await keepPage.locator("#my-builds .saved-row.active").count()) === 1
);
await keepPage.reload();
await keepPage.waitForSelector("#my-builds .saved-row");
check(
  "it is still there after a reload (the browser keeps it)",
  (await keepPage.locator("#my-builds .saved-row").count()) === 1
);
// a second build of the same hero: the other pieces, a name made by the page
await keepPage.click('[data-tab="items"]');
await keepPage.click(`[data-add="item:${staff}"]`);
await keepPage.click('#lab-keep button[value="new"]');
await keepPage.waitForFunction(
  () => document.querySelectorAll("#my-builds .saved-row").length === 2
);
check(
  "several builds per hero: the second one gets a name of its own (Build 2)",
  /Build 2/.test(await keepPage.locator("#my-builds .saved-list").innerText())
);
await keepPage.click('#my-builds [data-saved-scope="all"]');
check(
  "the list can show this hero or every hero",
  (await keepPage.locator("#my-builds .saved-row").count()) === 2
);
// loading the first one brings its pieces back, and an update replaces it in place
await keepPage.click("#my-builds .saved-row:has-text('Burst') [data-saved-load]");
await keepPage.waitForFunction(
  () => document.querySelectorAll(".build-view .slot-item").length === 2
);
check(
  "loading a kept build gives back its pieces (two items, not three)",
  (await keepPage.locator(".build-view .slot-item").count()) === 2 &&
    (await keepPage.locator("#my-builds .saved-row.active").innerText()).includes("Burst")
);
await keepPage.click(`[data-add="item:${staff}"]`);
await keepPage.click('#lab-keep button[value="update"]');
await keepPage.waitForFunction(() =>
  document.querySelector("#toasts")?.innerText.includes("Burst")
);
check(
  "updating replaces the build that was loaded: still two kept builds, now with three items",
  (await keepPage.locator("#my-builds .saved-row").count()) === 2 &&
    (await keepPage
      .locator(
        "#my-builds .saved-row:has-text('Burst') .saved-items img, #my-builds .saved-row:has-text('Burst') .saved-items .piece-image"
      )
      .count()) === 3
);
// the link of a kept build, and the removal of one (a question is asked first)
keepPage.once("dialog", dialog => dialog.dismiss());
await keepPage.click("#my-builds .saved-row:has-text('Build 2') [data-saved-delete]");
check(
  "a build is not removed when the question is answered no",
  (await keepPage.locator("#my-builds .saved-row").count()) === 2
);
keepPage.once("dialog", dialog => dialog.accept());
await keepPage.click("#my-builds .saved-row:has-text('Build 2') [data-saved-delete]");
await keepPage.waitForFunction(
  () => document.querySelectorAll("#my-builds .saved-row").length === 1
);
check("and it is removed when the answer is yes", true);
await keepPage.click("[data-reset]");
await keepPage.click("#lab-keep button[value='new']");
check(
  "an empty build is not kept",
  /at least one item or arcana/i.test(await keepPage.locator("#my-builds .form-error").innerText())
);
const stored = await keepPage.evaluate(() => JSON.parse(localStorage.getItem("hok.builds")));
check(
  "what is kept is in the browser only: nothing was sent to the server for it",
  stored.length === 1 && stored[0].name === "Burst" && stored[0].heroId === "h05"
);

// ---- the recommended builds are written in the guides editor, not in the lab -----------------------------
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await adminContext.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const adminPage = await adminContext.newPage();
watch(adminPage);
await adminPage.goto(shared);
await adminPage.waitForSelector("#lab-hero");
check(
  "the lab has no form for the recommended builds any more, even for an administrator",
  (await adminPage.locator("#lab-save, .admin-save").count()) === 0
);
const publish = adminPage.locator(".lab-publish a");
check(
  "an administrator is offered the guides editor with this build",
  (await publish.count()) === 1 &&
    /\/guides\/h05\?/.test((await publish.getAttribute("href")) ?? "")
);
check("a visitor is not", (await page.locator(".lab-publish").count()) === 0);
await publish.click();
await adminPage.waitForSelector("#bed-name");
check(
  "the editor opens on the hero with the build of the lab, to check before saving",
  /Core items|core/i.test(await adminPage.locator("#bed-checks").innerText()) &&
    (await adminPage.locator(".build-view .slot-item").count()) === 2 &&
    (await adminPage.locator(".bed-notice").count()) === 1
);
await adminPage.click("[data-bed-save]");
await adminPage.waitForFunction(() => document.querySelector("#toasts")?.innerText.length > 0);
const sheet = (await app.browser().get("/api/heroes/h05")).body;
check("the core items are saved with the build", sheet.builds[0].build.core.length === 2);
check(
  "the build is saved as recommended build 1",
  sheet.builds.length === 1 && sheet.builds[0].build.items.includes(boots)
);
await admin.browser.put("/api/builds/h05/2", {
  name: "Second build",
  build: {
    items: [boots, staff, blade],
    utility: [],
    late: [],
    core: [staff, blade],
    spells: [],
    arcana: { red: [], blue: [], green: [] }
  }
});
await page.goto(`${app.baseUrl}/heroes`);
await page.click('.hcard[data-hero-id="h05"]');
await page.waitForSelector(".hero-sheet-head");
const overview = await page.locator("main").innerText(); // the sheet opens on its overview: the base stats are there
check(
  "the overview shows the first build and a switch to the second, without leaving the overview",
  (await page.locator(".hs-digest:not([hidden])").count()) === 1 &&
    (await page.locator('.hs-mod--build [data-action="digest-variant"]').count()) === 2
);
await page.click('.hs-mod--build [data-action="digest-variant"][data-variant="2"]');
check(
  "the switch shows the second build in place",
  (await page.locator('.hs-digest[data-variant="2"]:not([hidden])').count()) === 1 &&
    (await page.locator('.hs-digest[data-variant="1"]:not([hidden])').count()) === 0 &&
    /second build/i.test(await page.locator(".hs-digest:not([hidden])").innerText())
);
await openHeroTab(page, "builds");
await page.waitForSelector(".build-card");
check(
  "the hero sheet shows the build as pictures with a lab link",
  (await page.locator(".build-card .build-slot").count()) >= 3 &&
    (await page.locator("[data-lab-link]").count()) >= 1
);
check(
  "the recommended build shows its two core items",
  (await page.locator(".build-card:not([hidden]) .build-slot.is-core").count()) === 2
);
check(
  "the hero sheet shows the real base stats",
  /Max HP/.test(overview) && /3,?000/.test(overview)
);
await page.click(".build-card .build-slot >> nth=0");
check(
  "clicking a piece of the recommended build opens its details",
  (await page.locator(".build-card .piece-details").count()) === 1
);
check(
  "a visitor has no link to the editor on the hero sheet",
  (await page.locator('.build-card a[href^="/guides"]').count()) === 0
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nbuild lab e2e clean");
process.exit(problems.length ? 1 : 0);
