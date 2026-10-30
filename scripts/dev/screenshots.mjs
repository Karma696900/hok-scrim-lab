// Visual review helper: seeds data and saves screenshots of the main views.
//   node scripts/dev/screenshots.mjs <output-directory>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { goNav } from "../../src/testing/nav.js";
import { startTestServer, sampleHeroes } from "../../src/testing/test-app.js";

const output = process.argv[2] || "screenshots";
mkdirSync(output, { recursive: true });
const app = await startTestServer({ seedHeroes: false });
const forms = [
  ["581", "Flowborn (Tank)", "Clash Lane"],
  ["582", "Flowborn (Mage)", "Mid Lane"],
  ["584", "Flowborn (Marksman)", "Farm Lane"],
  ["583", "Flowborn (Assassin)", "Jungle"],
  ["585", "Flowborn (Roamer)", "Roamer"]
].map(([id, name, lane]) => ({
  id,
  name,
  image: "https://camp.honorofkings.com/f.png",
  roles: ["Flowborn"],
  lanes: [lane],
  sourceIds: [id]
}));
await app.store.saveHeroes([...sampleHeroes(40), ...forms], "20260925");
const me = await app.signIn("Admin", { admin: true });
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const games = Array.from({ length: 6 }, (_, index) => ({
  blueTeam: index % 2 ? "Bravo" : "Alpha",
  redTeam: index % 2 ? "Alpha" : "Bravo",
  winner: index % 3 ? "Alpha" : "Bravo",
  durationSeconds: 1500 + index * 60,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) }
  }
}));
await me.browser.post("/api/series/import", {
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 9,
  gameMode: "free-for-all",
  games
});
const live = (
  await me.browser.post("/api/series", {
    teamA: "Nova Esports",
    teamB: "Orion Five",
    bestOf: 3,
    gameMode: "global-ban-pick"
  })
).body;
await me.browser.post(`/api/series/${live.id}/game`, { blueTeam: "Nova Esports" });
await me.browser.post(`/api/series/${live.id}/game/ready`);
for (const heroId of ["h21", "h22", "h23", "h24", "h01", "h11", "h12", "h02"]) {
  await me.browser.post(`/api/series/${live.id}/game/action`, { heroId });
}
await me.browser.post("/api/tier-lists", {
  name: "Season 4 · All",
  tiers: [
    { id: "s", label: "S", heroes: ["h03", "582", "h07", "h09"] },
    { id: "a", label: "A", heroes: ["h08", "h12"] },
    { id: "b", label: "B", heroes: [] }
  ],
  unranked: []
});
await me.browser.post("/api/tier-lists", {
  name: "Season 4 · Mid",
  lane: "Mid Lane",
  tiers: [
    { id: "s", label: "S", heroes: ["h03", "582"] },
    { id: "a", label: "A", heroes: ["h08"] },
    { id: "b", label: "B", heroes: [] }
  ],
  unranked: []
});

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "hok_session", value: me.browser.jar.get("hok_session"), url: app.baseUrl }
]);
await context.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);
const page = await context.newPage();
const shot = async name => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(output, `${name}.png`) });
  console.log("saved", name);
};
const nav = async label => {
  await goNav(page, `.nav-link:has-text("${label}")`);
  await page.waitForSelector("#view h1");
};

await page.goto(app.baseUrl);
await page.waitForSelector("#view h1");
await nav("Overview");
await shot("overview");
await nav("Heroes");
await page.waitForSelector(".hcard");
await shot("heroes");
await page.click('.hcard[data-hero-id="h01"]');
await page.waitForSelector(".hero-sheet-head");
await shot("hero-sheet");
await nav("Tier Lists");
await page.waitForSelector(".tier-row");
await shot("tier-lists");
await nav("Scrims");
await page.waitForSelector(".scoreboard, .series-row");
await shot("scrims");
await page.click('.series-row:has-text("Nova Esports")');
await page.waitForSelector(".draft-area");
await shot("draft");
await page.evaluate(() => window.scrollTo(0, 560));
await shot("draft-pool");
await nav("History");
await shot("history");
await page.setViewportSize({ width: 390, height: 844 });
await nav("Overview").catch(async () => {
  await page.click("#menu-toggle");
  await nav("Overview");
});
await shot("mobile-overview");
await browser.close();
await app.close();
