// Browser check of the community pages: a team posts an announcement, another asks for a scrim from
// the composer, answers in the inbox, the scrim lands in the agenda with an RSVP, a player page is
// edited and read, the Discord page explains it is not configured.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const alpha = await app.signIn("Karma");
const nova = await app.signIn("Mira");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (user, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  if (user) {
    await context.addCookies([
      { name: "hok_session", value: user.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    if (
      ["error", "warning"].includes(message.type()) &&
      !/status of 40[0-9]/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("dialog", dialog => dialog.accept("Spam in the chat"));
  return page;
};
const local = (days, hours = 0) => {
  const when = new Date(Date.now() + days * 86400000 + hours * 3600000);
  when.setSeconds(0, 0);
  return new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

await alpha.browser.post("/api/teams", {
  name: "Alpha Esports",
  tag: "ALPH",
  level: "amateur",
  region: "EU",
  timezone: "UTC+1"
});
await nova.browser.post("/api/teams", {
  name: "Nova Gaming",
  tag: "NOVA",
  level: "pro",
  region: "EU",
  timezone: "UTC+1"
});

// A visitor can read the announcements and sees why the private pages need an account
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/find`);
await visitor.waitForSelector("#post-list");
check(
  "a visitor sees the Find a scrim page with its filters",
  (await visitor.locator("#find-filters").count()) === 1
);
await visitor.goto(`${app.baseUrl}/inbox`);
await visitor.waitForSelector(".sign-in-prompt");
check(
  "the inbox asks a visitor to sign in",
  /Sign in/.test(await visitor.locator(".sign-in-prompt").innerText())
);

// Nova posts an announcement
const novaPage = await open(nova);
await novaPage.goto(`${app.baseUrl}/find`);
await novaPage.waitForSelector("#post-list");
await novaPage.click('[data-community="open-post-form"]');
await novaPage.selectOption("#pf-format", "3");
await novaPage.fill("#pf-start", local(2));
await novaPage.fill("#pf-end", local(2, 3));
await novaPage.fill("#pf-note", "Mid-focused comps welcome");
await novaPage.click('#post-form button[type="submit"]');
await novaPage.waitForSelector("#post-list .ann");
check(
  "the announcement is listed with its team and note",
  /Nova Gaming/.test(await textOf(novaPage, "#post-list")) &&
    /Mid-focused/.test(await textOf(novaPage, "#post-list"))
);
check(
  "its own team can close it",
  (await novaPage.locator('#post-list [data-community="close-post"]').count()) === 1 &&
    (await novaPage.locator('#find-side [data-community="close-post"]').count()) === 1
);

// Alpha filters, requests a scrim from the announcement
const alphaPage = await open(alpha);
await alphaPage.goto(`${app.baseUrl}/find`);
await alphaPage.waitForSelector("#post-list .ann");
await alphaPage.selectOption("#f-level", "amateur");
await alphaPage.waitForFunction(() =>
  /no announcement matches/i.test(document.querySelector("#post-list")?.innerText ?? "")
);
check("the level filter hides a pro announcement", true);
await alphaPage.selectOption("#f-level", "");
await alphaPage.waitForSelector("#post-list .ann");
await alphaPage.click('[data-community="request-post"]');
await alphaPage.waitForSelector("#request-form");
check(
  "the composer is pre-filled from the announcement",
  (await alphaPage.inputValue("#rq-format")) === "3"
);
await alphaPage.fill("#rq-note", "Hi! BO3 on Friday?");
await alphaPage.click('#request-form button[type="submit"]');
await alphaPage.waitForURL(/\/inbox\?open=/);
await alphaPage.waitForSelector(".reqcard");
check(
  "the sender sees the request waiting, without answer buttons",
  /Pending/i.test(await alphaPage.locator(".chat-head").innerText()) &&
    (await alphaPage.locator('[data-action="accept"]').count()) === 0
);

// Nova: badge, inbox, counter-proposal then message, Alpha accepts
await novaPage.goto(`${app.baseUrl}/inbox`);
await novaPage.waitForSelector(".th");
check(
  "the menu counts what waits for Nova",
  (await novaPage.locator("#badge-inbox").innerText()).trim() !== ""
);
await novaPage.click(".th");
await novaPage.waitForSelector('[data-action="accept"]');
check(
  "Nova sees Your turn with accept, decline and propose",
  (await novaPage.locator('[data-action="decline"]').count()) === 1 &&
    /your turn/i.test(await novaPage.locator(".th").innerText())
);
await novaPage.click('[data-community="toggle-counter"]');
await novaPage.fill("#counter-start", local(3));
await novaPage.fill("#counter-end", local(3, 2));
await novaPage.click('[data-community="counter"]');
await novaPage.waitForFunction(() =>
  /counter-proposal/i.test(document.querySelector(".chat-head")?.innerText ?? "")
);
check(
  "a counter-proposal passes the turn",
  (await novaPage.locator('[data-action="accept"]').count()) === 0
);
await novaPage.fill("#message-form input", "Friday is taken, Saturday?");
await novaPage.click('#message-form button[type="submit"]');
await novaPage.waitForSelector(".bubble--me");
check(
  "a message appears in the conversation",
  /Saturday/.test(await novaPage.locator("#messages").innerText())
);

await alphaPage.goto(`${app.baseUrl}/inbox`);
await alphaPage.waitForSelector(".th");
await alphaPage.click(".th");
await alphaPage.waitForSelector('[data-action="accept"]');
check(
  "Alpha sees the other team's message and the new proposal",
  /Saturday/.test(await alphaPage.locator("#messages").innerText())
);
await alphaPage.click('[data-action="accept"]');
await alphaPage.waitForFunction(() =>
  /accepted/i.test(document.querySelector(".chat-head")?.innerText ?? "")
);
check(
  "accepting settles the request",
  (await alphaPage.locator('[data-action="accept"]').count()) === 0
);
await alphaPage.click('[data-community="inbox-tab"][data-tab="notifications"]');
await alphaPage.waitForSelector(".notif");
check(
  "the notifications tab lists what happened",
  (await alphaPage.locator(".notif").count()) >= 1
);

// Agenda: the scrim is there, RSVP, list view, series from the event
await alphaPage.goto(`${app.baseUrl}/agenda`);
await alphaPage.waitForSelector(".wcols");
await alphaPage.click('[data-community="agenda-view"][data-mode="list"]');
await alphaPage.waitForSelector(".lgroup");
check(
  "the accepted scrim is in the agenda",
  /Scrim vs Nova Gaming/.test(await alphaPage.locator("#agenda-main").innerText())
);
await alphaPage.click('#agenda-main [data-community="open-event"]');
await alphaPage.click('[data-community="rsvp"][data-answer="going"]');
await alphaPage.waitForFunction(() =>
  /1 going/.test(document.querySelector("#agenda-day")?.innerText ?? "")
);
check("an RSVP is counted", true);
await alphaPage.click('[data-community="agenda-view"][data-mode="week"]');
await alphaPage.waitForSelector(".wcols");
check("the week view shows seven days", (await alphaPage.locator(".wcols .wcol").count()) === 7);
await alphaPage.click('[data-community="agenda-next"]');
await alphaPage.waitForFunction(() => document.querySelectorAll(".wcols .wcol").length === 7);
check(
  "the week arrows move by a week",
  /–/.test(await alphaPage.locator("#agenda-title").innerText())
);
await alphaPage.click('[data-community="agenda-view"][data-mode="list"]');
await alphaPage.waitForSelector(".lgroup");
await alphaPage.click('#agenda-main [data-community="open-event"]');
await alphaPage.click('[data-community="series-from-event"]');
await alphaPage.waitForSelector("#new-series-form");
check(
  "the new series is pre-filled with both teams",
  (await alphaPage.inputValue("#team-a")) === "Alpha Esports" &&
    (await alphaPage.inputValue("#team-b")) === "Nova Gaming"
);

// Blocking and reporting from the conversation
await novaPage.goto(`${app.baseUrl}/inbox`);
await novaPage.waitForSelector(".th");
await novaPage.click(".th");
await novaPage.waitForSelector('[data-community="report"]');
await novaPage.click('[data-community="report"]');
await novaPage.waitForTimeout(400);
check(
  "a report is sent",
  (await app.store.listReports()).some(report => report.reason === "Spam in the chat")
);

// The administrator reads it and dismisses it
const boss = await app.signIn("Boss", { admin: true });
const adminPage = await open(boss);
await adminPage.goto(`${app.baseUrl}/reports`);
await adminPage.waitForSelector(".report-card");
check(
  "the administrator sees the report with its reason and both teams",
  /Spam in the chat/.test(await adminPage.locator(".report-card").innerText()) &&
    /Alpha Esports/.test(await adminPage.locator(".report-card").innerText())
);
check(
  "the reported conversation is shown",
  (await adminPage.locator("#report-detail .bubble").count()) >= 1
);
await adminPage.click('[data-community="dismiss-report"]');
await adminPage.waitForSelector("#view .empty");
check(
  "dismissing empties the list",
  /No report/.test(await adminPage.locator("#view").innerText())
);
const plainReports = await open(alpha);
await plainReports.goto(`${app.baseUrl}/reports`);
await plainReports.waitForSelector("#view .empty");
check(
  "a plain account is told the page is for administrators",
  /administrators/.test(await plainReports.locator("#view .empty").innerText())
);

// Player page: edit, then read as a visitor
await alphaPage.goto(`${app.baseUrl}/players/${alpha.user.tag}`);
await alphaPage.waitForSelector(".profile-head");
await alphaPage.click('[data-community="edit-profile"]');
await alphaPage.fill("#pr-bio", "Mid laner. Evenings.");
await alphaPage.selectOption("#pr-lane", "Mid Lane");
await alphaPage.check('input[name="languages"][value="fr"]');
await alphaPage.click('#profile-form button[type="submit"]');
await alphaPage.waitForFunction(() =>
  /Evenings/.test(document.querySelector("#view")?.innerText ?? "")
);
await visitor.goto(`${app.baseUrl}/players/${alpha.user.tag}`);
await visitor.waitForSelector(".profile-head");
check(
  "a visitor reads the player page (bio, team, no edit button)",
  /Evenings/.test(await textOf(visitor, "#view")) &&
    /Alpha Esports/.test(await textOf(visitor, "#view")) &&
    (await visitor.locator('[data-community="edit-profile"]').count()) === 0
);
await visitor.goto(`${app.baseUrl}/players/ZZZZZZ`);
await visitor.waitForSelector("#view .empty");
check(
  "an unknown player is said to be unknown",
  /Player not found/.test(await visitor.locator("#view .empty").innerText())
);

// Discord: not configured on this server
await alphaPage.goto(`${app.baseUrl}/discord`);
await alphaPage.waitForSelector("#discord-card");
check(
  "the Discord page says it is not set up, and shows the checklist",
  /not set up/i.test(await alphaPage.locator("#discord-card").innerText()) &&
    (await alphaPage.locator(".step-row").count()) === 4
);
check(
  "the checklist knows the team and the first request are done",
  (await alphaPage.locator(".step-row.done").count()) >= 2
);

// Phone width: the pages stay inside the screen
const phone = await open(alpha, 390);
for (const path of [
  "/find",
  "/inbox",
  "/agenda",
  "/discord",
  `/players/${alpha.user.tag}`,
  "/teams"
]) {
  await phone.goto(`${app.baseUrl}${path}`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(400);
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(`${path} fits a 390 px screen`, overflow <= 1);
}

await browser.close();
await app.close();
for (const problem of problems) {
  console.log("PROBLEM", problem);
}
console.log(problems.length ? `\n${problems.length} problem(s)` : "\ncommunity e2e clean");
process.exit(problems.length ? 1 : 0);
