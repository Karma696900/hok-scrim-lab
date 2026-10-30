// Languages in a real browser: detection from the browser, the picker, persistence, right-to-left,
// and that no page overflows in ANY of the 15 languages (long German words, unspaced Japanese,
// Arabic mirroring) on phone and desktop.
import { chromium } from "playwright";
import { LANGUAGES } from "../shared/i18n.js";
import { startTestServer } from "../testing/test-app.js";
import { goNav } from "../testing/nav.js";

const app = await startTestServer();
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function open(context, path) {
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(`pageerror (${path}): ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("status of 40")) {
      problems.push(`console (${path}): ${message.text().slice(0, 120)}`);
    }
  });
  await page.route("https://camp.honorofkings.com/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: pixel })
  );
  await page.goto(`${app.baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#view h1, #view .loading-line + *, #view .page-head");
  return page;
}

// Detection from the browser's own languages
{
  const context = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1280, height: 900 }
  });
  const page = await open(context, "/");
  check(
    "a French browser gets a French page",
    (await page.evaluate(() => document.documentElement.lang)) === "fr"
  );
  check(
    "the navigation is in French",
    /^Héros/.test(await page.locator('.nav-link[data-view="heroes"]').textContent())
  );
  check(
    "the language button shows French",
    (await page.locator("#language-button span").textContent()) === "Français" // textContent: the button is drawn in capitals (innerText would say FRANÇAIS)
  );
  check(
    "the page content is in French (no English left over in the heading)",
    /Opérations/i.test(await page.locator("h1").innerText())
  );

  // The picker: choose Arabic -> saved, right-to-left, survives navigation and reload
  await page.click("#language-button");
  check(
    "the menu lists the 15 languages once it is opened",
    (await page.locator(".pop--languages [data-pick]").count()) === 15 &&
      (await page.locator(".pop--languages [data-pick='fr'] svg").count()) === 1
  );
  await page.click(".pop--languages [data-pick='ar']");
  await page.waitForFunction(() => document.documentElement.lang === "ar");
  check(
    "choosing Arabic flips the page right-to-left",
    (await page.evaluate(() => document.documentElement.dir)) === "rtl"
  );
  check(
    "the choice is saved in a cookie",
    (await context.cookies()).some(cookie => cookie.name === "hok_lang" && cookie.value === "ar")
  );
  await goNav(page, '.nav-link[data-view="heroes"]');
  await page.waitForSelector(".hcard");
  check(
    "it persists while navigating",
    (await page.evaluate(() => document.documentElement.dir)) === "rtl"
  );
  const brandLeft = await page.evaluate(
    () => document.querySelector(".logo").getBoundingClientRect().left
  );
  const menuLeft = await page.evaluate(
    () => document.querySelector(".account-control").getBoundingClientRect().left
  );
  check(
    "the layout is mirrored: the brand is on the right, the account on the left",
    brandLeft > menuLeft
  );
  check("the document title is Arabic", /[؀-ۿ]/.test(await page.title()));
  await page.reload({ waitUntil: "networkidle" });
  check("and after a reload", (await page.evaluate(() => document.documentElement.lang)) === "ar");
  await context.close();
}

// A saved choice wins over the browser
{
  const context = await browser.newContext({ locale: "fr-FR" });
  await context.addCookies([{ name: "hok_lang", value: "ja", url: app.baseUrl }]);
  const page = await open(context, "/");
  check(
    "the saved language wins over the browser's",
    (await page.evaluate(() => document.documentElement.lang)) === "ja"
  );
  await context.close();
}

// No overflow, no untranslated shell text, in every language
const PAGES = ["/", "/heroes", "/tier-lists", "/scrims", "/history", "/login", "/register"];
const SIZES = [
  [390, 844],
  [1280, 800]
];
for (const { code, name } of LANGUAGES) {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height }, locale: code });
    await context.addCookies([{ name: "hok_lang", value: code, url: app.baseUrl }]);
    const wide = [];
    for (const path of PAGES) {
      const page = await open(context, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      const clipped = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "button, a, .pill, .nav-link, .filter-chip, label, h1, h2, .stat-label"
          )
        ]
          .filter(element => {
            const box = element.getBoundingClientRect();
            return (
              box.width > 0 &&
              !element.closest(".visually-hidden") &&
              !element.classList.contains("visually-hidden") &&
              element.scrollWidth > element.clientWidth + 2 &&
              getComputedStyle(element).overflow === "hidden" &&
              getComputedStyle(element).textOverflow !== "ellipsis"
            );
          })
          .map(element => (element.textContent || "").trim().slice(0, 30))
      );
      if (overflow > 0) {
        wide.push(`${path} +${overflow}px`);
      }
      if (clipped.length) {
        wide.push(`${path} clipped: ${clipped.slice(0, 3).join(" | ")}`);
      }
      await page.close();
    }
    check(`${name} (${code}) at ${width}px: no overflow, nothing clipped`, wide.length === 0);
    if (wide.length) {
      console.log("     ", wide.join("; "));
    }
    await context.close();
  }
}

await browser.close();
await app.close();
if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const problem of problems) {
    console.log(`- ${problem}`);
  }
  process.exit(1);
}
console.log("\nlanguage e2e clean");
