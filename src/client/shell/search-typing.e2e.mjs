// Browser check of the two search boxes that wait for a pause in the typing before they redraw (the hero
// index and the catalog filter): a burst of letters gives ONE redraw with the last text, the field keeps
// the focus, the text and the caret, a click right after the typing already reads the new text, and
// leaving the page before the redraw does no harm.
import { chromium } from "playwright";
import { sampleHeroes, startTestServer } from "../../testing/test-app.js";

const app = await startTestServer({ seedHeroes: false });
await app.store.saveHeroes(sampleHeroes(30), "20260925");
const admin = await app.signIn("Typist", { admin: true });
for (const name of ["Blade of Despair", "Blade of Dawn", "Staff of Embers", "Giant's Shield"]) {
  await admin.browser.post("/api/admin/catalog/items", { name, category: "regular", stats: [] });
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

/** Waits until `ask()` is true (a plain loop: waitForFunction does not poll an async function). */
async function until(what, ask) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await ask()) {
      return true;
    }
    await page.waitForTimeout(50);
  }
  console.log(`      never happened: ${what}`);
  return false;
}

// ---- the hero index --------------------------------------------------------------------------------------------
await page.goto(`${app.baseUrl}/heroes`);
await page.waitForSelector("#hero-search");
const shown = () => page.locator("#hero-index > :not([hidden])").count();
check("the index starts with every hero", (await shown()) >= 20);

await page.focus("#hero-search");
// every filtering of the index writes the counter once: count the writes during the burst
await page.evaluate(() => {
  window.__redraws = 0;
  new MutationObserver(records => {
    window.__redraws += records.length;
  }).observe(document.querySelector("#hero-count"), {
    childList: true,
    characterData: true,
    subtree: true
  });
});
await page.keyboard.type("hero h07", { delay: 15 }); // a burst: faster than the pause
check("the field shows what was typed", (await page.inputValue("#hero-search")) === "hero h07");
check(
  "once the typing pauses, only the matching hero is left",
  await until("one hero shown", async () => (await shown()) === 1)
);
const heroRedraws = await page.evaluate(() => window.__redraws);
check(
  `eight letters in a burst filter the index once or twice, not eight times (${heroRedraws})`,
  heroRedraws >= 1 && heroRedraws <= 2
);
check(
  "the field kept the focus",
  await page.evaluate(() => document.activeElement?.id === "hero-search")
);
check(
  "the counter says so",
  /^1 of \d+ shown$/.test((await page.locator("#hero-count").innerText()).trim())
);

// the text is kept at once: a click on a lane chip straight after typing filters with it
await page.fill("#hero-search", "");
await until("every hero again", async () => (await shown()) >= 20);
await page.keyboard.type("hero h1", { delay: 5 }); // h10 to h19: ten heroes, two on each lane
await page.locator("#view .lchip[data-lane]").nth(1).click();
check(
  "a chip clicked right after the typing already counts the typed text",
  await until("filtered by text and lane", async () => {
    const count = await shown();
    return count >= 1 && count <= 3;
  })
);

// ---- the catalog filter ----------------------------------------------------------------------------------------
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
await page.click('[data-tab="items"]');
await page.waitForSelector(".catalog-entry");
check("the catalog lists the four items", (await page.locator(".catalog-entry").count()) === 4);
await page.focus("#catalog-filter");
// the whole page is redrawn by one write of innerHTML: count the writes during the burst
await page.evaluate(() => {
  window.__paints = 0;
  new MutationObserver(records => {
    window.__paints += records.length;
  }).observe(document.querySelector("#catalog-root"), { childList: true });
});
await page.keyboard.type("blade", { delay: 15 });
check(
  "the catalog redraws once, with the two blades",
  await until("two blades", async () => (await page.locator(".catalog-entry").count()) === 2)
);
const paints = await page.evaluate(() => window.__paints);
check(
  `five letters in a burst redraw the catalog once or twice, not five times (${paints})`,
  paints >= 1 && paints <= 2
);
check(
  "the filter field has the focus again, with its text and the caret at the end",
  await page.evaluate(() => {
    const field = document.querySelector("#catalog-filter");
    return (
      document.activeElement === field &&
      field.value === "blade" &&
      field.selectionStart === 5 &&
      field.selectionEnd === 5
    );
  })
);
await page.keyboard.type(" of d");
check(
  "typing goes on where it stopped",
  await until("one blade left", async () => (await page.locator(".catalog-entry").count()) === 2)
);
// leaving the page right after typing must not throw
await page.keyboard.type("x", { delay: 0 });
await page.goto(`${app.baseUrl}/heroes`);
await page.waitForSelector("#hero-search");
await page.waitForTimeout(400);

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
