// The first paint of a page the server draws carries only the CSS of its first screen
// (client/styles/first-paint.json); the whole stylesheet follows. This checks that nothing is missing from
// that subset: the drawn page looks exactly the same (computed style of every element and of its
// ::before / ::after) with the subset as with the whole stylesheet, in both themes, on a phone and in a
// right-to-left language. A sheet a page needs but the list forgot shows up here, not as a flash for visitors.
import path from "node:path";
import { chromium } from "playwright";
import { launchChromium } from "../../server/features/heroes/sync/hero-sync.js";
import { stylesheetParts } from "../../server/platform/http/first-paint.js";
import {
  FRAME_PATHS,
  loadCriticalCss,
  readStylesheet
} from "../../server/platform/http/page-handler.js";
import { createPrerenderer } from "../../server/platform/http/prerender.js";
import { WEB } from "../../server/platform/http/web-root.js";
import { goNav } from "../../testing/nav.js";
import { startTestServer } from "../../testing/test-app.js";

let baseUrl = null;
const prerender = createPrerenderer({ launch: launchChromium, baseUrl: () => baseUrl });
const app = await startTestServer({ prerender });
baseUrl = app.baseUrl;
// the frames of the pages of a person who is signed in (drawn before their data) are first paints too
const person = await app.signIn("Pat");
const cookie = `hok_session=${person.browser.jar.get("hok_session")}`;
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

// ---- the two stylesheets to compare ------------------------------------------------------------
const styles = path.join(WEB.client, "styles");
const withoutComments = css => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{2,}/g, "\n");
const critical = loadCriticalCss().css;
const sheet = parts =>
  withoutComments(parts.map(part => readStylesheet(path.join(styles, part))).join("\n"));
// animations are frozen: a style read in the middle of one would differ from one load to the next
const STILL = "*,*::before,*::after{animation:none!important;transition:none!important}";
const whole = `${critical}\n${sheet(stylesheetParts(styles).filter(part => part !== "base/fonts.css"))}\n${STILL}`;

// ---- what is compared ----------------------------------------------------------------------------
const ALL_PAGES = [
  ["home", "/"],
  ["heroes", "/heroes"],
  ["tier-lists", "/tier-lists"],
  ["scrims", "/scrims"],
  ["history", "/history"],
  ["build-lab", "/build-lab"],
  ["teams", "/teams"],
  ["find", "/find"],
  ["login", "/login"],
  ["register", "/register"],
  ["training", "/training"]
];
// node src/client/styles/first-paint.e2e.mjs training: only those views
const PAGES =
  process.argv.length > 2
    ? ALL_PAGES.filter(([name]) => process.argv.slice(2).includes(name))
    : ALL_PAGES;
// two looks that between them take every variant a sheet can carry: a wide dark page, and a phone in the light
// theme in a right-to-left language (each added look costs a prerender of every page)
const CONFIGS = [
  { name: "desktop, dark", width: 1440, height: 900, theme: "dark", language: "en" },
  { name: "phone, light, right to left", width: 390, height: 844, theme: "light", language: "ar" }
];

const drawn = new Set();
const browser = await chromium.launch();
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();
await page.route("**/*", route => route.abort()); // only the styles of the document matter

/** The properties that make a page look the way it does (all of them would take minutes to read, for the same answer). */
const PROPERTIES = [
  "display",
  "position",
  "float",
  "overflow-x",
  "overflow-y",
  "visibility",
  "opacity",
  "z-index",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-left-width",
  "border-top-left-radius",
  "border-bottom-right-radius",
  "color",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "box-shadow",
  "outline-style",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-align",
  "text-decoration-line",
  "text-overflow",
  "white-space",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column-start",
  "grid-row-start",
  "transform",
  "filter",
  "backdrop-filter",
  "animation-name",
  "transition-property",
  "cursor",
  "object-fit",
  "aspect-ratio",
  "content",
  "pointer-events",
  "mask-image"
];

/** The style of every element and pseudo-element on those properties, hashed (or, to explain a difference, spelled out). */
const dump = detail =>
  page.evaluate(
    ([wantDetail, properties]) => {
      const hash = value => {
        let result = 5381;
        for (let index = 0; index < value.length; index += 1) {
          result = ((result << 5) + result + value.charCodeAt(index)) | 0;
        }
        return result;
      };
      const rows = [];
      for (const element of document.querySelectorAll("body, body *")) {
        for (const pseudo of [null, "::before", "::after"]) {
          const style = getComputedStyle(element, pseudo);
          const label = `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, ".")}${pseudo ?? ""}`;
          if (pseudo && (style.content === "none" || style.content === "normal")) {
            rows.push(wantDetail ? [label, ""] : 0);
            continue;
          }
          let spelled = "";
          for (const name of properties) {
            spelled += `${name}:${style.getPropertyValue(name)};`;
          }
          if (!pseudo) {
            // where the box ends up: what a missing rule shows even when no property listed above says so
            const box = element.getBoundingClientRect();
            spelled += `box:${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)};`;
          }
          rows.push(wantDetail ? [label, spelled] : hash(spelled));
        }
      }
      return rows;
    },
    [detail, PROPERTIES]
  );

// the focus ring of the field that has autofocus depends on timing
const settled = (html, css) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, () => `<style>${css}</style>`)
    .replace(/\sautofocus(="[^"]*")?/g, "");

async function look(html, css, config, detail = false) {
  await page.setViewportSize({ width: config.width, height: config.height });
  await page.setContent(settled(html, css), { waitUntil: "domcontentloaded" });
  return dump(detail);
}

// what is compared: the pages drawn for visitors, and the frames of a signed-in person
const FRAMES =
  process.argv.length > 2
    ? Object.entries(FRAME_PATHS).filter(([name]) => process.argv.slice(2).includes(name))
    : Object.entries(FRAME_PATHS);
const TARGETS = [
  ...PAGES.map(([name, route]) => ({ name, route, frame: false })),
  ...FRAMES.map(([name, route]) => ({ name: `${name}, frame`, route, frame: true }))
];
for (const config of CONFIGS) {
  for (const { name, route, frame } of TARGETS) {
    // the first request of a frame may get the plain shell while the server draws it: ask again
    let html = "";
    for (let attempt = 0; attempt < (frame ? 10 : 1); attempt += 1) {
      const response = await fetch(`${app.baseUrl}${route}`, {
        headers: { "accept-language": config.language, ...(frame ? { cookie } : {}) }
      });
      html = await response.text();
      if (frame ? /data-ssr="frame"/.test(html) : /data-ssr="1"/.test(html)) {
        break;
      }
      if (frame) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    if (!(frame ? /data-ssr="frame"/.test(html) : /data-ssr="1"/.test(html))) {
      // a page the server could not draw (no data in this test world) is not a first paint to compare
      console.log(`skip ${name} (${config.name}): the server did not draw it`);
      continue;
    }
    drawn.add(name);
    html = html.replace(/data-theme="[a-z]+"/, `data-theme="${config.theme}"`);
    const served = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    let withSubset = await look(html, `${served}\n${STILL}`, config);
    let withWhole = await look(html, whole, config);
    const differences = () =>
      withSubset.flatMap((value, index) => (value === withWhole[index] ? [] : [index]));
    if (differences().length) {
      // a busy machine can measure a box before the page has settled: look once more before calling it a difference
      await new Promise(resolve => setTimeout(resolve, 400));
      withSubset = await look(html, `${served}\n${STILL}`, config);
      withWhole = await look(html, whole, config);
    }
    const different = differences();
    check(
      `${name} (${config.name}): ${withSubset.length} elements look the same with the first-paint sheets as with the whole stylesheet`,
      different.length === 0 && withSubset.length === withWhole.length
    );
    if (different.length) {
      const subset = await look(html, `${served}\n${STILL}`, config, true);
      const all = await look(html, whole, config, true);
      for (const index of different.slice(0, 4)) {
        const [label, mine] = subset[index];
        const theirs = all[index][1].split(";");
        const own = new Set(mine.split(";"));
        console.log(
          `  ${label}: ${theirs
            .filter(rule => !own.has(rule))
            .slice(0, 4)
            .join(" | ")}`
        );
      }
    }
  }
}

// a page the server could not draw is skipped above: make sure the skipping did not swallow the test
for (const [name] of PAGES.filter(([view]) => view !== "training")) {
  check(`${name} was drawn by the server and compared`, drawn.has(name));
}
for (const [name] of FRAMES) {
  check(`${name}, frame: was drawn by the server and compared`, drawn.has(`${name}, frame`));
}
// ---- with JavaScript: the page keeps to its first-paint CSS until another page is drawn ---------------
if (process.argv.length <= 2) {
  const live = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tab = await live.newPage();
  const trouble = [];
  tab.on("pageerror", error => trouble.push(error.message));
  tab.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      trouble.push(message.text());
    }
  });
  const wholeSheets = () => tab.locator('link[rel="stylesheet"][href*="styles"]').count();
  await tab.goto(`${app.baseUrl}/heroes`);
  await tab.waitForSelector("html[data-ready='1']");
  check(
    "a page the server drew is hydrated with its first-paint CSS alone",
    (await wholeSheets()) === 0
  );
  check(
    "the whole stylesheet is on its way, as a prefetch",
    (await tab.locator('link[rel="prefetch"][href*="styles"]').count()) === 1
  );
  check(
    "hydrated, the page is still styled",
    (await tab.evaluate(() => getComputedStyle(document.querySelector(".hcard")).display)) !==
      "inline"
  );
  await goNav(tab, '.nav-link[data-view="tier-lists"]');
  await tab.waitForSelector(".tl-empty");
  check("drawing another page applies the whole stylesheet first", (await wholeSheets()) === 1);
  check(
    "and that page is styled, not bare (its own sheet was not in the first one)",
    (await tab.evaluate(() => getComputedStyle(document.querySelector(".tl-empty")).display)) ===
      "flex"
  );
  check("no error, no warning on the way", trouble.length === 0);
  if (trouble.length) {
    console.log(trouble.join("\n"));
  }
  await live.close();
}

await browser.close();
await prerender.close(); // its own browser closes itself only after minutes of idleness
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nfirst-paint e2e passed");
