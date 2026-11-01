// The address keeps the language in a real browser: /fr/heroes opens in French, a click stays under /fr/,
// the language menu opens the same page under the new prefix, and the HTML the server sends already
// carries localized links (for a crawler, which runs no script).
import { chromium } from "playwright";
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

// ---- without JavaScript: what a crawler reads ------------------------------------------------------------------
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/fr/items`);
  const hrefs = await page
    .locator("a[href^='/']")
    .evaluateAll(links => links.map(link => link.getAttribute("href")));
  const pages = hrefs.filter(
    href => !/^\/(api|auth|assets|locales)\//.test(href) && !/\.\w+$/.test(href)
  );
  check("the French page has internal links", pages.length > 5);
  check(
    "every internal link of the French page stays in French",
    pages.every(href => href === "/fr" || href.startsWith("/fr/"))
  );
  await context.close();
}

// ---- with JavaScript ------------------------------------------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  await page.route("https://camp.honorofkings.com/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: pixel })
  );
  await page.goto(`${app.baseUrl}/fr/heroes`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  check(
    "/fr/heroes is in French",
    (await page.evaluate(() => document.documentElement.lang)) === "fr"
  );
  check("the address stays /fr/heroes", new URL(page.url()).pathname === "/fr/heroes");
  await page.waitForSelector(".hcard");
  const heroId = await page.locator(".hcard").first().getAttribute("data-hero-id");
  await page.locator(".hcard").first().click();
  await page.waitForFunction(id => location.pathname === `/fr/heroes/${id}`, heroId, {
    timeout: 10000
  });
  check("opening a hero keeps the French address", true);
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/fr/heroes", null, { timeout: 10000 });
  check("going back keeps the French address", true);
  await goNav(page, ".nav-link[data-view='tier-list']");
  await page.waitForFunction(() => location.pathname === "/fr/tier-list", null, { timeout: 10000 });
  check("the navigation stays in French", true);
  await page.click("#language-button");
  await page.click(".pop--languages [data-pick='es']");
  await page.waitForURL(url => url.pathname === "/es/tier-list", { timeout: 15000 });
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  check(
    "another language opens the same page at its address",
    (await page.evaluate(() => document.documentElement.lang)) === "es"
  );
  await page.click("#language-button");
  await page.click(".pop--languages [data-pick='en']");
  await page.waitForURL(url => url.pathname === "/tier-list", { timeout: 15000 });
  check("English has no prefix (and is not sent back to Spanish)", true);
  await context.close();
}

await browser.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ni18n-addresses e2e clean"
);
process.exit(problems.length ? 1 : 0);
