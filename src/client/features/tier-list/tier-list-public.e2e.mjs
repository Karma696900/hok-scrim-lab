// Browser check of the public tier list (/tier-list and one page per lane): the HTML the server
// sends already holds the heading, the tiers and the hero names as text (a search engine reads it
// with no JavaScript), each hero links to its page, the lanes have their own address, and the page
// says when it was updated and carries an ItemList for search engines.
import { chromium } from "playwright";
import { launchChromium } from "../../../server/features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "../../../server/platform/http/prerender.js";
import { addDays } from "../../../shared/period.js";
import { startTestServer } from "../../../testing/test-app.js";

let baseUrl = null;
const prerender = createPrerenderer({ launch: launchChromium, baseUrl: () => baseUrl });
const app = await startTestServer({ prerender });
baseUrl = app.baseUrl;
const admin = await app.signIn("Chief", { admin: true });
const id = number => `h${String(number).padStart(2, "0")}`;
const five = start => Array.from({ length: 5 }, (_, index) => id(start + index));
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const today = new Date().toISOString().slice(0, 10);

// h01..h05 (blue) win 7 games of 10 against h11..h15 (red): ten games each, so the tournaments rank them
for (let index = 0; index < 10; index += 1) {
  const saved = await admin.browser.post("/api/admin/tournaments", {
    event: `Cup ${index}`,
    stage: "Final",
    teamA: "Alpha",
    teamB: "Beta",
    bestOf: 1,
    playedOn: addDays(today, -1 - index),
    patch: "",
    sourceUrl: "https://example.test/vod",
    note: "",
    games: [
      {
        blueTeam: "Alpha",
        redTeam: "Beta",
        winner: index < 7 ? "Alpha" : "Beta",
        durationSeconds: 900,
        bans: { blue: [], red: [] },
        picks: { blue: five(1), red: five(11) },
        pickLanes: { blue: LANES, red: LANES }
      }
    ]
  });
  if (saved.status !== 200) {
    throw new Error(saved.text);
  }
}
// h06 (Clash Lane) was never played: the editors' rating places it
await admin.browser.put("/api/official-tiers/Clash%20Lane", {
  tiers: [{ label: "A", heroes: ["h06"] }],
  expectedVersion: null
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();

// ---- without JavaScript: what a search engine reads ----------------------------------------------------------
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const answer = await page.goto(`${app.baseUrl}/tier-list`);
  check("/tier-list answers 200", answer.status() === 200);
  check(
    "the title names HOK, the tier list and the month",
    /HOK Tier List \(\w+ \d{4}\)/.test(await page.title())
  );
  check(
    "the heading is in the HTML",
    /tier list/i.test(await page.locator("#view h1").first().innerText())
  );
  const text = await page.locator("#view").innerText();
  check("the hero names are text", text.includes("Hero h01") && text.includes("Hero h11"));
  check(
    "the five lanes and their tiers are there",
    (await page.locator(".tlp-lane").count()) === 5 &&
      (await page.locator('.tlp-lane .tier-row[data-tier="SS"]').count()) === 5
  );
  check(
    "a hero links to its page",
    (await page.locator('.tlp-lane a.tlp-hero[href="/heroes/h01"]').count()) === 1
  );
  check("the page says when it was updated", /Updated on/.test(text));
  check(
    "the editors' rating places a hero never played",
    (await page
      .locator('.tlp-lane[data-lane="clash"] .tier-row[data-tier="A"] .tlp-hero')
      .first()
      .getAttribute("href")) === "/heroes/h06"
  );
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll(nodes => nodes.map(node => node.textContent));
  const list = blocks.map(block => JSON.parse(block)).find(data => data["@type"] === "ItemList");
  check(
    "an ItemList for search engines, its first hero a link to a hero page",
    Boolean(list?.itemListElement?.length) && /\/heroes\/h\d\d$/.test(list.itemListElement[0].url)
  );

  const lane = await page.goto(`${app.baseUrl}/tier-list/jungle`);
  check("/tier-list/jungle answers 200", lane.status() === 200);
  check("its title names the lane", /HOK Jungle Tier List/.test(await page.title()));
  check(
    "it shows the Jungle only",
    (await page.locator(".tlp-lane").count()) === 1 &&
      (await page.locator('.tlp-lane[data-lane="jungle"]').count()) === 1
  );
  check(
    "an unknown lane is a real 404",
    (await page.goto(`${app.baseUrl}/tier-list/top`)).status() === 404
  );
  await context.close();
}

// ---- with JavaScript: the lane tabs, the link to the maker ---------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto(`${app.baseUrl}/tier-list`);
  await page.waitForSelector(".tlp-lane");
  await page.click('.tlp-tabs a[href="/tier-list/mid"]');
  await page.waitForFunction(() => location.pathname === "/tier-list/mid");
  check(
    "a lane tab opens that lane",
    (await page.locator(".tlp-lane").count()) === 1 &&
      (await page.locator('.tlp-lane[data-lane="mid"]').count()) === 1
  );
  check(
    "the page sends to the tier list maker",
    (await page.locator('a[href="/tier-lists"]').count()) >= 1
  );
  check("no console error", errors.length === 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${app.baseUrl}/tier-list`);
  await page.waitForSelector(".tlp-lane");
  check(
    "on a phone nothing scrolls sideways",
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
  await page.close();
}

await browser.close();
await prerender.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ntier-list-public e2e clean"
);
process.exit(problems.length ? 1 : 0);
