// Server-side rendering for real: a real prerenderer (headless Chromium running the site's own
// client code), then a browser WITHOUT JavaScript must already see the page, and one WITH
// JavaScript must end on the same content without console or CSP errors.
import { chromium } from "playwright";
import { launchChromium } from "../../features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "./prerender.js";
import { startTestServer } from "../../../testing/test-app.js";

let baseUrl = null;
const prerender = createPrerenderer({ launch: launchChromium, baseUrl: () => baseUrl });
const app = await startTestServer({ prerender });
baseUrl = app.baseUrl;
await app.store.saveHeroes(
  [
    {
      id: "505",
      name: "Hero Five",
      image: "https://camp.honorofkings.com/h.png",
      roles: ["Mage"],
      lanes: ["Mid Lane"],
      sourceIds: ["505"]
    }
  ],
  "20260925"
);
// the only hero is the hero of the day: its cover is the art of the overview banner
await app.store.saveHeroDetails("505", {
  schema: 1,
  campHeroId: "505",
  name: "Hero Five",
  mainClass: "Mage",
  minorClass: null,
  lane: "Mid Lane",
  listedAt: null,
  firstSkillToLevel: null,
  art: { cover: "https://camp.honorofkings.com/cover.jpg", coverColor: null, worldIcon: null },
  skills: [],
  world: { height: null, region: null, identity: null, energy: null, video: null },
  gallery: [],
  cinematic: null,
  adjustments: [],
  adjustmentsDetailed: false
});
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();

// Without JavaScript
{
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 412, height: 823 }
  });
  const page = await context.newPage();
  for (const [path, expected] of [
    ["/", /Scrim operations/i],
    ["/heroes", /Hero index/i],
    ["/tier-lists", /Tier lists/i],
    ["/scrims", /scrims/i],
    ["/history", /History/i],
    ["/login", /Sign in/i],
    ["/register", /Create an account/i]
  ]) {
    await page.goto(`${app.baseUrl}${path}`);
    check(
      `${path}: the heading is in the HTML, no JavaScript needed`,
      expected.test(await page.locator("#view h1").first().innerText())
    );
  }
  await page.goto(`${app.baseUrl}/`);
  check(
    "the banner art of the overview is in the HTML, fetched first (the largest picture of the page)",
    await page.evaluate(() => {
      const art = document.querySelector("#hello-art.is-on[data-hero='505'] img");
      return Boolean(
        art?.getAttribute("src")?.includes("cover.jpg") &&
        art.getAttribute("fetchpriority") === "high"
      );
    })
  );
  await page.goto(`${app.baseUrl}/heroes`);
  check(
    "the hero index is drawn: its cards are there",
    (await page.locator(".hcard").count()) >= 1
  );
  check(
    "the page is styled (hero cards laid out in a grid, not unstyled)",
    (await page.evaluate(() => getComputedStyle(document.querySelector(".hero-index")).display)) ===
      "grid"
  );
  check(
    "the navigation is there and in the page (without the entries of an account, training included)",
    (await page.locator("#main-nav .nav-link:not([hidden])").count()) === 16
  );
  await context.close();
}

// With JavaScript: same content, no errors, no layout shift
for (const [path, selector] of [
  ["/", ".hello"],
  ["/heroes", ".hcard"],
  ["/login", "form[data-auth-form]"],
  ["/tier-lists", ".lane-tabs"],
  ["/build-lab", "#lab-root .page-head"]
]) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type()) && !message.text().includes("status of 40")) {
      errors.push(message.text().slice(0, 120));
    }
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route("https://camp.honorofkings.com/**", route =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64"
      )
    })
  );
  await page.goto(`${app.baseUrl}${path}`);
  await page.evaluate(() => {
    window.__heading = document.querySelector("#view h1");
    window.__art = document.querySelector("#hello-art img");
  }); // the heading (and the banner art) the server drew
  const before = await page.locator("#view").textContent(); // textContent: off-screen cards (content-visibility) are not part of innerText
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.waitForTimeout(500);
  check(
    `${path}: JavaScript takes over (data-ssr removed once it has drawn)`,
    await page.evaluate(() => !document.querySelector("#view").dataset.ssr)
  );
  const after = await page.locator("#view").textContent(); // textContent: off-screen cards (content-visibility) are not part of innerText
  const norm = text => text.replace(/\s+/g, " ").trim();
  check(`${path}: the text is the same before and after`, norm(before) === norm(after));
  check(
    `${path}: the heading that was painted is still the same element (nothing was redrawn)`,
    await page.evaluate(
      () => window.__heading !== null && window.__heading === document.querySelector("#view h1")
    )
  );
  if (path === "/") {
    check(
      "/: the banner art the server drew is still there once the script has drawn (no fade again)",
      await page.evaluate(() => {
        const art = document.querySelector("#hello-art.is-on img");
        return Boolean(
          window.__art && art?.getAttribute("src") === window.__art.getAttribute("src")
        );
      })
    );
  }
  check(`${path}: the interactive element is there`, (await page.locator(selector).count()) > 0);
  check(`${path}: no console error (CSP included)`, errors.length === 0);
  check(
    `${path}: no layout shift when the script takes over`,
    (await page.evaluate(() => window.__cls)) < 0.02
  );
  if (errors.length) {
    console.log("     ", errors.join(" | "));
  }
  await context.close();
}

// A hero sheet
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/heroes/505`);
  check("a hero sheet is drawn without JavaScript", (await page.locator("#view h1").count()) > 0);
  await context.close();
}

// Account and language
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([{ name: "hok_lang", value: "ja", url: app.baseUrl }]);
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/login`);
  check(
    "the drawn page is in the chosen language (Japanese)",
    /ログイン/.test(await page.locator("#view h1").first().innerText())
  );
  await context.close();
}

await browser.close();
await prerender.close();
await app.close();
if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const problem of problems) {
    console.log(`- ${problem}`);
  }
  process.exit(1);
}
console.log("\nssr e2e clean");
