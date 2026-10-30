// Browser check of the other names of a hero: an administrator adds and removes them on the sheet (the chips follow without
// reloading), a refused name says why, and a visitor or a plain account never sees the block.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer({ seedHeroes: false });
await app.store.saveHeroes(
  ["611", "612"].map(id => ({
    id,
    name: `Hero ${id}`,
    image: `https://camp.honorofkings.com/${id}.png`,
    roles: ["Fighter"],
    lanes: ["Clash Lane"],
    sourceIds: [id]
  })),
  "20261018"
);
const admin = await app.signIn("AliasBoss", { admin: true });
const plain = await app.signIn("AliasPlain");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();
const open = async account => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (account) {
    await context.addCookies([
      { name: "hok_session", value: account.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    if (
      ["error", "warning"].includes(message.type()) &&
      !/status of 40[0-9]|Failed to load resource/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  await page.goto(`${app.baseUrl}/heroes/611`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  await page.waitForSelector(".hs-scene h1");
  return page;
};

const page = await open(admin);
await page.waitForSelector(".hs-aliases__form");
check(
  "an administrator sees the block, empty at first",
  (await page.locator(".hs-alias").count()) === 0 &&
    (await page.locator(".hs-aliases__none").count()) === 1
);
await page.fill(".hs-aliases__form input", "The Rising Star");
await page.press(".hs-aliases__form input", "Enter");
await page.waitForSelector(".hs-alias");
check(
  "a name typed in the field is added as a chip, and the field is empty again",
  (await page.locator(".hs-alias span").first().textContent()) === "The Rising Star" &&
    (await page.inputValue(".hs-aliases__form input")) === ""
);
check(
  "the server keeps it under its key",
  JSON.stringify((await admin.browser.get("/api/admin/heroes/611/aliases")).body.aliases) ===
    JSON.stringify([{ alias: "The Rising Star", key: "therisingstar" }])
);
// the name of another hero is refused, and the chips stay as they were
await page.fill(".hs-aliases__form input", "Hero 612");
await page.press(".hs-aliases__form input", "Enter");
await page.waitForTimeout(600);
check("the name of another hero is refused", (await page.locator(".hs-alias").count()) === 1);
await page.click(".hs-alias .x");
await page.waitForSelector(".hs-aliases__none");
check(
  "the cross of a chip takes the name away",
  (await admin.browser.get("/api/admin/heroes/611/aliases")).body.aliases.length === 0
);

const visitor = await open(null);
check("a visitor does not see the block", (await visitor.locator(".hs-aliases").count()) === 0);
const member = await open(plain);
check(
  "a plain account does not see it either",
  (await member.locator(".hs-aliases").count()) === 0
);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nhero aliases e2e passed");
