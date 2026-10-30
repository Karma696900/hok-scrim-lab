// Browser check of the hero data editor (administrators): base stats with growth, tags, and the
// numbers of a spell.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Admin", { admin: true });
await admin.browser.post("/api/admin/catalog/stats", { name: "Max HP", sortOrder: 1 });
const atk = (
  await admin.browser.post("/api/admin/catalog/stats", { name: "Physical Attack", sortOrder: 2 })
).body.id;
const tag = (
  await admin.browser.post("/api/admin/catalog/tags", { name: "Marksman", color: "gold" })
).body.id;

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
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

await page.goto(`${app.baseUrl}/heroes`);
await page.click('.hcard[data-hero-id="h06"]');
await page.waitForSelector('[data-action="edit-hero-data"]');
check(
  "a hero without data says so and offers the editor to an administrator",
  /have not been entered yet/.test(await page.locator("main").innerText())
);
await page.click('[data-action="edit-hero-data"]');
await page.waitForSelector(".hero-editor-dialog[open] .hero-editor");
await page.check('.hero-editor-dialog input[name="tags"]');
await page.click("[data-add-base]");
await page.fill('[name="base-0-value"]', "3200");
await page.fill('[name="base-0-growth"]', "120");
await page.click("[data-add-base]");
await page.selectOption('[name="base-1-id"]', String(atk));
await page.fill('[name="base-1-value"]', "160");
check(
  "rows keep what was typed while others are added",
  (await page.inputValue('[name="base-0-value"]')) === "3200"
);
await page.click("[data-add-skill]");
await page.selectOption('[name="skill-0-key"]', "1");
await page.fill('[name="skill-0-name"]', "Quick Shot");
await page.fill('[name="skill-0-cooldown"]', "8, 7.5, 7, 6.5, 6, 5.5");
await page.fill('[name="skill-0-cost"]', "60 65 70");
await page.fill('[name="skill-0-costLabel"]', "Mana");
await page.fill('[name="skill-0-range"]', "7.5");
await page.click("[data-add-part]");
await page.fill('[name="part-0-0-label"]', "Damage");
await page.fill('[name="part-0-0-values"]', "100, 150, 200, 250, 300, 350");
await page.click("[data-add-scale]");
await page.selectOption('[name="scale-0-0-0-id"]', String(atk));
await page.fill('[name="scale-0-0-0-percent"]', "90");
await page.fill('[name="skill-0-notes"]', "Cannot crit.");
await page.click('.hero-editor-dialog button[type="submit"]');
await page.waitForFunction(() => !document.querySelector(".hero-editor-dialog[open]"));

const profile = (await app.browser().get("/api/heroes/h06")).body.profile;
check(
  "the profile is stored: tags, stats with growth, the spell with its numbers and scaling",
  profile.tags[0] === tag &&
    profile.baseStats.length === 2 &&
    profile.baseStats[0].growth === 120 &&
    profile.skills[0].cooldown.join() === "8,7.5,7,6.5,6,5.5" &&
    profile.skills[0].cost.join() === "60,65,70" &&
    profile.skills[0].components[0].scaling[0].percent === 90 &&
    profile.skills[0].notes === "Cannot crit."
);
const text = await page.locator("main").innerText();
check(
  "the sheet now shows the hero's stats at level 1 and 15 and its tag",
  /Max HP/.test(text) && /3,?200/.test(text) && /4,?880/.test(text) && /Marksman/.test(text)
);

// A wrong number list is refused with a clear message, and nothing is lost.
await page.click('[data-action="edit-hero-data"]');
await page.waitForSelector(".hero-editor-dialog[open] .hero-editor");
await page.fill('[name="skill-0-cooldown"]', "8, abc");
await page.click('.hero-editor-dialog button[type="submit"]');
await page.waitForFunction(
  () => document.querySelector(".hero-editor-dialog .form-error")?.textContent.trim().length > 0
);
check(
  "a cooldown that is not a list of numbers is refused, the dialog stays open",
  /numbers/.test(await page.locator(".hero-editor-dialog .form-error").innerText()) &&
    (await page.locator(".hero-editor-dialog[open]").count()) === 1
);

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nhero editor e2e clean"
);
process.exit(problems.length ? 1 : 0);
