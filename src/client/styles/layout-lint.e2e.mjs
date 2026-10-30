// What the eye cannot be asked to find again and again: on every page of the demonstration world, in both themes, on a phone and
// on a desktop, nothing runs out of the screen or out of its box, no text is cut without an ellipsis, no two boxes of the
// flow lie over each other, no picture is squashed, no target is too small to touch (phone) and no text is too small to read.
// The measures are in src/testing/layout-lint.js (they run in the page). Looking at the pages stays necessary: this keeps
// what was found from coming back.
import { chromium } from "playwright";
import { demoPages, seedDemoWorld } from "../../../scripts/dev/demo-data.mjs";
import { layoutProblems } from "../../testing/layout-lint.js";
import { sampleHeroes, startTestServer } from "../../testing/test-app.js";

const SIZES = [
  { width: 390, height: 844, phone: true },
  { width: 1440, height: 900, phone: false }
];
const only = process.argv.slice(2);
const problems = [];
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : ` ${detail}`}`);
  if (!condition) {
    problems.push(label);
  }
};

const app = await startTestServer({ seedHeroes: false });
await app.store.saveHeroes(sampleHeroes(120), "20260925");
app.config.adminEmails.add("demoadmin@demo.test");
const world = await seedDemoWorld({ store: app.store, baseUrl: app.baseUrl });
const pages = demoPages(world, "h01").filter(entry => !only.length || only.includes(entry.name));
const browser = await chromium.launch();

for (const theme of ["dark", "light"]) {
  for (const { width, height, phone } of SIZES) {
    const contexts = new Map();
    const pageOf = async who => {
      if (!contexts.has(who ?? "")) {
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: phone,
          hasTouch: phone,
          reducedMotion: "reduce"
        });
        const cookies = [{ name: "hok_theme", value: theme, url: app.baseUrl }];
        if (who) {
          cookies.push({ name: "hok_session", value: world.people[who].token, url: app.baseUrl });
        }
        await context.addCookies(cookies);
        contexts.set(who ?? "", { context, page: await context.newPage() });
      }
      return contexts.get(who ?? "").page;
    };
    const found = [];
    for (const entry of pages) {
      const page = await pageOf(entry.who);
      await page.goto(`${app.baseUrl}${entry.path}`);
      await page.waitForSelector("html[data-ready='1']", { timeout: 20_000 }).catch(() => {});
      await page
        .waitForFunction(
          () => document.getAnimations().every(animation => animation.playState !== "running"),
          null,
          { timeout: 2500 }
        )
        .catch(() => {});
      await page.waitForTimeout(250);
      for (const problem of await page.evaluate(layoutProblems, { phone })) {
        found.push(
          `${entry.name}: ${problem.kind} ${problem.where} "${problem.text}" ${problem.detail}`
        );
      }
    }
    check(
      `${pages.length} pages, ${theme} theme, ${width} px wide: nothing runs out, overlaps, is cut or too small`,
      found.length === 0,
      `\n  ${[...new Set(found)].slice(0, 40).join("\n  ")}`
    );
    for (const { context } of contexts.values()) {
      await context.close();
    }
  }
}
await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} check(s) failed`);
  process.exit(1);
}
console.log("\nlayout lint: all checks passed");
