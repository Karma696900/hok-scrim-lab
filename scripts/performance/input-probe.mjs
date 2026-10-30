// What typing in a search box costs the browser, per keystroke, on a phone-like processor (4x slower).
// A throw-away server is filled with a realistic catalogue (71 items, 120 arcana) and 110 heroes, then the
// probe types the same ten letters into each search box and reports the time the page spent running
// scripts, recalculating styles and laying out (Chrome's own counters, so painting and parsing the markup
// the handler writes are in it). The search that rewrites a whole page for each letter is the one to wait
// for the typist before drawing.
//
//   node scripts/performance/input-probe.mjs [--slow=4] [--word=blade of des] [--burst]
import { chromium } from "playwright";
import { sampleHeroes, startTestServer } from "../../src/testing/test-app.js";

const argument = name => process.argv.find(item => item.startsWith(`--${name}=`))?.split("=")[1];
const SLOW = Number(argument("slow") ?? 4);
const WORD = argument("word") ?? "blade of des";
const BURST = process.argv.includes("--burst");

const app = await startTestServer({ seedHeroes: false });
if (!app) {
  console.error("MySQL is not reachable: start it with `docker compose up -d mysql`.");
  process.exit(1);
}
let browser;
try {
  await app.store.saveHeroes(sampleHeroes(110), "20260925");
  const admin = await app.signIn("Typist", { admin: true });
  await admin.browser.post("/api/admin/catalog/stats", { name: "Attack" });
  const PREFIXES = [
    "Blade",
    "Staff",
    "Shield",
    "Boots",
    "Knife",
    "Charm",
    "Totem",
    "Edge",
    "Cloak"
  ];
  for (let index = 0; index < 71; index += 1) {
    await admin.browser.post("/api/admin/catalog/items", {
      name: `${PREFIXES[index % PREFIXES.length]} of Despair ${index}`,
      category: index % 9 === 3 ? "boots" : "regular",
      stats: []
    });
  }
  for (let index = 0; index < 120; index += 1) {
    await admin.browser.post("/api/admin/catalog/arcana", {
      name: `Arcana ${PREFIXES[index % PREFIXES.length]} ${index}`,
      color: ["red", "blue", "green"][index % 3],
      stats: []
    });
  }

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW });
  const busy = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = name => metrics.find(metric => metric.name === name)?.value ?? 0;
    return (get("ScriptDuration") + get("LayoutDuration") + get("RecalcStyleDuration")) * 1000;
  };

  const cases = [
    {
      name: "catalog filter (admin, items tab)",
      url: "/catalog",
      prepare: async () => {
        await page.click('[data-tab="items"]');
        await page.waitForSelector(".catalog-entry");
      },
      input: "#catalog-filter"
    },
    { name: "build lab item search", url: "/build-lab", input: "#lab-search" },
    { name: "hero search (110 heroes)", url: "/heroes", input: "#hero-search" }
  ];
  console.log(`${"search box".padEnd(36)} letters   total ms   per letter   (CPU ${SLOW}x slower)`);
  for (const one of cases) {
    await page.goto(app.baseUrl + one.url);
    await page.waitForLoadState("networkidle");
    await one.prepare?.();
    await page.waitForSelector(one.input);
    await page.focus(one.input);
    await page.waitForTimeout(400);
    if (BURST) {
      // the whole word at once, as a fast typist or a paste gives it
      const before = await busy();
      await page.keyboard.type(WORD, { delay: 0 });
      await page.waitForTimeout(700);
      const spent = (await busy()) - before;
      console.log(
        `${one.name.padEnd(36)} ${String(WORD.length).padStart(7)} ${spent.toFixed(0).padStart(10)} ${(spent / WORD.length).toFixed(1).padStart(12)}   (one burst)`
      );
      continue;
    }
    // letter by letter, each one measured once the page has had time to draw it
    const costs = [];
    for (const letter of WORD) {
      const before = await busy();
      await page.keyboard.type(letter, { delay: 0 });
      await page.waitForTimeout(450); // longer than any wait the page may add before it draws
      costs.push((await busy()) - before);
    }
    const total = costs.reduce((sum, cost) => sum + cost, 0);
    const rest = costs.slice(1).sort((a, b) => a - b);
    console.log(
      `${one.name.padEnd(36)} ${String(WORD.length).padStart(7)} ${total.toFixed(0).padStart(10)} ${(total / WORD.length).toFixed(1).padStart(12)}   first ${costs[0].toFixed(0)} ms, then median ${rest[Math.floor(rest.length / 2)].toFixed(0)} ms, worst ${rest.at(-1).toFixed(0)} ms`
    );
  }
} finally {
  await browser?.close();
  await app.close();
}
