// Browser check of the shell: the top bar (language menu, theme, notifications, account menu, the
// command palette), the side navigation and its display switches, the phone drawer and tab bar.
import { chromium } from "playwright";
import { startTestServer } from "../../testing/test-app.js";
import { goNav } from "../../testing/nav.js";

const app = await startTestServer();
const user = await app.signIn("Karma", { admin: true });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();
const open = async ({ account = null, width = 1440, height = 900, cookies = [] } = {}) => {
  const context = await browser.newContext({ viewport: { width, height } });
  const all = [...cookies];
  if (account) {
    all.push({ name: "hok_session", value: account.browser.jar.get("hok_session") });
  }
  await context.addCookies(all.map(cookie => ({ ...cookie, url: app.baseUrl })));
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
const ready = async page => {
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
};

// ---- a visitor ----------------------------------------------------------------------------------
const visitor = await open();
await visitor.goto(`${app.baseUrl}/`);
await ready(visitor);
check(
  "a visitor sees the sign-in and sign-up buttons, no bell, no account-only entries",
  (await visitor.locator('#account-control a:has-text("Sign in")').count()) === 1 &&
    (await visitor.locator('#account-control a:has-text("Create account")').count()) === 1 &&
    !(await visitor.locator("#topbar-notifications").isVisible()) &&
    (await visitor.locator("#nav-inbox:not([hidden])").count()) === 0 &&
    (await visitor.locator("#nav-tournaments:not([hidden])").count()) === 0
);
check(
  "the menu: Overview, then the groups Play, Heroes, Game data, My team and Me, each with its entries (no training: it needs an account)",
  (
    await visitor
      .locator("#main-nav > .nav-home span, #main-nav .nav-group__btn span")
      .allTextContents()
  ).join("|") === "Overview|Play|Heroes|Game data|My team|Me" &&
    (await visitor.locator("#main-nav .nav-link:not([hidden]) span").allTextContents()).join(
      "|"
    ) ===
      "Overview|Scrims & Drafts|Live draft|Find a scrim|History|Heroes & Builds|Build lab|Tier Lists|Popular|Items|Arcana|Spells|Teams|Settings"
);
check(
  "the current page is marked in the menu",
  (
    await visitor.locator('#main-nav .nav-link.active[aria-current="page"]').textContent()
  ).trim() === "Overview"
);

// ---- the language menu --------------------------------------------------------------------------
await visitor.click("#language-button");
await visitor.waitForSelector(".pop--languages");
check(
  "the language menu lists the 15 languages and marks the current one",
  (await visitor.locator(".pop--languages [data-pick]").count()) === 15 &&
    (await visitor.locator(".pop--languages [data-pick='en'] svg").count()) === 1
);
await visitor.keyboard.press("Escape");
check("Escape closes the menu", (await visitor.locator(".pop").count()) === 0);
await visitor.click("#language-button");
await Promise.all([visitor.waitForNavigation(), visitor.click(".pop--languages [data-pick='fr']")]);
await ready(visitor);
check(
  "choosing French reloads the page in French",
  (await visitor.locator("html").getAttribute("lang")) === "fr" &&
    /Accueil|Aperçu/.test(await visitor.locator("#main-nav .nav-link").first().textContent())
);
await visitor.click("#language-button");
await Promise.all([visitor.waitForNavigation(), visitor.click(".pop--languages [data-pick='ar']")]);
await ready(visitor);
check(
  "Arabic turns the page right to left",
  (await visitor.locator("html").getAttribute("dir")) === "rtl"
);
const sidebarBox = await visitor.locator("#sidebar").boundingBox();
check("and the side navigation moves to the right", sidebarBox.x > 700);

// ---- the display switches -----------------------------------------------------------------------
const display = await open();
await display.goto(`${app.baseUrl}/`);
await ready(display);
check(
  "the page starts dark",
  (await display.locator("html").getAttribute("data-theme")) === "dark"
);
await display.click("#theme-toggle");
check(
  "the theme button switches to the light theme",
  (await display.locator("html").getAttribute("data-theme")) === "light" &&
    (await display.locator("#theme-label").textContent()) === "Dark mode"
);
await display.reload();
await ready(display);
check(
  "and the choice survives a reload with no flash (the server wrote it on the page)",
  (await display.locator("html").getAttribute("data-theme")) === "light"
);
const canvas = await display.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("the light canvas is light", canvas === "rgb(237, 241, 248)");
await display.click('[data-group="me"] .nav-group__btn');
await display.click("#theme-switch");
check(
  "the switch in the Me group goes back to dark",
  (await display.locator("html").getAttribute("data-theme")) === "dark"
);
await display.click('[data-group="me"] .nav-group__btn');
await display.click('[data-direction="rtl"]');
check(
  "the RTL switch forces the right-to-left layout in an English page",
  (await display.locator("html").getAttribute("dir")) === "rtl" &&
    (await display.locator('[data-direction="rtl"]').getAttribute("aria-pressed")) === "true"
);
await display.reload();
await ready(display);
check("and it is kept", (await display.locator("html").getAttribute("dir")) === "rtl");
await display.click('[data-group="me"] .nav-group__btn');
await display.click('[data-direction="ltr"]');
check("LTR brings it back", (await display.locator("html").getAttribute("dir")) === "ltr");

// ---- the bar of the menu: the entries are one and the same, the bar is under the word ----------------------
await display.goto(`${app.baseUrl}/heroes`);
await ready(display);
const entries = await display.evaluate(() =>
  [...document.querySelectorAll("#main-nav > .nav-home, #main-nav > .nav-group")]
    .filter(cell => cell.getClientRects().length)
    .map(cell => {
      const button = cell.matches(".nav-home") ? cell : cell.querySelector(".nav-group__btn");
      const word = button.querySelector("span").getBoundingClientRect();
      const bar = getComputedStyle(button, "::after");
      const box = button.getBoundingClientRect();
      const left = box.left + parseFloat(bar.left);
      return {
        font: getComputedStyle(button).font,
        height: box.height,
        barTop: Math.round(box.top + parseFloat(bar.top)),
        barLeft: Math.round(left),
        barWidth: Math.round(parseFloat(bar.width)),
        wordLeft: Math.round(word.left),
        wordWidth: Math.round(word.width)
      };
    })
);
check(
  "Overview and the groups have the same font and height",
  entries.length >= 4 &&
    new Set(entries.map(entry => entry.font)).size === 1 &&
    new Set(entries.map(entry => entry.height)).size === 1
);
check(
  "the bar of every entry is at the same height and exactly under its word",
  new Set(entries.map(entry => entry.barTop)).size === 1 &&
    entries.every(
      entry => entry.barLeft === entry.wordLeft && Math.abs(entry.barWidth - entry.wordWidth) <= 1
    )
);

// ---- the command palette ------------------------------------------------------------------------
await display.keyboard.press("Control+k");
await display.waitForSelector(".palette");
check(
  "Ctrl K opens the palette with pages and heroes",
  (await display.locator(".palette__group").count()) >= 2
);
await display.fill("#palette-input", "Hero h05");
await display.waitForSelector('.palette__item:has-text("Hero h05")');
await display.keyboard.press("Enter");
await display.waitForURL(/\/heroes\/h05$/);
check("choosing a hero opens its sheet", /\/heroes\/h05$/.test(display.url()));
await display.click("#topbar-search-input");
await display.waitForSelector(".palette");
await display.keyboard.press("Escape");
check(
  "a click on the search field opens it, Escape closes it",
  (await display.locator(".palette").count()) === 0
);

// ---- a signed-in account ------------------------------------------------------------------------
const signed = await open({ account: user });
await signed.goto(`${app.baseUrl}/`);
await ready(signed);
check(
  "a signed-in account sees the chip, the bell and the whole menu (admin entries included)",
  (await signed.locator("#account-trigger").count()) === 1 &&
    (await signed.locator("#topbar-notifications").isVisible()) &&
    (await signed.locator("#nav-tournaments:not([hidden])").count()) === 1 &&
    (await signed.locator("#nav-inbox:not([hidden])").count()) === 1
);
await signed.click("#account-trigger");
await signed.waitForSelector(".pop--account");
check(
  "the account menu has the profile, the player page, my space, settings, security, Discord and sign out",
  (await signed.locator(".pop--account [data-pick]").count()) === 7 &&
    (await signed.locator('.pop--account [data-pick="logout"]').count()) === 1
);
await signed.click('.pop--account [data-pick="settings"]');
await signed.waitForURL(/\/settings$/);
check("a link of the menu navigates without a reload", /\/settings$/.test(signed.url()));
await signed.click("#topbar-notifications");
await signed.waitForSelector(".pop--notifications");
// the list (and the way to the inbox) comes once the notifications have been fetched
await signed.waitForSelector('.pop--notifications a[href="/inbox"]');
check(
  "the bell opens the latest notifications, with a way to the inbox",
  (await signed.locator('.pop--notifications a[href="/inbox"]').count()) >= 1
);
await signed.keyboard.press("Escape");
await signed.click("#account-trigger");
await Promise.all([signed.waitForNavigation(), signed.click('.pop--account [data-pick="logout"]')]);
check("sign out leaves the account", (await signed.locator("#account-trigger").count()) === 0);

// ---- a phone ------------------------------------------------------------------------------------
const phone = await open({ width: 390, height: 844 });
await phone.goto(`${app.baseUrl}/`);
await ready(phone);
check(
  "on a phone the side navigation is a closed drawer and the tab bar is shown",
  !(await phone.locator("#sidebar").evaluate(element => element.classList.contains("open"))) &&
    (await phone.locator(".tabbar").isVisible())
);
// The banner of the home page is as tall as its tallest slide: whatever the width (the words wrap on more lines on a
// narrow screen), the words of every slide stay above the credit of the hero of the day and the arrows.
const bannerGaps = async page => {
  // data-ready does not wait for a page that loads on demand: the banner is waited for here
  await page.waitForSelector(".hello__credit", { timeout: 15000 });
  return page.evaluate(() => {
    const credit = document.querySelector(".hello__credit").getBoundingClientRect();
    return [...document.querySelectorAll(".hello__slide .hello__body")].map(body =>
      Math.round(credit.top - body.getBoundingClientRect().bottom)
    );
  });
};
const narrow = await open({ width: 320, height: 700 });
await narrow.goto(`${app.baseUrl}/`);
await ready(narrow);
for (const [width, page] of [
  [390, phone],
  [320, narrow]
]) {
  const gaps = await bannerGaps(page);
  check(
    `at ${width} px the words of the ${gaps.length} slides of the banner stay clear of the credit of the hero of the day`,
    gaps.length >= 2 && gaps.every(gap => gap >= 8)
  );
}
// Closed, the drawer is out of the Tab order (it used to hold thirty invisible stops between the logo and the search).
// The search field opens the palette as soon as it is reached: the walk stops there and the palette is closed again.
{
  await phone.focus("#menu-toggle");
  const stops = [];
  for (let press = 0; press < 6; press += 1) {
    await phone.keyboard.press("Tab");
    stops.push(await phone.evaluate(() => Boolean(document.activeElement?.closest("#sidebar"))));
  }
  check("on a phone the Tab key does not go into the closed drawer", !stops.includes(true));
  await phone.keyboard.press("Escape");
  await phone.waitForSelector(".scrim", { state: "detached", timeout: 3000 }).catch(() => {});
}
await phone.click("#menu-toggle");
check(
  "the Menu tab opens the drawer",
  await phone.locator("#sidebar").evaluate(element => element.classList.contains("open"))
);
await goNav(phone, '#main-nav .nav-link[data-view="heroes"]');
await phone.waitForURL(/\/heroes$/);
check(
  "choosing an entry closes it",
  !(await phone.locator("#sidebar").evaluate(element => element.classList.contains("open")))
);
check(
  "the tab bar marks the current page",
  (await phone.locator(".tabbar .tab.active").getAttribute("data-view")) === "heroes"
);
check(
  "no horizontal scroll on a phone",
  await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nshell e2e passed");
