// Browser check of the Overview at five widths: nothing sticks, the three cards come right after the figures,
// the heroes and the pictures of the game data fill their blocks from edge to edge in columns that divide
// what they hold, the banner arrows show on hover only and the circles are our blue.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();
const measure = page =>
  page.evaluate(() => {
    const rect = element => element.getBoundingClientRect();
    const rail = [...document.querySelectorAll(".rail-card")];
    const railBox = document.querySelector(".hero-rail");
    const columns = new Set(rail.map(card => Math.round(rect(card).left))).size;
    const heroes = document.querySelector(".heroes-card");
    const figures = document.querySelector(".home-figures");
    const cards = [...document.querySelectorAll(".home-cards > *")];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sticky: [...document.querySelectorAll("*")]
        .filter(element => getComputedStyle(element).position === "sticky")
        .map(element => element.className || element.tagName.toLowerCase()),
      cardCount: cards.length,
      cardsAfterFigures:
        figures && cards.length ? rect(cards[0]).top >= rect(figures).bottom - 1 : false,
      cardsBeforeHeroes:
        heroes && cards.length ? rect(cards.at(-1)).bottom <= rect(heroes).top + 1 : false,
      cardTops: [...new Set(cards.map(card => Math.round(rect(card).top)))].length,
      rail: {
        count: rail.length,
        columns,
        // the last card of the first row ends where the rail ends: no strip left over at the right
        strip:
          rail.length && railBox
            ? Math.round(rect(railBox).right - Math.max(...rail.map(card => rect(card).right)))
            : 0,
        laneIcons: document.querySelectorAll(".rail-card .lane-icon, .rail-card__lanes").length
      },
      tiles: [...document.querySelectorAll(".data-tile__icons")].map(grid => {
        const pictures = [...grid.querySelectorAll("img")];
        return {
          count: pictures.length,
          columns: new Set(pictures.map(picture => Math.round(rect(picture).left))).size,
          strip: pictures.length
            ? Math.round(
                rect(grid).right - Math.max(...pictures.map(picture => rect(picture).right))
              )
            : 0,
          squares: pictures.every(
            picture => Math.abs(rect(picture).width - rect(picture).height) < 1.5
          ),
          widest: Math.round(Math.max(0, ...pictures.map(picture => rect(picture).width)))
        };
      }),
      credit: Boolean(document.querySelector(".hello__credit")),
      creditPortrait: Boolean(document.querySelector(".hello__credit img"))
    };
  });

for (const [width, height, railColumns] of [
  [1920, 1000, 12],
  [1440, 900, 12],
  [1100, 800, 6],
  [768, 1000, 6],
  [390, 844, 4]
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  await page.waitForSelector(".home-cards");
  const found = await measure(page);
  const label = `at ${width} px`;
  check(`${label} nothing overflows sideways`, found.overflow <= 0);
  check(
    `${label} nothing sticks but the top bar`,
    found.sticky.every(name => /topbar/.test(String(name)))
  );
  check(
    `${label} three cards come after the figures and before the heroes`,
    found.cardCount === 3 && found.cardsAfterFigures && found.cardsBeforeHeroes
  );
  if (width > 1100) {
    check(`${label} the three cards are side by side`, found.cardTops === 1);
  }
  if (found.rail.count === 12) {
    check(
      `${label} the twelve heroes sit in ${railColumns} columns, to the edge, with no lane icons`,
      found.rail.columns === railColumns && found.rail.strip <= 1 && found.rail.laneIcons === 0
    );
  }
  for (const [index, tile] of found.tiles.entries()) {
    if (!tile.count) {
      continue;
    }
    check(
      `${label} the pictures of game data tile ${index + 1} fill it to the edge in square cells no larger than 110 px`,
      tile.strip <= 1 && tile.squares && tile.widest <= 110 && [5, 10].includes(tile.columns)
    );
  }
  if (found.credit) {
    check(`${label} the hero of the day shows its portrait`, found.creditPortrait);
  }
  await context.close();
}

// the arrows of the banner: out of sight at rest, at both sides of the stage on hover; the circles are our blue
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/`);
  await page.waitForSelector("html[data-ready='1']", { timeout: 15000 });
  const arrows = () =>
    page.evaluate(() => {
      const banner = document.querySelector("#hello").getBoundingClientRect();
      return [...document.querySelectorAll(".hello__arrow")].map(arrow => {
        const box = arrow.getBoundingClientRect();
        return {
          opacity: Number(getComputedStyle(arrow).opacity),
          middle: Math.abs(box.top + box.height / 2 - (banner.top + banner.height / 2)) < 2,
          atTheSide: box.left - banner.left < 40 || banner.right - box.right < 40
        };
      });
    });
  // data-ready does not wait for a page that loads on demand: the banner is waited for here
  await page.waitForSelector(".hello__arrow", { timeout: 15000 }).catch(() => {});
  const hasArrows = (await page.locator(".hello__arrow").count()) === 2;
  check(
    "the banner has two arrows and circles to pick a slide",
    hasArrows && (await page.locator(".dots button").count()) >= 2
  );
  if (hasArrows) {
    await page.mouse.move(5, 5);
    const rest = await arrows();
    check(
      "the arrows are not seen at rest",
      rest.every(arrow => arrow.opacity === 0)
    );
    await page.hover("#hello", { position: { x: 700, y: 260 } });
    await page.waitForTimeout(400);
    const hover = await arrows();
    check(
      "the arrows show when the banner is hovered, at both sides, in the middle of its height",
      hover.every(arrow => arrow.opacity > 0.9 && arrow.middle && arrow.atTheSide)
    );
    await page.click(".hello__arrow--next");
    await page.waitForTimeout(300);
    check(
      "an arrow turns the banner",
      (await page.locator("#hello").getAttribute("data-current")) === "1"
    );
    await page.click('.dots button[data-hello-to="0"]');
    check(
      "a circle picks its slide",
      (await page.locator("#hello").getAttribute("data-current")) === "0"
    );
    const dot = await page.evaluate(() => {
      const current = document.querySelector(".dots button.on");
      const box = current.getBoundingClientRect();
      return {
        colour: getComputedStyle(current, "::before").backgroundColor,
        height: parseFloat(getComputedStyle(current, "::before").height),
        width: parseFloat(getComputedStyle(current, "::before").width),
        target: Math.round(box.height)
      };
    });
    check(
      "the current circle is our blue, bigger than 12 px, in a target at least 24 px tall",
      dot.colour === "rgb(91, 155, 255)" && dot.height >= 12 && dot.width >= 28 && dot.target >= 24
    );
  }
  await context.close();
}

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log("overview layout e2e passed");
