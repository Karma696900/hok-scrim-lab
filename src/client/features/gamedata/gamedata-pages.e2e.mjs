// Browser check of the page of one piece (/items/<id>, /arcana/<id>, /spells/<id>): the HTML the
// server sends already holds the name, the price, the stats and the passive as text and a title
// that names HOK; an unknown id is a real 404; every tile of a list is a link to its page.
import { chromium } from "playwright";
import { launchChromium } from "../../../server/features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "../../../server/platform/http/prerender.js";
import { startTestServer } from "../../../testing/test-app.js";

let baseUrl = null;
const prerender = createPrerenderer({ launch: launchChromium, baseUrl: () => baseUrl });
const app = await startTestServer({ prerender });
baseUrl = app.baseUrl;
const admin = await app.signIn("Keeper", { admin: true });
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const attack = await post("/api/admin/catalog/stats", { name: "Physical Attack" });
const sword = await post("/api/admin/catalog/items", {
  name: "Long Sword",
  category: "regular",
  shopCategory: "physical",
  price: 1200,
  stats: [{ statId: attack, value: 40 }],
  description: "Sharpens every third strike."
});
const zeal = await post("/api/admin/catalog/arcana", { name: "Zeal", color: "red", stats: [] });
const flash = await post("/api/admin/catalog/spells", {
  name: "Flash",
  description: "Teleports a short distance.",
  cooldownSeconds: 120,
  unlockLevel: 1
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();

// ---- without JavaScript ---------------------------------------------------------------------------------------
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const answer = await page.goto(`${app.baseUrl}/items/${sword}`);
  check("/items/<id> answers 200", answer.status() === 200);
  check("its title names HOK and the item", /HOK Long Sword/.test(await page.title()));
  const text = await page.locator("#view").innerText();
  check(
    "the name, the price, the stat and the passive are text in the HTML",
    text.includes("Long Sword") &&
      /1,?200/.test(text) &&
      text.includes("Physical Attack") &&
      text.includes("Sharpens every third strike.")
  );
  check(
    "the heading of the page is the item",
    // (textContent: the heading is shown in capitals by the stylesheet)
    /Long Sword/.test(await page.locator("#view h1").first().textContent())
  );
  check(
    "an arcana has its page",
    (await page.goto(`${app.baseUrl}/arcana/${zeal}`)).status() === 200 &&
      /HOK Zeal/.test(await page.title())
  );
  check(
    "a spell has its page, its cooldown in text",
    (await page.goto(`${app.baseUrl}/spells/${flash}`)).status() === 200 &&
      /HOK Flash/.test(await page.title()) &&
      /120/.test(await page.locator("#view").innerText())
  );
  check(
    "an unknown id is a real 404",
    (await page.goto(`${app.baseUrl}/items/999999`)).status() === 404
  );
  const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
  check(
    "the sitemap lists the page of each piece",
    sitemap.includes(`/items/${sword}<`) &&
      sitemap.includes(`/arcana/${zeal}<`) &&
      sitemap.includes(`/spells/${flash}<`)
  );
  await context.close();
}

// ---- with JavaScript ------------------------------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  await page.goto(`${app.baseUrl}/items`);
  // the page drawn by the server is replaced once the scripts are there: click the tiles of the live page
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  await page.waitForSelector(".gd-tile");
  check(
    "every tile of the list is a link to the page of its piece",
    (await page.locator(`a.gd-tile[href="/items/${sword}"]`).count()) === 1
  );
  await page.click(`a.gd-tile[href="/items/${sword}"]`);
  await page.waitForFunction(id => location.pathname === `/items/${id}`, sword);
  check(
    "a click opens the sheet and the address follows",
    /Long Sword/.test(await page.locator("#gd-detail").textContent())
  );
  await page.click(`a.gd-tile[href="/items/${sword}"]`);
  await page.waitForFunction(() => location.pathname === "/items");
  check("a second click closes it and the address goes back to the list", true);
  await page.goto(`${app.baseUrl}/items/${sword}`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  await page.waitForSelector("#gd-detail.is-open");
  check(
    "opening the address of a piece opens its sheet",
    /Long Sword/.test(await page.locator("#gd-detail").textContent())
  );
  await page.close();
}

await browser.close();
await prerender.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ngamedata-pages e2e clean"
);
process.exit(problems.length ? 1 : 0);
