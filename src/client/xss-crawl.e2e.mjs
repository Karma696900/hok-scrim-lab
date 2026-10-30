// Stored markup, everywhere: the demonstration world is built, then every free-text field of the database
// (names, notes, descriptions, titles, messages, labels, and the words inside the JSON of series, tier lists,
// notes, scenarios…) is overwritten with a payload that breaks out of an attribute and opens an image and an element.
// Every page of the site is then opened as each kind of person (visitor, captain, administrator) and its tabs
// are opened one by one: not one of them may show the payload as anything but text. The content policy already
// stops an inline handler from running; this test looks for what it only hides, the markup itself.
import { chromium } from "playwright";
import { demoPages, seedDemoWorld } from "../../scripts/dev/demo-data.mjs";
import { poisonDatabase } from "../testing/poison.js";
import { sampleHeroes, startTestServer } from "../testing/test-app.js";

/**
 * What to look for in a page once it is drawn: injected elements, an event handler attribute anywhere, or a
 * script that ran. Runs in the page.
 */
export function injectionInPage() {
  const found = [];
  if (window.__xss) {
    found.push("a payload script ran");
  }
  if (document.querySelector("#__xss")) {
    found.push("an element made of stored text (#__xss)");
  }
  if (document.querySelector('img[src="x"]')) {
    found.push('an <img src="x"> made of stored text');
  }
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name)) {
        found.push(`<${element.localName} ${attribute.name}>`);
      }
    }
  }
  return found;
}

// a roster as big as the real one: the demonstration series draft 20 heroes per game, five games
const app = await startTestServer({ seedHeroes: false });
if (!app) {
  throw new Error("MySQL is not reachable (docker compose up -d mysql)");
}
await app.store.saveHeroes(sampleHeroes(120), "20260925");
app.config.adminEmails.add("demoadmin@demo.test");
const world = await seedDemoWorld({ store: app.store, baseUrl: app.baseUrl });
const poisoned = await poisonDatabase(app.store.pool, app.database.config.database);
console.log(
  `${poisoned.length} columns hold the payload (${poisoned.reduce((sum, item) => sum + item.rows, 0)} values)`
);

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
check(
  "the poison reached the people, the teams, the notes and the JSON of series and tier lists",
  ["users.name", "teams.name", "series.data_json", "tier_lists.data_json"].every(column =>
    poisoned.some(item => item.column === column)
  )
);

// the detector itself: markup that really is injected must be seen, or a silent run would prove nothing
{
  const probe = await (await chromium.launch()).newPage();
  await probe.setContent("<body><p>probe</p></body>");
  await probe.evaluate(() =>
    document.body.insertAdjacentHTML("beforeend", `"><img src=x><u id=__xss>`)
  );
  const seen = await probe.evaluate(injectionInPage);
  check("the detector sees injected markup", seen.length >= 2);
  await probe.context().browser().close();
}

let shownAsText = 0;
const TABS = '[role="tab"], [data-tab], [data-section], [data-lane-tab], .lane-tabs button';
const browser = await chromium.launch();
let opened = 0;
for (const entry of demoPages(world, "h01")) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (entry.who) {
    await context.addCookies([
      { name: "hok_session", value: world.people[entry.who].token, url: app.baseUrl }
    ]);
  }
  const tab = await context.newPage();
  tab.on("dialog", dialog => dialog.dismiss());
  const found = new Set();
  tab.on("console", message => {
    if (/Content Security Policy|Refused to (execute|load|apply)/.test(message.text())) {
      found.add(`the policy refused something: ${message.text().slice(0, 110)}`);
    }
  });
  tab.on("pageerror", error => found.add(`error: ${error.message.slice(0, 110)}`));
  await tab.goto(`${app.baseUrl}${entry.path}`);
  await tab
    .waitForSelector("html[data-ready='1']", { timeout: 20000 })
    .catch(() => found.add("the page never settled"));
  await tab.waitForTimeout(500);
  for (const item of await tab.evaluate(injectionInPage)) {
    found.add(item);
  }
  // each tab of the page, once: what a tab draws on demand is looked at too
  const count = Math.min(await tab.locator(TABS).count(), 14);
  for (let index = 0; index < count; index += 1) {
    const target = tab.locator(TABS).nth(index);
    if (await target.isVisible().catch(() => false)) {
      await target.click({ timeout: 1500 }).catch(() => {});
      await tab.waitForTimeout(150);
      for (const item of await tab.evaluate(injectionInPage)) {
        found.add(item);
      }
    }
  }
  if (await tab.evaluate(() => document.body.textContent.includes("<img src=x"))) {
    shownAsText += 1;
  }
  opened += 1;
  check(
    `${entry.name}${entry.who ? ` (${entry.who})` : ""}: stored text stays text${count ? `, ${count} tab(s) opened` : ""}`,
    found.size === 0
  );
  for (const item of found) {
    console.log(`     ${item}`);
  }
  await context.close();
}
check(
  `the payload was on screen, as text, on ${shownAsText} pages (not hidden by a page that failed to draw)`,
  shownAsText >= 15
);
check("every page of the tour was opened", opened === demoPages(world, "h01").length);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nxss-crawl e2e passed");
