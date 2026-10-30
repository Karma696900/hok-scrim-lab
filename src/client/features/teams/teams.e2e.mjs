// Browser check of the community pages: create a team with the form, invite a player by tag, the
// player accepts, the owner changes a role and removes the member; a visitor sees the list but is
// sent to sign in to create.
import { chromium } from "playwright";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const owner = await app.signIn("Karma");
const friend = await app.signIn("Mira");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async user => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (user) {
    await context.addCookies([
      { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type()) && !/status of 40[09]/.test(message.text())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("dialog", dialog => dialog.accept());
  return page;
};

// A visitor
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/teams`);
await visitor.waitForSelector("#team-grid .empty");
check(
  "a visitor sees the (empty) list",
  /Be the first/.test(await visitor.locator("#team-grid").innerText())
);
await visitor.click('[data-team="open-form"]');
await visitor.waitForURL(/\/login/);
check("creating a team sends a visitor to sign in", true);

// The owner creates a team with the form
const page = await open(owner);
await page.goto(`${app.baseUrl}/teams`);
await page.click('[data-team="open-form"]');
await page.fill("#team-name", "Alpha Esports");
await page.fill("#team-tag", "alph");
await page.selectOption("#team-level", "amateur");
await page.selectOption("#team-region", "EU");
await page.check('input[name="languages"][value="en"]');
await page.fill("#team-description", "Evening scrims.");
await page.fill("#team-max", "6");
await page.click('#team-form button[type="submit"]');
await page.waitForTimeout(300);
check(
  "a limit under 7 is refused by the form",
  /whole number from 7 to 20/.test(await page.locator("#team-error").innerText()) ||
    (await page.url()).endsWith("/teams")
);
await page.fill("#team-max", "8");
await page.click('#team-form button[type="submit"]');
await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
await page.waitForSelector(".team-hero h1");
check(
  "the new team page shows its name, tag and level",
  /ALPHA ESPORTS/i.test(await page.locator("h1").innerText()) &&
    (await page.locator(".team-hero h1 small").innerText()) === "ALPH"
);
check(
  "the stage shows the member count against the limit",
  /1\s*\/\s*8/.test(await page.locator(".team-hero .cm-figures li").first().innerText())
);
await page.click('[data-team="tab"][data-tab="roster"]');
check(
  "and the roster says it too",
  /1 of 8/i.test(await page.locator('[data-panel="roster"] .cm-bar').innerText())
);
check(
  "the creator is the owner in the roster",
  /Karma/.test(await page.locator(".roster-table").innerText()) &&
    /Owner/i.test(await page.locator(".roster-table").innerText())
);

// A logo, from the edit form
await page.click('[data-team="open-form"]');
const png = await sharp({ create: { width: 300, height: 120, channels: 3, background: "#3366ff" } })
  .png()
  .toBuffer();
await page.setInputFiles("#team-logo-file", {
  name: "logo.png",
  mimeType: "image/png",
  buffer: png
});
await page.waitForSelector(".team-hero .emblem img");
check(
  "an uploaded logo replaces the initial on the team page",
  (await page.locator(".team-hero .emblem img").getAttribute("src")).includes("/team-logos/")
);
// the picture is in the page before it is loaded: wait for it, then read its size
await page.waitForFunction(
  () => {
    const image = document.querySelector(".team-hero .emblem img");
    return image?.complete && image.naturalWidth > 0;
  },
  null,
  { timeout: 15000 }
);
const natural = await page
  .locator(".team-hero .emblem img")
  .evaluate(image => image.complete && image.naturalWidth);
check("the logo is served as a picture", natural === 256);
await page.click('[data-team="open-form"]');
await page.click('[data-team="remove-logo"]');
await page.waitForSelector(".team-hero .emblem svg");
check("the logo can be removed", true);

// A duplicate name is explained
await page.goto(`${app.baseUrl}/teams`);
await page.click('[data-team="open-form"]');
await page.fill("#team-name", "alpha  esports");
await page.fill("#team-tag", "ZZ");
await page.click('#team-form button[type="submit"]');
await page.waitForFunction(() =>
  /already taken/.test(document.querySelector("#team-error")?.textContent ?? "")
);
check("a name already taken is refused with a clear message", true);

// Invite by tag; the friend accepts from the list page
await page.goto(`${app.baseUrl}/teams`);
await page.click(".tcard");
await page.click('[data-team="tab"][data-tab="roster"]');
await page.waitForSelector("#invite-form");
await page.fill("#invite-tag", `#${friend.user.tag}`);
await page.selectOption("#invite-role", "player");
await page.selectOption("#invite-lane", "Jungle");
await page.click('#invite-form button[type="submit"]');
await page.waitForSelector("#team-pending .row");
check(
  "the pending invitation is listed for the staff",
  (await page.locator("#team-pending .row").innerText()).includes(friend.user.tag)
);

const guest = await open(friend);
await guest.goto(`${app.baseUrl}/teams`);
await guest.waitForSelector('[data-team="accept"]');
check(
  "the invited player sees the invitation, with the team, the role and the lane",
  /Alpha Esports/.test(await guest.locator(".invrow").innerText()) &&
    /Player/.test(await guest.locator(".invrow").innerText()) &&
    /Jungle/.test(await guest.locator(".invrow").innerText())
);
await guest.click('[data-team="accept"]');
await guest.waitForFunction(
  () =>
    document.querySelector('[data-team="list-tab"][data-tab="mine"] .count')?.textContent === "1"
);
check("after accepting, the team is counted in the tab of the person's teams", true);
await guest.click('[data-team="list-tab"][data-tab="mine"]');
await guest.waitForFunction(() => document.querySelectorAll("#team-grid .tcard").length === 1);
check(
  "the tab shows the team with the role of the person",
  /Alpha Esports/.test(await textOf(guest, "#team-grid")) &&
    /Player/.test(await textOf(guest, "#team-grid .role-badge"))
);
await guest.click(".tcard");
await guest.click('[data-team="tab"][data-tab="roster"]');
await guest.waitForSelector(".roster-table");
check("a plain member has no invite form", (await guest.locator("#invite-form").count()) === 0);
await guest.click('[data-team="more"]');
await guest.waitForSelector(".pop");
check(
  "a plain member can leave but not delete the team",
  (await guest.locator('.pop [data-pick="delete"]').count()) === 0 &&
    (await guest.locator('.pop [data-pick="leave"]').count()) === 1
);
await guest.keyboard.press("Escape");

// The list shows the lanes the roster covers (the friend plays Jungle)
await page.goto(`${app.baseUrl}/teams`);
await page.waitForSelector(".tcard");
check(
  "the card of the list shows the lanes of the roster",
  (await page.locator(".tcard .lane").count()) === 1 &&
    (await page.locator(".tcard .lane img").getAttribute("alt")) === "Jungle"
);
await page.click(".tcard");
await page.waitForSelector(".team-hero h1");
check(
  "the overview is the first tab, the roster and the agenda are other ones",
  (await page.locator('[data-panel="overview"]').isVisible()) &&
    !(await page.locator('[data-panel="roster"]').isVisible()) &&
    !(await page.locator('[data-panel="agenda"]').isVisible())
);
await page.click('[data-team="tab"][data-tab="agenda"]');
check("the agenda tab shows the agenda", await page.locator("#team-agenda").isVisible());

// The agenda: the owner adds a scrim and a public availability window; a stranger only sees the
// availability
const inDays = (days, hours = 0) => {
  const when = new Date(Date.now() + days * 86400000 + hours * 3600000);
  when.setSeconds(0, 0);
  return new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
await page.click('[data-team="new-event"]');
await page.fill("#event-title", "Scrim vs Nova");
await page.fill("#event-start", inDays(2));
await page.fill("#event-end", inDays(2, 2));
await page.fill("#event-note", "BO3, lobby by DM");
await page.click('#event-form button[type="submit"]');
await page.waitForSelector("#team-agenda .event-row");
check(
  "a scheduled scrim appears in the agenda with its note",
  /Scrim vs Nova/.test(await page.locator("#team-agenda").innerText()) &&
    /lobby by DM/.test(await page.locator("#team-agenda").innerText())
);
await page.click('[data-team="new-event"]');
await page.selectOption("#event-kind", "availability");
await page.fill("#event-start", inDays(3));
await page.fill("#event-end", inDays(3, 2));
await page.fill("#event-note", "private");
await page.click('#event-form button[type="submit"]');
await page.waitForFunction(() => document.querySelectorAll("#team-agenda .event-row").length === 2);
check("the team agenda lists both events", true);
const outsider = await open(null);
await outsider.goto(page.url());
await outsider.waitForSelector(".team-hero h1");
await outsider.click('[data-team="tab"][data-tab="agenda"]');
await outsider.waitForSelector('[data-panel="agenda"] .event-row');
const seen = await outsider.locator("#view").innerText();
check(
  "a visitor sees the public availability but neither the scrim nor the notes",
  /Public availability/i.test(seen) &&
    (await outsider.locator(".event-row").count()) === 1 &&
    !/Scrim vs Nova/.test(seen) &&
    !/private/.test(seen) &&
    (await outsider.locator("#team-agenda").count()) === 0
);
await page.click('#team-agenda [data-team="delete-event"] >> nth=0');
await page.waitForFunction(() => document.querySelectorAll("#team-agenda .event-row").length === 1);
check("an event can be deleted", true);

// The owner changes the role, then removes the member
await page.reload();
await page.click('[data-team="tab"][data-tab="roster"]');
await page.waitForSelector(".roster-table");
check(
  "the roster now lists both people",
  (await page.locator(".roster-table .pcard").count()) === 2
);
const lane = name => page.locator(`.pcard:has-text("Mira") .lane-edit .lane[data-lane="${name}"]`);
check(
  "the lane of the player is lit",
  (await lane("Jungle").getAttribute("aria-pressed")) === "true"
);
await lane("Mid Lane").click();
await page.waitForFunction(
  () =>
    document.querySelector('.pcard .lane[data-lane="Mid Lane"]')?.getAttribute("aria-pressed") ===
    "true"
);
check(
  "a click on another logo moves the lane",
  (await lane("Jungle").getAttribute("aria-pressed")) === "false"
);
await lane("Mid Lane").click();
await page.waitForFunction(
  () => document.querySelectorAll('.pcard .lane[aria-pressed="true"]').length === 0
);
check("a click on the lit logo clears the lane", true);
await page.selectOption('.pcard:has-text("Mira") [data-team="role"]', "captain");
await page.waitForFunction(
  () =>
    /Mira/.test(document.querySelector(".roster-table")?.innerText ?? "") &&
    document.querySelector('.pcard [data-team="role"]')?.value === "captain"
);
check("the role change is saved", true);
await page.click('.pcard:has-text("Mira") [data-team="remove"]');
await page.waitForFunction(() => document.querySelectorAll(".roster-table .pcard").length === 1);
check("a removed member leaves the roster", true);

// Deleting
await page.click('[data-team="more"]');
await page.click('.pop [data-pick="delete"]');
await page.waitForURL(/\/teams$/);
await page.waitForSelector("#team-grid .empty");
check("the owner can delete the team", true);

await browser.close();
await app.close();
for (const problem of problems) {
  console.log("PROBLEM", problem);
}
console.log(problems.length ? `\n${problems.length} problem(s)` : "\nteams e2e clean");
process.exit(problems.length ? 1 : 0);
