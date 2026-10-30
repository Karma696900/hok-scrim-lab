// Browser check of the welcome pages: a new account lands on them once, chooses the parts it wants
// (the community stays), the menu follows, the choice survives a reload, a hidden part still opens
// from its address, and the pages can be reopened. A visitor is never sent there, and keeps their
// choice in the browser.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const user = await app.signIn("Newcomer", { onboarded: false });
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (account, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
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
  return page;
};
const visible = async (page, view) =>
  (await page.locator(`#main-nav .nav-link[data-view="${view}"]:not([hidden])`).count()) === 1;

// ---- a new account is sent to the welcome pages -------------------------------------------------
const page = await open(user);
await page.goto(`${app.baseUrl}/`);
await page.waitForURL(/\/welcome$/);
await page.waitForSelector(".onboarding");
check(
  "a new account lands on the welcome pages",
  /Welcome to HOK Global Scrim Lab/.test(await textOf(page, ".onboarding")) // textContent: the title is drawn in capitals by the style
);
check(
  "four steps are shown, the first is current",
  (await page.locator(".onboarding-steps li").count()) === 4 &&
    (await page.locator('.onboarding-steps li[aria-current="step"]').count()) === 1
);
await page.click("[data-next]");
await page.waitForSelector(".module-list");
check(
  "the optional parts are offered, all ticked at first",
  (await page.locator("input[data-module]:checked").count()) === 4
);
check(
  "the community is shown as always on, and cannot be unticked",
  (await page.locator(".mod.locked input:disabled:checked").count()) === 1
);
await page.uncheck('input[data-module="training"]');
await page.uncheck('input[data-module="tier-lists"]');
await page.click("[data-next]");
await page.waitForSelector(".community-points");
check(
  "the community step lists its six pages",
  (await page.locator(".community-points > div").count()) === 6
);
await page.click("[data-back]");
check(
  "going back keeps the choice",
  (await page.locator("input[data-module]:checked").count()) === 2
);
await page.click("[data-next]");
await page.click("[data-next]");
await page.waitForSelector(".start-list");
const starts = await page.locator(".start-list a").allInnerTexts();
check(
  "the last step suggests where to start, only for the chosen parts",
  starts.some(text => /Create a series/.test(text)) &&
    !starts.some(text => /Choose your heroes/.test(text)) &&
    starts.some(text => /team/i.test(text))
);
await page.click("[data-next]");
await page.waitForURL(url => new URL(url).pathname === "/");
check(
  "the menu hides the parts that were switched off",
  !(await visible(page, "training")) && !(await visible(page, "tier-lists"))
);
check(
  "the chosen parts and the whole community stay",
  (await visible(page, "scrims")) &&
    (await visible(page, "heroes")) &&
    (await visible(page, "teams")) &&
    (await visible(page, "find")) &&
    (await visible(page, "agenda")) &&
    (await visible(page, "inbox")) &&
    (await visible(page, "settings"))
);

await page.reload();
await page.waitForSelector("#main-nav");
await page.waitForTimeout(600);
check(
  "the choice survives a reload, and the welcome pages do not come back",
  new URL(page.url()).pathname === "/" && !(await visible(page, "training"))
);
await page.goto(`${app.baseUrl}/training`);
await page.waitForSelector(".training-tabs");
check(
  "a hidden part still opens from its address",
  (await page.locator(".training-tabs").count()) === 1
);

// ---- the settings page ----
// Settings is in the menu of the avatar chip (not in the sidebar)
check(
  "Settings is in the side navigation, as in the mock-up",
  (await page.locator('#main-nav a[href="/settings"]').count()) === 1
);
await page.click("#account-trigger");
check(
  "the avatar chip opens a menu",
  (await page.locator(".pop--account").count()) === 1 &&
    (await page.locator('#account-trigger[aria-expanded="true"]').count()) === 1
);
check(
  "with profile, player page, My space, Settings, account security, Discord and sign out",
  (await page.locator(".pop--account [role=menuitem]").count()) === 7
);
await page.keyboard.press("Escape");
check(
  "Escape closes it and gives the focus back",
  (await page.locator(".pop--account").count()) === 0 &&
    (await page.evaluate(() => document.activeElement?.id)) === "account-trigger"
);
await page.click("#account-trigger");
await page.click('.pop--account a[href="/settings"]');
await page.waitForURL(url => new URL(url).pathname === "/settings");
await page.waitForSelector("#settings-form");
check(
  "Settings shows the current parts, the community locked",
  (await page.locator('input[name="module"]:checked').count()) === 2 &&
    (await page.locator('input[name="module"][value="training"]:checked').count()) === 0 &&
    (await page.locator(".mod.locked input:disabled").count()) === 1
);
check(
  "the save bar is hidden until something changes",
  (await page.locator("#settings-savebar[hidden]").count()) === 1
);
await page.locator('input[name="module"][value="training"]').click();
check(
  "changing a switch shows the save bar",
  (await page.locator("#settings-savebar:not([hidden])").count()) === 1
);
await page.click("#settings-discard");
check(
  "discarding goes back to the saved state",
  (await page.locator("#settings-savebar[hidden]").count()) === 1 &&
    (await page.locator('input[name="module"][value="training"]:checked').count()) === 0
);
await page.locator('input[name="module"][value="training"]').click();
await page.locator('input[name="bestOf"][value="5"]').click();
await page.locator('input[name="gameMode"][value="classic"]').click();
await page.selectOption("#set-start", "/training");
await page.locator('input[name="reduceMotion"]').click();
await page.click('#settings-form button[type="submit"]');
await page.waitForFunction(
  () => document.querySelector('#main-nav [data-view="training"]')?.hidden === false
);
check("a part switched on again comes back in the menu", await visible(page, "training"));
check(
  "reduced animations are applied at once",
  await page.evaluate(() => document.documentElement.classList.contains("reduce-motion"))
);
const saved = (await user.browser.get("/api/me/preferences")).body;
check(
  "the server holds the settings",
  saved.settings.bestOf === 5 &&
    saved.settings.gameMode === "classic" &&
    saved.settings.startPage === "/training" &&
    saved.settings.reduceMotion === true &&
    saved.modules.includes("training")
);
await page.goto(`${app.baseUrl}/scrims`);
await page.waitForSelector("#best-of");
check(
  "a new series starts with the chosen defaults",
  (await page.inputValue("#best-of")) === "5" &&
    (await page
      .locator('[data-action="set-game-mode"][data-mode="classic"][aria-pressed="true"]')
      .count()) === 1
);
await page.goto(`${app.baseUrl}/`);
await page.waitForURL(url => new URL(url).pathname === "/training");
check("the start page opens when coming to the site", new URL(page.url()).pathname === "/training");
await page.goto(`${app.baseUrl}/settings`);
await page.waitForSelector("#settings-form");
await page.click('a[href="/welcome"]');
await page.waitForSelector(".onboarding .module-list");
check(
  "the welcome pages can be replayed from Settings",
  (await page.locator("input[data-module]").count()) === 4
);
await page.check('input[data-module="training"]');
await page.click("[data-skip]");
await page.waitForURL(url => new URL(url).pathname === "/");
check(
  "'Skip, keep everything' puts every part back",
  (await visible(page, "training")) && (await visible(page, "tier-lists"))
);
const stored = await user.browser.get("/api/me/preferences");
check(
  "the server holds the choice",
  stored.body.onboarded === true && stored.body.modules.length === 4
);

// ---- a visitor ----------------------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/`);
await visitor.waitForSelector("#main-nav");
await visitor.waitForTimeout(600);
check("a visitor is not sent to the welcome pages", new URL(visitor.url()).pathname === "/");
check(
  "a visitor's menu has no training (it needs an account), but keeps the rest",
  !(await visible(visitor, "training")) && (await visible(visitor, "scrims"))
);
await visitor.goto(`${app.baseUrl}/welcome`);
await visitor.waitForSelector(".onboarding");
await visitor.click("[data-next]");
await visitor.uncheck('input[data-module="heroes"]');
await visitor.click("[data-next]");
check(
  "a visitor is told the community needs an account",
  (await visitor.locator('.onboarding a[href="/register"]').count()) === 1
);
await visitor.click("[data-next]");
await visitor.click("[data-next]");
await visitor.waitForURL(url => new URL(url).pathname === "/");
check(
  "a visitor's choice is applied",
  !(await visible(visitor, "heroes")) &&
    !(await visible(visitor, "build-lab")) &&
    (await visible(visitor, "scrims"))
);
await visitor.reload();
await visitor.waitForSelector("#main-nav");
await visitor.waitForTimeout(600);
check("and kept in the browser", !(await visible(visitor, "heroes")));

// ---- phone --------------------------------------------------------------------------------------
const phone = await open(user, 390);
await phone.goto(`${app.baseUrl}/welcome`);
await phone.waitForSelector(".onboarding");
await phone.waitForSelector(".module-list");
check(
  "no horizontal scroll on a phone",
  await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);

// ---- reduced motion: the buttons under the list of parts answer a real click -----------------------------------
// Without the entrance animation, the invisible checkboxes of the cards were painted over the sticky footer and the
// buttons did not answer any more (people who ask their system for less motion could not leave the step).
for (const [width, height] of [
  [1440, 640],
  [390, 844]
]) {
  const calm = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  await calm.addCookies([
    { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const still = await calm.newPage();
  await still.goto(`${app.baseUrl}/welcome`);
  await still.waitForSelector(".module-list");
  // a real pointer click in the middle of the button, after having checked that the button is what is there
  const press = async selector => {
    const middle = await still.locator(selector).evaluate(button => {
      const box = button.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      return { x, y, uncovered: button.contains(document.elementFromPoint(x, y)) };
    });
    await still.mouse.click(middle.x, middle.y);
    return middle.uncovered;
  };
  const reaches = label =>
    still
      .waitForFunction(
        text => document.querySelector(".ob-count")?.textContent.includes(text),
        label,
        { timeout: 3000 }
      )
      .then(
        () => true,
        () => false
      );
  check(
    `reduced motion, ${width} x ${height}: Back and Continue are not covered, and each click moves one step`,
    (await press("[data-back]")) &&
      (await reaches("Step 1 of 4")) &&
      (await press("[data-next]")) &&
      (await reaches("Step 2 of 4")) &&
      (await press("[data-next]")) &&
      (await reaches("Step 3 of 4")) &&
      (await press("[data-back]")) &&
      (await reaches("Step 2 of 4"))
  );
  await calm.close();
}

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nonboarding e2e passed");
