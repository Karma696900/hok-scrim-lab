import { chromium } from "playwright";

import { startTestServer, sampleHeroes } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";
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
  image: `https://camp.honorofkings.com/${id}.png`,
  roles: ["Flowborn"],
  lanes: [lane],
  sourceIds: [id]
}));
await app.store.saveHeroes([...sampleHeroes(30), ...forms], "20260925");

const problems = [];
const browser = await chromium.launch();
// Tall enough to hold the whole board: a drag from the unranked pool to a tier must not scroll.
const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

await page.goto(app.baseUrl);
await goNav(page, '.nav-link:has-text("Tier Lists")');
await page.waitForSelector(".lane-tab");
check(
  "one single lane control (no second dropdown)",
  (await page.locator("#new-tier-lane").count()) === 0 &&
    (await page.locator(".lane-tab").count()) === 6
);
await page.click('.lane-tab[data-lane="Mid Lane"]');
check(
  "the empty lane says so and offers to create it",
  /No Mid tier list yet/i.test(await page.locator("main").innerText())
);
await page.click('.page-head [data-action="create-tier-list"]');
await page.waitForSelector(".tier-unranked .tier-avatar");
const midLabels = await page.$$eval(".tier-unranked .tier-avatar", nodes =>
  nodes.map(node => node.getAttribute("aria-label"))
);
check(
  "lane list: exactly one Flowborn, named Flowborn",
  midLabels.filter(label => label.startsWith("Flowborn")).length === 1 &&
    midLabels.includes("Flowborn")
);
check(
  "lane list: avatars only (no visible names in Unranked)",
  (await page.locator(".tier-unranked .tier-avatar span:not(.image-fallback)").count()) === 0
);
check(
  "lane list: tooltip carries the name",
  (await page.getAttribute(".tier-unranked .tier-avatar", "title")).length > 0
);

check(
  "the Mid tab now filters to the lane list only",
  (await page.locator(".tl-card:not(.tl-card--new)").count()) === 1 &&
    /Mid/i.test(await page.locator(".lane-tab.active").innerText())
);
check(
  "avatars are large enough (>= 64px)",
  (await page.locator(".tier-unranked .tier-avatar").first().boundingBox()).width >= 64
);

// ---- the tiers: SS first, and the colour of a tier follows its name (as on the ratings) ----------------
const tierNames = () => page.$$eval(".tier-name", fields => fields.map(field => field.value));
const labelColour = index =>
  page
    .locator(".tier-row .tier-label")
    .nth(index)
    .evaluate(label => getComputedStyle(label).backgroundColor);
const tokenColour = token =>
  page.evaluate(name => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(--tier-${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);
const [ss, s, a, b, c, d] = await Promise.all(
  ["ss", "s", "a", "b", "c", "d"].map(token => tokenColour(token))
);
check(
  "a new tier list starts with SS, then S, A, B, C, D",
  (await tierNames()).join() === "SS,S,A,B,C,D"
);
const shown = await Promise.all([0, 1, 2, 3, 4, 5].map(labelColour));
check(
  "each tier has the colour of its name: SS, S, A, B, C and D are six different colours",
  JSON.stringify(shown) === JSON.stringify([ss, s, a, b, c, d]) && new Set(shown).size === 6
);
const rename = async (index, name) => {
  const field = page.locator(".tier-name").nth(index);
  await field.fill(name);
  await field.press("Tab");
};
await rename(0, "D");
await page.waitForFunction(() => document.querySelector(".tier-row")?.dataset.tier === "D");
check("renaming SS to D gives the row the colour of D at once", (await labelColour(0)) === d);
await rename(0, "top");
await page.waitForFunction(() => !document.querySelector(".tier-row")?.dataset.tier);
check(
  "a name that is none of the six takes the colour of its place (the first one is S red)",
  (await labelColour(0)) === s
);
await rename(0, "ss");
await page.waitForFunction(() => document.querySelector(".tier-row")?.dataset.tier === "SS");
check("a name is read whatever its case: ss is SS", (await labelColour(0)) === ss);
await page.locator(".tier-row").first().hover();
await page.click('.tier-row:first-child [data-action="move-tier"][data-direction="1"]');
await page.waitForFunction(
  () =>
    document.querySelectorAll(".tier-name")[1]?.value === "ss" ||
    document.querySelectorAll(".tier-name")[1]?.value === "SS"
);
check(
  "a tier that is moved keeps the colour of its name (SS second is still SS magenta, S first is S red)",
  (await labelColour(0)) === s && (await labelColour(1)) === ss
);
await page.locator(".tier-row").nth(1).hover();
await page.click('.tier-row:nth-child(2) [data-action="move-tier"][data-direction="-1"]');
await page.waitForFunction(
  () => document.querySelectorAll(".tier-name")[0]?.value.toUpperCase() === "SS"
);
check("and it goes back up", (await labelColour(0)) === ss);

await page.click('.lane-tab[data-lane="all"]');
await page.click('.page-head [data-action="create-tier-list"]');
await page.waitForFunction(
  () => document.querySelectorAll(".tier-unranked .tier-avatar").length > 30
);
const allLabels = await page.$$eval(".tier-unranked .tier-avatar", nodes =>
  nodes.map(node => node.getAttribute("aria-label"))
);
const flowborn = allLabels.filter(label => label.startsWith("Flowborn"));
check(
  "All Roles: five Flowborn entries with a lane in the accessible label",
  flowborn.length === 5 &&
    flowborn.every(label => /lane$/.test(label)) &&
    new Set(flowborn).size === 5
);
check("All Roles: no '(role)' suffix anywhere", !allLabels.some(label => /\(/.test(label)));
check(
  "All Roles: lane badges drawn",
  (await page.locator(".tier-unranked .tier-lane-badge").count()) === 5
);

// Drag a hero into tier S and check it persists across a reload.
const first = page.locator(".tier-unranked .tier-avatar").first();
const heroName = await first.getAttribute("aria-label");
await first.dragTo(page.locator(".tier-row:first-child .tier-drop"));
await page.waitForFunction(
  () => document.querySelectorAll(".tier-row:first-child .tier-avatar").length === 1
);
await page.reload();
await page.waitForFunction(
  () =>
    document.querySelector("#view .page-head, #view .scoreboard, #view .auth-card") &&
    !document.querySelector("#view .loading-line")
);
await goNav(page, '.nav-link:has-text("Tier Lists")');
await page.waitForSelector(".tier-avatar");
check(
  "drag and drop persists",
  (await page.locator(".tier-row:first-child .tier-avatar").count()) === 1 &&
    (await page.locator(".tier-row:first-child .tier-avatar").first().getAttribute("title")) ===
      heroName
);

// ---- the reserve (search, lane filter) and the way without a drag: a click or a key -------------------------------------
const reserved = () => page.locator(".tier-reserve .tier-avatar").count();
const inTier = (tier, label) =>
  page.waitForFunction(
    ([name, wanted]) =>
      [...document.querySelectorAll(`.tier-row[data-tier="${name}"] .tier-avatar`)].some(
        element => element.getAttribute("aria-label") === wanted
      ),
    [tier, label]
  );
const everyone = await reserved();
await page.fill("#tier-reserve-search", "zzzz-nobody");
check(
  "a search of the reserve that matches nobody says so",
  (await reserved()) === 0 && /No match/i.test(await page.locator("#tier-reserve-grid").innerText())
);
await page.fill("#tier-reserve-search", "");
check("an empty search gives every hero back", (await reserved()) === everyone);
await page.click('.tier-reserve [data-action="tier-reserve-lane"][data-lane="Jungle"]');
const jungling = await reserved();
check(
  "the lane filter of the reserve keeps the heroes of that lane",
  jungling > 0 && jungling < everyone
);
await page.click('.tier-reserve [data-action="tier-reserve-lane"][data-lane="all"]');
const chosen = page.locator(".tier-reserve .tier-avatar").first();
const chosenName = await chosen.getAttribute("aria-label");
await chosen.click();
check(
  "a click picks a hero: the bar offers the six tiers and the reserve",
  (await page.locator('.tier-reserve .tier-avatar[aria-pressed="true"]').count()) === 1 &&
    (await page.locator('.tier-move [data-action="tier-send"]').count()) === 7
);
await page.click('.tier-move [data-action="tier-send"][data-tier="A"]');
await inTier("A", chosenName);
check(
  "sent with the bar: the hero is in its tier and nothing is picked any more",
  (await page.locator(".tier-move").count()) === 0
);
const keyed = page.locator(".tier-reserve .tier-avatar").first();
const keyedName = await keyed.getAttribute("aria-label");
await keyed.focus();
await page.keyboard.press("2");
await inTier("S", keyedName);
check("the key 2 sends the hero that has the focus to the second tier", true);
await page.locator(".tier-reserve .tier-avatar").first().focus();
await page.keyboard.press("Enter");
check("Enter picks the hero that has the focus", (await page.locator(".tier-move").count()) === 1);
await page.keyboard.press("Escape");
check("and Escape lets it go", (await page.locator(".tier-move").count()) === 0);
await page.locator(".tier-reserve .tier-avatar").first().focus();
await page.keyboard.press("ArrowRight");
check(
  "the arrow keys go from a hero to the next",
  (await page.evaluate(() => document.activeElement?.matches(".tier-reserve .tier-avatar"))) &&
    (await page.evaluate(() => document.activeElement?.getAttribute("tabindex"))) === "0"
);

await page.click('.lane-tab[data-lane="Mid Lane"]');
check(
  "switching tabs shows only that lane's list and its heroes",
  (await page.locator(".tl-card:not(.tl-card--new)").count()) === 1 &&
    (await page.locator(".tier-unranked .tier-avatar").count()) < 20
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ntier smoke clean");
process.exit(problems.length ? 1 : 0);
