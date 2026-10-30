// Every control of every page can be reached: what a finger or a pointer finds at the centre of a visible button, link,
// field or switch is that control, on a desktop and on a phone, with the motion of the page and with reduced motion.
// A click crawl cannot tell a control that is covered by something from one that does nothing; this test can. It found
// a sheet pushed to the bottom of the page by the transform an entrance animation leaves behind, the buttons of the
// welcome pages under invisible checkboxes (reduced motion changes what is stacked over what), a banner running over its
// own credit, and a picker spilling out of its box over the sheet of the build.
import { chromium } from "playwright";
import { demoPages, seedDemoWorld } from "../../../scripts/dev/demo-data.mjs";
import { sampleHeroes, startTestServer } from "../../testing/test-app.js";

/**
 * The controls of the page that are visible and not reached at their centre. Runs in the page, after the control has
 * been scrolled to the middle of the screen.
 */
export function coveredControls() {
  const selector =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  const describe = element =>
    `${element.localName}${element.id ? `#${element.id}` : ""}${
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : ""
    }`;
  const label = element =>
    (
      element.getAttribute("aria-label") ||
      element.textContent ||
      element.title ||
      element.name ||
      ""
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);
  const found = [];
  let checked = 0;
  for (const element of document.querySelectorAll(selector)) {
    if (
      element.disabled ||
      element.classList.contains("skip-link") || // drawn away until it has the focus, on purpose
      element.closest("[hidden], [inert], [aria-hidden='true']") ||
      (element.closest("details:not([open])") && !element.closest("summary"))
    ) {
      continue;
    }
    const style = getComputedStyle(element);
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      !element.getClientRects().length
    ) {
      continue;
    }
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) {
      continue;
    }
    checked += 1;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
      found.push(`${describe(element)} "${label(element)}" is out of the screen`);
      continue;
    }
    const top = document.elementFromPoint(x, y);
    if (
      !top ||
      element === top ||
      element.contains(top) ||
      top.control === element ||
      top.closest("label")?.control === element
    ) {
      continue;
    }
    found.push(`${describe(element)} "${label(element)}" is under ${describe(top)}`);
  }
  return { checked, found };
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();

// the detector itself: a control under an overlay must be seen, or a silent run would prove nothing
{
  const probe = await (
    await browser.newContext({ viewport: { width: 400, height: 400 } })
  ).newPage();
  await probe.setContent(
    '<button id="free">free</button><button id="under">under</button><div style="position:fixed;inset:0;top:0"></div>'
  );
  const seen = await probe.evaluate(coveredControls);
  check(
    "the detector sees a control that lies under an overlay",
    seen.found.length === 2 && seen.checked === 2
  );
  await probe.close();
}

// a roster as big as the real one, like the other crawls
const app = await startTestServer({ seedHeroes: false });
if (!app) {
  throw new Error("MySQL is not reachable (docker compose up -d mysql)");
}
await app.store.saveHeroes(sampleHeroes(120), "20260925");
app.config.adminEmails.add("demoadmin@demo.test");
const world = await seedDemoWorld({ store: app.store, baseUrl: app.baseUrl });
const pages = demoPages(world, "h01");

const SETTINGS = [
  { name: "desktop", width: 1440, height: 900, reduced: false },
  { name: "phone", width: 390, height: 844, reduced: false },
  { name: "small phone", width: 320, height: 568, reduced: false },
  { name: "phone, reduced motion", width: 390, height: 844, reduced: true },
  { name: "desktop, reduced motion", width: 1440, height: 900, reduced: true }
];
for (const setting of SETTINGS) {
  const phone = setting.width < 700;
  // one context per kind of person (a page opened in the same context keeps its session)
  const contexts = new Map();
  const contextOf = async who => {
    if (!contexts.has(who ?? "")) {
      const context = await browser.newContext({
        viewport: { width: setting.width, height: setting.height },
        isMobile: phone,
        hasTouch: phone,
        reducedMotion: setting.reduced ? "reduce" : "no-preference"
      });
      if (who) {
        await context.addCookies([
          { name: "hok_session", value: world.people[who].token, url: app.baseUrl }
        ]);
      }
      contexts.set(who ?? "", { context, page: await context.newPage() });
    }
    return contexts.get(who ?? "").page;
  };
  let controls = 0;
  const bad = [];
  for (const entry of pages) {
    const page = await contextOf(entry.who);
    await page.goto(`${app.baseUrl}${entry.path}`);
    await page
      .waitForSelector("html[data-ready='1']", { timeout: 20000 })
      .catch(() => bad.push(`${entry.name}: the page never settled`));
    // the entrance animations are over (some animations never end: a spinner, a shimmer)
    await page
      .waitForFunction(
        () => document.getAnimations().every(animation => animation.playState !== "running"),
        null,
        { timeout: 2500 }
      )
      .catch(() => {});
    // a page never scrolls sideways (measured before the controls are scrolled to the middle of the screen)
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    if (sideways > 1) {
      bad.push(`${entry.name}: the page scrolls sideways by ${sideways} px`);
    }
    const result = await page.evaluate(coveredControls);
    controls += result.checked;
    for (const line of result.found) {
      bad.push(`${entry.name}: ${line}`);
    }
  }
  check(
    `${setting.name}: on ${pages.length} pages, each of the ${controls} visible controls is what is at its centre, and no page scrolls sideways`,
    bad.length === 0 && controls > 1500
  );
  for (const line of bad.slice(0, 12)) {
    console.log(`     ${line}`);
  }
  for (const { context } of contexts.values()) {
    await context.close();
  }
}

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nhit-test e2e passed");
