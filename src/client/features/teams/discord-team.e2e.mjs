// Browser check of the team's Discord card (owner and managers): not configured, then connected
// with a fake Discord: choose the channel, disconnect. And the page of the person: link the account, send oneself a
// test message, and read what Discord answered when it refuses.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const posts = [];
const direct = [];
let refusal = null;
const fake = {
  enabled: true,
  botEnabled: true,
  serverEnabled: true,
  botInstallUrl: state => `https://discord.test/install?state=${state}`,
  getGuild: async id => ({ id, name: "Alpha HQ" }),
  listChannels: async () => [
    { id: "900000000000000001", name: "general" },
    { id: "900000000000000002", name: "scrims" }
  ],
  postMessage: async (channelId, content) => {
    posts.push([channelId, content]);
    return true;
  },
  authorizeUrl: state => `https://discord.test/authorize?state=${state}`,
  exchange: async () => "token",
  fetchUser: async () => ({ discordId: "123456789012345678", username: "karma#1", avatarHash: "" }),
  avatarUrl: () => null,
  sendDirectMessage: async (id, content) => {
    direct.push([id, content]);
    if (refusal) {
      throw Object.assign(new Error("Discord answered 403"), refusal);
    }
    return true;
  }
};
const app = await startTestServer({ discordService: fake });
const owner = await app.signIn("Karma");
const teamId = (
  await owner.browser.post("/api/teams", { name: "Alpha Esports", tag: "ALPH", level: "amateur" })
).body.id;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

await page.goto(`${app.baseUrl}/teams/${teamId}`);
await page.click('[data-team="tab"][data-tab="discord"]');
await page.waitForSelector("#team-discord");
check(
  "a not-yet-connected team offers to add the bot",
  (await page.locator("#team-discord a.discord-button").getAttribute("href")).includes(
    `/auth/discord/bot?team=${teamId}`
  )
);

// The browser would follow Discord's redirects: do the round trip with the server directly, then
// come back to the page
const start = await fetch(`${app.baseUrl}/auth/discord/bot?team=${teamId}`, {
  redirect: "manual",
  headers: { cookie: `hok_session=${owner.browser.jar.get("hok_session")}` }
});
const state = new URL(start.headers.get("location")).searchParams.get("state");
const cookie = start.headers
  .getSetCookie()
  .find(item => item.startsWith("hok_discord_bot="))
  .split(";")[0];
await fetch(`${app.baseUrl}/auth/discord/bot/callback?state=${state}&guild_id=800000000000000001`, {
  redirect: "manual",
  headers: { cookie: `hok_session=${owner.browser.jar.get("hok_session")}; ${cookie}` }
});

await page.goto(`${app.baseUrl}/teams/${teamId}?discord=added`);
await page.waitForSelector("#discord-channel");
check(
  "the server name is shown with the connected pill",
  /Alpha HQ/.test(await page.locator("#team-discord").innerText())
);
check(
  "the channels of the server are offered",
  (await page.locator("#discord-channel option").count()) === 3
);
await page.selectOption("#discord-channel", "900000000000000002");
await page.click('#discord-channel-form button[type="submit"]');
await page.waitForFunction(() =>
  /#scrims/i.test(document.querySelector("#team-discord .serverbox2 small")?.innerText ?? "")
);
check(
  "the chosen channel is shown and a confirmation was posted to it",
  posts.length === 1 && posts[0][0] === "900000000000000002"
);

page.on("dialog", dialog => dialog.accept());
await page.click('[data-team="discord-disconnect"]');
await page.waitForSelector("#team-discord a.discord-button");
check("disconnecting brings back the 'Add the bot' button", true);

// ---- the page of the person: link the account, then "Send me a test message" -------------------------------------
{
  const session = `hok_session=${owner.browser.jar.get("hok_session")}`;
  const begin = await fetch(`${app.baseUrl}/auth/discord`, {
    redirect: "manual",
    headers: { cookie: session }
  });
  const linkState = new URL(begin.headers.get("location")).searchParams.get("state");
  const linkCookie = begin.headers
    .getSetCookie()
    .find(item => item.startsWith("hok_discord_state="))
    .split(";")[0];
  await fetch(`${app.baseUrl}/auth/discord/callback?code=good&state=${linkState}`, {
    redirect: "manual",
    headers: { cookie: `${session}; ${linkCookie}` }
  });
  await page.goto(`${app.baseUrl}/discord`);
  await page.waitForSelector('[data-community="discord-test"]');
  check(
    "a linked account is offered a test message, with what it does under it",
    /one message/i.test(await page.locator("#discord-test-result").innerText())
  );
  await page.click('[data-community="discord-test"]');
  await page.waitForFunction(() =>
    /Test message sent/.test(document.querySelector("#discord-test-result")?.innerText ?? "")
  );
  check(
    "the test message goes to the Discord account that was linked, and the page says so",
    direct.length === 1 &&
      direct[0][0] === "123456789012345678" &&
      /Test message from/.test(direct[0][1])
  );
  refusal = { status: 403, discordCode: 50007 };
  await page.click('[data-community="discord-test"]');
  await page.waitForFunction(() =>
    /share a server with it/.test(document.querySelector("#discord-test-result")?.innerText ?? "")
  );
  check(
    "when Discord refuses (no shared server) the page says what to do, in a warning colour",
    (await page.locator("#discord-test-result.is-bad").count()) === 1 &&
      /Discord card of the team/.test(await page.locator("#discord-test-result").innerText())
  );
  refusal = { status: 401, discordCode: null };
  await page.click('[data-community="discord-test"]');
  await page.waitForFunction(() =>
    /token of the bot/.test(document.querySelector("#discord-test-result")?.innerText ?? "")
  );
  check("a refused token is named", true);
  refusal = null;
  await page.click('[data-community="discord-test"]');
  await page.waitForFunction(() =>
    /Test message sent/.test(document.querySelector("#discord-test-result")?.innerText ?? "")
  );
  check(
    "and it works again once Discord accepts (the warning is gone)",
    (await page.locator("#discord-test-result.is-bad").count()) === 0
  );
}

// A plain player never sees the card
const player = await app.signIn("Player");
await owner.browser.post(`/api/teams/${teamId}/invitations`, {
  tag: player.user.tag,
  role: "player"
});
const [invitation] = (await player.browser.get("/api/me/invitations")).body.items;
await player.browser.post(`/api/invitations/${invitation.id}/accept`);
const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await other.addCookies([
  { name: "hok_session", value: player.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const playerPage = await other.newPage();
await playerPage.goto(`${app.baseUrl}/teams/${teamId}`);
await playerPage.click('[data-team="tab"][data-tab="roster"]');
await playerPage.waitForSelector(".roster-table");
check(
  "a plain player does not see the Discord card",
  (await playerPage.locator("#team-discord").count()) === 0
);

await browser.close();
await app.close();
for (const problem of problems) {
  console.log("PROBLEM", problem);
}
console.log(problems.length ? `\n${problems.length} problem(s)` : "\ndiscord team e2e clean");
process.exit(problems.length ? 1 : 0);
