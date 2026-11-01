// Browser check of the official ratings (/ratings): only the editors see the page, the heroes are moved
// from a tier to another (drag, or click then a button), saved lane by lane, and the result is the
// rating that everybody sees next to each lane on the page of a hero.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const helper = await app.signIn("Helper");
const plain = await app.signIn("Plain");
await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, {
  labels: ["contributor"]
});
// h01 plays Clash Lane and Jungle: two ratings on its page
await admin.browser.post("/api/admin/heroes/h01/lanes", { lane: "Jungle" });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    // a conflict (409) is what the two-editors scenario expects
    if (["error", "warning"].includes(message.type()) && !/status of 409/.test(message.text())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};
const tierOf = (page, heroId) =>
  page.evaluate(
    id =>
      document.querySelector(`.tier-avatar[data-hero="${id}"]`)?.closest(".tier-drop")?.dataset
        .drop,
    heroId
  );

// ---- who sees it ------------------------------------------------------------------------------------
const stranger = await open(plain);
await stranger.goto(`${app.baseUrl}/ratings`);
await stranger.waitForSelector("main h1");
check(
  "a person who is not an editor sees a sentence, no menu entry and no board",
  (await stranger.locator("#nav-ratings[hidden]").count()) === 1 &&
    /Contributor label/.test(await stranger.locator("main").innerText()) &&
    (await stranger.locator(".rt-board").count()) === 0
);

// ---- the board -----------------------------------------------------------------------------------------
const page = await open(helper);
await page.goto(`${app.baseUrl}/ratings`);
await page.waitForSelector(".rt-board");
check(
  "a Contributor has the entry in the menu and the five lanes",
  (await page.locator("#nav-ratings:not([hidden])").count()) === 1 &&
    (await page.locator(".rt-lanes .lane-tab").count()) === 5
);
check(
  "six tiers from SS to D, then Unranked where the heroes of the lane wait",
  (await page
    .locator(".rt-board .tier-drop")
    .evaluateAll(zones => zones.map(zone => zone.dataset.drop).join())) ===
    "SS,S,A,B,C,D,unranked" &&
    (await page.locator('.tier-drop[data-drop="unranked"] .tier-avatar').count()) >= 6
);

// the same board as the tier lists: a new list starts with the same six tiers, and every tier is drawn
// the same way (colour of its name, size of the label and of the row, round portraits)
const boardLook = who =>
  who.evaluate(() => {
    const look = row => {
      const label = row.querySelector(".tier-label");
      const field = row.querySelector(".tier-name");
      return {
        tier: field ? (field.value ?? field.textContent).trim() : "unranked",
        dashed: getComputedStyle(row).borderStyle,
        colour: getComputedStyle(label).backgroundColor,
        text: getComputedStyle(field ?? label).fontSize,
        labelWidth: Math.round(label.getBoundingClientRect().width),
        minHeight: getComputedStyle(row).minHeight,
        radius: getComputedStyle(row).borderRadius
      };
    };
    const avatar = document.querySelector(".tier-avatar");
    return {
      rows: [...document.querySelectorAll(".tier-row")].map(look),
      avatar: avatar
        ? {
            size: Math.round(avatar.getBoundingClientRect().width),
            round: getComputedStyle(avatar).borderRadius
          }
        : null
    };
  });
const lists = await open(helper);
await lists.goto(`${app.baseUrl}/tier-lists`);
await lists.waitForSelector(".lane-tab");
await lists.click('.lane-tab[data-lane="Clash Lane"]');
await lists.click('.page-head [data-action="create-tier-list"]');
await lists.waitForSelector(".tier-row");
const listLook = await boardLook(lists);
const ratingLook = await boardLook(page);
// the heroes that are not ranked yet wait in a band of the board in the ratings, and in a reserve docked at the
// bottom of the screen in the tier lists: the six tiers are the rows the two pages share
const tiersOf = look => look.rows.filter(row => row.tier !== "unranked");
check(
  "a new tier list starts with SS, then S, A, B, C, D, like the ratings",
  listLook.rows.map(row => row.tier).join() === "SS,S,A,B,C,D" &&
    ratingLook.rows.map(row => row.tier).join() === "SS,S,A,B,C,D,unranked"
);
check(
  "each tier has the same colour, size and shape in the tier list and in the ratings",
  JSON.stringify(listLook.rows) === JSON.stringify(tiersOf(ratingLook)) &&
    new Set(listLook.rows.map(row => row.colour)).size === 6
);
check(
  "the heroes have the same shape on both pages, 64 px and more",
  ratingLook.avatar !== null &&
    ratingLook.avatar.round === listLook.avatar.round &&
    ratingLook.avatar.size >= 64 &&
    listLook.avatar.size >= 64
);
await lists.close();

// drag h01 to A
await page.dragAndDrop('.tier-avatar[data-hero="h01"]', '[data-drop="A"]');
check("a hero is dragged to a tier", (await tierOf(page, "h01")) === "A");
// click h06, then a button
await page.click('.tier-avatar[data-hero="h06"]');
check(
  "a click picks a hero and offers the tiers to send it to",
  (await page.locator('.tier-avatar[data-hero="h06"][aria-pressed="true"]').count()) === 1 &&
    (await page.locator("[data-send]").count()) === 7
);
await page.click('[data-send="S"]');
check(
  "sent to S with a button, and nothing is picked any more",
  (await tierOf(page, "h06")) === "S" && (await page.locator("[data-send]").count()) === 0
);
check(
  "the page says the changes are not saved",
  /not saved yet/i.test(await page.locator("#rt-state").innerText()) &&
    (await page.locator("[data-save]").isEnabled())
);

// leaving the lane with changes asks first
page.once("dialog", dialog => dialog.dismiss());
await page.click('.rt-lanes [data-lane="Jungle"]');
check(
  "going to another lane with changes not saved asks first, and stays when the answer is no",
  (await page.locator('.rt-lanes [data-lane="Clash Lane"].active').count()) === 1 &&
    (await tierOf(page, "h06")) === "S"
);

await page.click("[data-save]");
await page.waitForFunction(() => document.querySelector("#toasts")?.innerText.length > 0);
const stored = (await helper.browser.get("/api/official-tiers")).body.lanes.find(
  lane => lane.lane === "Clash Lane"
);
check(
  "saved: the server holds the tiers and the version moved",
  stored.version === 0 &&
    stored.tiers.find(tier => tier.label === "A").heroes.includes("h01") &&
    stored.tiers.find(tier => tier.label === "S").heroes.includes("h06")
);
check(
  "nothing is waiting any more, and Reset is off",
  (await page.locator("#rt-state").innerText()).trim() === "" &&
    (await page.locator("[data-reset]").isDisabled())
);

// the Jungle lane: h01 is there too
await page.click('.rt-lanes [data-lane="Jungle"]');
await page.waitForSelector('.tier-avatar[data-hero="h01"]');
check(
  "the lane that was added to h01 lists it in Unranked, ready to be rated",
  (await tierOf(page, "h01")) === "unranked"
);
await page.dragAndDrop('.tier-avatar[data-hero="h01"]', '[data-drop="SS"]');
await page.click("[data-save]");
await page.waitForFunction(() => document.querySelector("#rt-state")?.innerText.trim() === "");

// ---- the result, on the page of the hero, for everybody -------------------------------------------------------
const reader = await open(null);
await reader.goto(`${app.baseUrl}/heroes`);
await reader.click('.hcard[data-hero-id="h01"]');
await reader.waitForSelector(".hero-rating");
const badges = await reader
  .locator(".flane")
  .evaluateAll(lanes =>
    lanes.map(lane => [
      lane.querySelector("b")?.innerText.replace(/manual$/i, ""),
      lane.querySelector(".hero-rating")?.dataset.tier
    ])
  );
check(
  "the page of the hero shows a rating next to each of its lanes: Clash A, Jungle SS",
  JSON.stringify(badges) ===
    JSON.stringify([
      ["Clash", "A"],
      ["Jungle", "SS"]
    ]) ||
    JSON.stringify(badges) ===
      JSON.stringify([
        ["Jungle", "SS"],
        ["Clash", "A"]
      ])
);
check(
  "the badge says what it is and where it comes from (no tournament game here: the editors)",
  /Tier in .*Clash.*: A, from the editors/.test(
    (await reader.locator('.hero-rating[data-tier="A"]').getAttribute("aria-label")) ?? ""
  )
);
await reader.goBack();
await reader.click('.hcard[data-hero-id="h11"]');
await reader.waitForSelector(".fbanner");
check(
  "a hero that was not rated shows no rating: nothing is guessed",
  (await reader.locator(".hero-rating").count()) === 0
);
await reader.goto(`${app.baseUrl}/ratings`);
await reader.waitForSelector("main h1");
check(
  "the lists themselves stay private: a visitor only gets a sentence",
  (await reader.locator(".rt-board").count()) === 0
);

// ---- two editors ---------------------------------------------------------------------------------------------------------
const first = await open(admin);
await first.goto(`${app.baseUrl}/ratings`);
await first.waitForSelector(".rt-board");
const second = await open(helper);
await second.goto(`${app.baseUrl}/ratings`);
await second.waitForSelector(".rt-board");
await second.dragAndDrop('.tier-avatar[data-hero="h06"]', '[data-drop="B"]');
await second.click("[data-save]");
await second.waitForFunction(() => document.querySelector("#rt-state")?.innerText.trim() === "");
await first.dragAndDrop('.tier-avatar[data-hero="h06"]', '[data-drop="D"]');
await first.click("[data-save]");
await first.waitForSelector("#ratings-root .form-error:not(:empty)");
check(
  "an editor who saves after somebody else did is told, and nothing is overwritten",
  /changed since you opened/.test(await first.locator("#ratings-root .form-error").innerText()) &&
    (await helper.browser.get("/api/official-tiers")).body.lanes
      .find(lane => lane.lane === "Clash Lane")
      .tiers.find(tier => tier.label === "B")
      .heroes.includes("h06")
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nratings e2e clean");
process.exit(problems.length ? 1 : 0);
