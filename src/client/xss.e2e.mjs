// Stored-XSS check in a real browser: hostile strings in every user- or source-controlled field
// must be displayed as text and never execute or break out of an attribute.
import { chromium } from "playwright";
import { sampleHeroes, startTestServer } from "../testing/test-app.js";
import { goNav, openHeroTab } from "../testing/nav.js";

const HOSTILE = [
  `<img src=x onerror=window.__pwned='a'>`,
  `"><svg onload=window.__pwned='b'>`,
  `' onmouseover='window.__pwned="c"`,
  `</script><script>window.__pwned='d'</script>`
];
const app = await startTestServer({ seedHeroes: false });
const heroes = sampleHeroes(30);
heroes[0].name = HOSTILE[0];
heroes[0].image = `https://camp.honorofkings.com/x.png" onerror="window.__pwned='img'`;
heroes[1].name = HOSTILE[1];
heroes[1].roles = [HOSTILE[2]];
await app.store.saveHeroes(heroes, "20260925");

const admin = await app.signIn(HOSTILE[0], { admin: true });
await admin.browser.post("/api/tier-lists", {
  name: HOSTILE[1],
  tiers: [{ id: "t1", label: HOSTILE[2].slice(0, 24), heroes: ["h01"] }],
  unranked: []
});
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
await admin.browser.post("/api/series/import", {
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 1,
  gameMode: "free-for-all",
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Bravo",
      winner: "Alpha",
      durationSeconds: 1500,
      draft: {
        bans: { blue: ids(21, 5), red: ids(26, 5) },
        picks: { blue: ids(1, 5), red: ids(11, 5) }
      }
    }
  ]
});
const rejected = await admin.browser.post("/api/series", {
  teamA: HOSTILE[0],
  teamB: "B",
  bestOf: 1,
  gameMode: "free-for-all"
});
const game = {
  blueTeam: "Alpha",
  redTeam: "Bravo",
  winner: "Alpha",
  durationSeconds: null,
  bans: { blue: [], red: [] },
  picks: { blue: ids(1, 5), red: ids(11, 5) }
};
const hostileSeries = await admin.browser.post("/api/admin/tournaments", {
  event: HOSTILE[0],
  stage: "",
  teamA: "Alpha",
  teamB: "Bravo",
  bestOf: 1,
  playedOn: "2026-05-01",
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  games: [game]
});
const hostileItem = await admin.browser.post("/api/admin/catalog/items", {
  name: HOSTILE[0],
  category: "regular",
  stats: []
});
const stat = await admin.browser.post("/api/admin/catalog/stats", { name: HOSTILE[2] });
const tag = await admin.browser.post("/api/admin/catalog/tags", {
  name: HOSTILE[2].slice(0, 40),
  color: "red"
});
const quoted = await admin.browser.post("/api/admin/catalog/items", {
  name: HOSTILE[2],
  category: "regular",
  description: HOSTILE[2],
  stats: [{ statId: stat.body.id, value: 5 }],
  tags: [tag.body.id],
  effects: [{ kind: "passive", name: HOSTILE[2], text: HOSTILE[2] }]
});
const second = await admin.browser.post("/api/admin/catalog/items", {
  name: "Plain",
  category: "regular",
  stats: []
});
const buildResponse = await admin.browser.put("/api/builds/h01/1", {
  name: HOSTILE[2],
  note: HOSTILE[2],
  sourceUrl: `https://example.test/x/"><script>window.__pwned='e'</script>`,
  build: {
    items: [quoted.body.id, second.body.id],
    utility: [],
    late: [],
    core: [quoted.body.id, second.body.id],
    arcana: { red: [], blue: [], green: [] }
  }
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
check("hostile team names are rejected at the API", rejected.status === 400);
check(
  "hostile tournament and item names with markup are rejected at the API",
  hostileSeries.status === 400 && hostileItem.status === 400
);
check(
  "quotes in catalog and build texts are kept as data (the UI must escape them)",
  quoted.status === 200 && buildResponse.status === 200
);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "hok_session", value: admin.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("dialog", async dialog => {
  problems.push(`dialog opened: ${dialog.message()}`);
  await dialog.dismiss();
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);

const inspect = async label => {
  const state = await page.evaluate(() => ({
    pwned: window.__pwned ?? null,
    injected: document.querySelectorAll(
      "[onerror], [onload], [onmouseover], main script, main svg[onload]"
    ).length,
    inlineScripts: [
      ...document.querySelectorAll('script:not([src]):not(#boot):not([type="application/ld+json"])')
    ].filter(script => !script.textContent.startsWith("(function(){var done")).length // the JSON data block and the hashed boot loader are ours
  }));
  check(
    `${label}: nothing executed and no injected element or handler`,
    state.pwned === null && state.injected === 0 && state.inlineScripts === 0
  );
};

await page.goto(app.baseUrl);
await page.waitForSelector(".nav-link");
await page.waitForFunction(() =>
  document.querySelector("#account-control")?.textContent.includes("<img")
);
// textContent, not innerText: below 1500 px the bar draws the avatar alone and the name stays in the page for the readers
check(
  "the account name is shown as literal text",
  (await page.locator("#account-control").textContent()).includes(HOSTILE[0])
);
await inspect("account control");
for (const view of ["Overview", "Heroes", "Tier Lists", "Scrims"]) {
  await goNav(page, `.nav-link:has-text("${view}")`);
  await page.waitForSelector("#view h1");
  await page.waitForTimeout(300);
  await inspect(view);
}
await page.goto(`${app.baseUrl}/history`);
await page.waitForSelector("#view h1");
await page.waitForTimeout(300);
await inspect("History");
await goNav(page, '.nav-link:has-text("Heroes")');
await page.waitForSelector(".hcard");
check(
  "hostile hero names appear as text on the Heroes page",
  (await page.locator("main").textContent()).includes(HOSTILE[1])
);
await page.click('.hcard[data-hero-id="h01"]');
await openHeroTab(page, "builds");
await page.waitForSelector(".build-card");
await page.waitForTimeout(300);
await page.click(".build-card .build-slot");
await page.waitForSelector(".piece-details");
check(
  "catalog texts show as literal text in the build and its details",
  (await page.locator(".build-card").innerText()).includes(HOSTILE[2]) &&
    (await page.locator(".piece-details").innerText()).includes(HOSTILE[2])
);
check(
  "the hero sheet shows the build source as a link that stayed inside its attribute",
  (await page.locator(".build-card a").first().getAttribute("href")).startsWith(
    "https://example.test/x/"
  )
);
await inspect("hero sheet");
await goNav(page, '.nav-link:has-text("Tier Lists")');
await page.waitForSelector(".tier-row");
check(
  "tier list name and tier label are literal text",
  (await page.locator("#tier-list-name").inputValue()) === HOSTILE[1]
);
await inspect("tier list");
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click('.series-row:has-text("Alpha")');
await page.waitForSelector(".scoreboard");
await inspect("series board");

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nxss e2e clean");
process.exit(problems.length ? 1 : 0);
