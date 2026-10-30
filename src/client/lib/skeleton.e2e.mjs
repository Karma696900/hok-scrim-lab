// Browser check of the loading placeholders: while the data of a page is on its way the page shows
// shapes where the content will be (announced to screen readers, not read out as shapes), they fill the
// width on a phone as well as on a desktop without sideways scrolling, and the real content replaces
// them once the answer arrives. The answer is held back by the test to have time to look.
import { chromium } from "playwright";
import { startTestServer } from "../../testing/test-app.js";
import { textOf } from "../../testing/text.js";

const app = await startTestServer();
const owner = await app.signIn("Skeleton");
await owner.browser.post("/api/teams", {
  name: "Shape Shifters",
  tag: "SHAPE",
  level: "amateur",
  region: "EU",
  timezone: "UTC",
  languages: ["en"]
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async width => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies([
    { name: "hok_session", value: owner.browser.jar.get("hok_session"), url: app.baseUrl }
  ]);
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};

for (const width of [1280, 390]) {
  const page = await open(width);
  const held = [];
  await page.route(/\/api\/teams(\?|$)/, route => held.push(route));
  await page.goto(`${app.baseUrl}/teams`);
  await page.waitForSelector("#team-grid .skeletons");
  const label = `${width}px`;
  check(
    `${label}: the team list shows six card shapes`,
    (await page.locator("#team-grid .skeletons__card").count()) === 6
  );
  check(
    `${label}: they are announced once, as a status`,
    (await page.locator("#team-grid .skeletons[role=status]").count()) === 1 &&
      (await page.locator("#team-grid .skeletons .visually-hidden").innerText()).trim() ===
        "Loading…"
  );
  check(
    `${label}: the shapes themselves are hidden from screen readers`,
    (await page.locator("#team-grid .skeletons__grid[aria-hidden=true]").count()) === 1
  );
  check(
    `${label}: the shapes have a size and are not squeezed to nothing`,
    await page.evaluate(() => {
      const card = document.querySelector("#team-grid .skeletons__card");
      const box = card.getBoundingClientRect();
      const art = card.querySelector(".skeleton--art").getBoundingClientRect();
      return box.width > 120 && box.height > 100 && art.height >= 90;
    })
  );
  check(
    `${label}: the page does not scroll sideways`,
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
  check(
    `${label}: the light crosses on a layer that slides, not on a background that moves`,
    await page.evaluate(() => {
      const shape = document.querySelector("#team-grid .skeleton");
      const layer = getComputedStyle(shape, "::after");
      return (
        getComputedStyle(shape).animationName === "none" &&
        layer.animationName === "shimmer" &&
        getComputedStyle(shape).overflow === "hidden" &&
        shape
          .getAnimations({ subtree: true })
          .every(animation =>
            animation.effect.getKeyframes().every(keyframe => !("backgroundPosition" in keyframe))
          )
      );
    })
  );
  await page
    .screenshot({
      path: process.env.HOK_SKELETON_SHOT?.replace("{w}", String(width)) ?? "/dev/null"
    })
    .catch(() => {});
  // the answer arrives
  for (const route of held) {
    await route.continue();
  }
  await page.waitForFunction(() => !document.querySelector("#team-grid .skeletons"));
  check(
    `${label}: the real teams replace the shapes`,
    (await textOf(page, "#team-grid")).includes("Shape Shifters")
  );
  check(
    `${label}: and the loading bar is gone with them`,
    (await page.locator("#view .loading-line").count()) === 0
  );
  await page.context().close();
}

// the shapes stand still when the visitor asked for less motion
{
  const page = await open(1280);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const held = [];
  await page.route(/\/api\/teams(\?|$)/, route => held.push(route));
  await page.goto(`${app.baseUrl}/teams`);
  await page.waitForSelector("#team-grid .skeletons");
  check(
    "reduced motion: the shimmer does not run",
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("#team-grid .skeleton"), "::after")
          .animationName === "none"
    )
  );
  for (const route of held) {
    await route.continue();
  }
  await page.context().close();
}

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
