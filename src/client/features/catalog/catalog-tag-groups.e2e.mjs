// Browser check of the tags sorted by colour in the Catalog: the groups are named in the Tags tab (Enter in
// a name saves them), the tags of an item are shown group by group and a search hides the groups left
// empty, Enter in a field of an item takes what was typed without saving the item, and a tag is merged
// into another one from its form. What was saved is read back from the API.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const burst = await post("/api/admin/catalog/tags", { name: "Burst", color: "red" });
const slow = await post("/api/admin/catalog/tags", { name: "Slow", color: "orange" });
const twin = await post("/api/admin/catalog/tags", { name: "Burst damage", color: "red" });
const blade = await post("/api/admin/catalog/items", {
  name: "Blade",
  category: "regular",
  stats: [],
  effects: [],
  tags: [twin]
});
const read = async () => (await app.browser().get("/api/catalog")).body;

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const until = async (test, label) => {
  for (let tries = 0; tries < 40; tries += 1) {
    if (await test()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  check(label, false);
  return false;
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
page.on("dialog", dialog => dialog.accept());

// the names of the groups, in the Tags tab: Enter in a name saves them
await page.goto(`${app.baseUrl}/catalog`);
await page.click('[data-tab="tags"]');
await page.fill('[name="group-red"]', "Dégâts");
await page.fill('[name="group-orange"]', "Contrôles");
await page.press('[name="group-orange"]', "Enter");
await until(async () => (await read()).tagGroups.red === "Dégâts", "the groups are saved");
check("both names are saved", (await read()).tagGroups.orange === "Contrôles");
await page.waitForSelector('.ct-group-cell:has-text("Dégâts")');
const cells = await page.locator(".ct-group-cell").allTextContents();
check(
  `the list is sorted by group, red before orange (${cells.join(", ")})`,
  cells.join(",") === "Dégâts,Dégâts,Contrôles"
);
await page.click('[data-color="orange"]');
check(
  "the chip of a group shows only its tags",
  (await page.locator(".ct-group-cell").allTextContents()).join(",") === "Contrôles"
);

// the tags of an item, group by group
await page.click('[data-tab="items"]');
await page.click('.catalog-entry:has-text("Blade")');
await page.waitForSelector(".tag-group__name");
check(
  "the tags of an item are shown under the names of their groups",
  (await page.locator(".tag-group__name").allTextContents()).join(",") === "Dégâts,Contrôles"
);
await page.fill("[data-box-filter]", "slo");
check(
  "a search hides the groups left without a tag in view (a ticked tag stays)",
  (await page.locator("[data-tag-group]:not([hidden]) .tag-group__name").allTextContents()).join(
    ","
  ) === "Dégâts,Contrôles" &&
    (await page.locator('.tag-box:has-text("Burst"):not(:has-text("damage"))').isHidden())
);
await page.fill("[data-box-filter]", "zzz");
check(
  "the group with only a ticked tag stays, the other goes",
  (await page.locator("[data-tag-group]:not([hidden]) .tag-group__name").allTextContents()).join(
    ","
  ) === "Dégâts"
);

// Enter in a field takes what was typed, it does not save the item
await page.fill('#catalog-form [name="name"]', "Blade of Enter");
await page.press('#catalog-form [name="name"]', "Enter");
await page.waitForTimeout(600);
const item = (await read()).items.find(entry => entry.id === blade);
check(`Enter does not save the item (still "${item.name}")`, item.name === "Blade");
check(
  "the form is still open with what was typed",
  (await page.inputValue('#catalog-form [name="name"]')) === "Blade of Enter"
);
await page.click("[data-cancel]");

// a tag merged into another one
await page.click('[data-tab="tags"]');
await page.click('.catalog-entry:has-text("Burst damage")');
await page.selectOption('[name="mergeInto"]', String(burst));
await page.click("[data-merge-tag]");
await until(
  async () => !(await read()).tags.some(tag => tag.id === twin),
  "the merged tag is gone"
);
const after = await read();
check(
  "the item carries the tag that stays",
  after.items.find(entry => entry.id === blade).tags.join() === String(burst)
);
check(
  "the other tags are untouched",
  after.tags.some(tag => tag.id === slow)
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ncatalog tag groups e2e clean"
);
process.exit(problems.length ? 1 : 0);
