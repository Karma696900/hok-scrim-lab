// Discord bot: reminders 6 / 4 / 2 hours before, a team's server and channel, the weekly digest,
// signed buttons and slash commands.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { digestWindow, offsetMinutes } from "../community/community-domain.js";
import { createDiscordService, describeNotification, requestButtons } from "./discord-service.js";
import { createNotifier } from "./discord-service.js";
import { runReminders } from "./reminders.js";
import { startTestServer } from "../../../testing/test-app.js";

const HOUR = 3600_000;
const team = (name, tag, overrides = {}) => ({
  name,
  tag,
  level: "amateur",
  region: "EU",
  timezone: "UTC",
  languages: ["en"],
  ...overrides
});

describe("Discord helpers", () => {
  test("time zones and the Monday window", () => {
    assert.equal(offsetMinutes("UTC+2"), 120);
    assert.equal(offsetMinutes("UTC-5"), -300);
    assert.equal(offsetMinutes(""), 0);
    const monday = Date.parse("2026-10-05T09:00:00Z");
    assert.deepEqual(digestWindow(monday, "UTC"), { due: true, key: "2026-10-05" });
    assert.equal(
      digestWindow(Date.parse("2026-10-05T07:59:00Z"), "UTC").due,
      false,
      "not before 08:00"
    );
    assert.equal(
      digestWindow(Date.parse("2026-10-06T09:00:00Z"), "UTC").due,
      false,
      "not on Tuesday"
    );
    assert.equal(
      digestWindow(Date.parse("2026-10-05T06:30:00Z"), "UTC+2").due,
      true,
      "08:30 local in UTC+2"
    );
    assert.equal(
      digestWindow(Date.parse("2026-10-04T23:30:00Z"), "UTC+2").due,
      false,
      "Monday 01:30 local is too early"
    );
  });
  test("a request message carries Accept and Decline (and a link when the site address is known)", () => {
    const id = "16e11da1-7c03-422a-b39e-69742cd5f4c6";
    assert.deepEqual(
      requestButtons(id)[0].components.map(button => button.custom_id),
      [`rq:accept:${id}`, `rq:decline:${id}`]
    );
    assert.equal(
      requestButtons(id, "https://hok.example")[0].components[2].url,
      `https://hok.example/inbox?open=${id}`
    );
    assert.match(
      describeNotification("reminder", {
        title: "Scrim",
        team: "Alpha",
        startsAt: Date.UTC(2026, 9, 2, 20),
        hours: 4
      }),
      /in about 4 h/
    );
  });
  test("an interaction is accepted only with a valid signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const hex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
    const service = createDiscordService({
      discord: { botToken: "t", clientId: "1", publicKey: hex }
    });
    const body = Buffer.from('{"type":1}');
    const signature = sign(
      null,
      Buffer.concat([Buffer.from("1700000000"), body]),
      privateKey
    ).toString("hex");
    assert.equal(service.verifyInteraction(body, signature, "1700000000"), true);
    assert.equal(
      service.verifyInteraction(Buffer.from('{"type":2}'), signature, "1700000000"),
      false,
      "the body changed"
    );
    assert.equal(
      service.verifyInteraction(body, signature, "1700000001"),
      false,
      "the timestamp changed"
    );
    assert.equal(service.verifyInteraction(body, "zz", "1700000000"), false);
    assert.equal(
      createDiscordService({ discord: {} }).verifyInteraction(body, signature, "1700000000"),
      false,
      "off without a key"
    );
  });
  test("the bot install link asks for the two permissions only and carries the state", () => {
    const service = createDiscordService({
      discord: {
        botToken: "t",
        clientId: "42",
        botRedirectUri: "https://x.test/auth/discord/bot/callback"
      }
    });
    const url = new URL(service.botInstallUrl("abc"));
    assert.deepEqual(
      [
        url.searchParams.get("permissions"),
        url.searchParams.get("state"),
        url.searchParams.get("client_id")
      ],
      ["18432", "abc", "42"]
    );
    assert.match(url.searchParams.get("scope"), /bot/);
  });
});

describe("reminders 6, 4 and 2 hours before", () => {
  let app, owner, member, quiet, teamId;
  const sent = [];
  const fake = {
    enabled: true,
    botEnabled: true,
    serverEnabled: true,
    sendDirectMessage: async (id, text) => sent.push([id, text])
  };
  before(async () => {
    app = await startTestServer({ discordService: fake });
    [owner, member, quiet] = await Promise.all(
      ["Owner", "Member", "Quiet"].map(name => app.signIn(name))
    );
    teamId = (await owner.browser.post("/api/teams", team("Alpha Esports", "ALPH"))).body.id;
    for (const user of [member, quiet]) {
      await owner.browser.post(`/api/teams/${teamId}/invitations`, {
        tag: user.user.tag,
        role: "player"
      });
      const [invitation] = (await user.browser.get("/api/me/invitations")).body.items;
      await user.browser.post(`/api/invitations/${invitation.id}/accept`);
    }
  });
  after(() => app.close());
  const reminders = async user =>
    (await user.browser.get("/api/notifications")).body.items.filter(
      item => item.kind === "reminder"
    );
  const create = async (startsAt, extra = {}) =>
    (
      await owner.browser.post(`/api/teams/${teamId}/events`, {
        kind: "scrim",
        title: "Scrim vs Nova",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(startsAt + 2 * HOUR).toISOString(),
        ...extra
      })
    ).body.id;
  const tell = notifications =>
    runReminders({ store: app.store, notifier: null, now: notifications });

  test("one reminder at each step, never twice, and not for those who said no", async () => {
    const start = Date.now() + 10 * HOUR;
    const id = await create(start);
    await quiet.browser.post(`/api/events/${id}/rsvp`, { answer: "no" });
    assert.equal(await tell(start - 7 * HOUR), 0, "nothing at 7 h");
    assert.equal(
      await tell(start - 5.5 * HOUR),
      2,
      "6 h: owner and member (the one who said no is skipped)"
    );
    assert.equal(await tell(start - 5 * HOUR), 0, "not again at 5 h");
    assert.equal(await tell(start - 3.9 * HOUR), 2, "4 h");
    assert.equal(await tell(start - 3 * HOUR), 0);
    assert.equal(await tell(start - 1.9 * HOUR), 2, "2 h");
    assert.equal(await tell(start - 1 * HOUR), 0, "nothing more");
    assert.deepEqual((await reminders(member)).map(item => item.payload.hours).sort(), [2, 4, 6]);
    assert.equal((await reminders(quiet)).length, 0);
  });

  test("an event created late only gets the reminder that still makes sense", async () => {
    const start = Date.now() + 30 * HOUR;
    await create(start, { title: "Late addition" });
    assert.equal(
      await tell(start - 3 * HOUR),
      3,
      "3 h left: one reminder (the 4 h one), the 6 h one is not sent late"
    );
    const hours = (await reminders(member))
      .filter(item => item.payload.title === "Late addition")
      .map(item => item.payload.hours);
    assert.deepEqual(hours, [4]);
    assert.equal(await tell(start - 1.5 * HOUR), 3, "and the 2 h one still comes");
  });

  test("availability windows and past events are never announced", async () => {
    const start = Date.now() + 50 * HOUR;
    await create(start, { kind: "availability", title: "" });
    assert.equal(await tell(start - 1 * HOUR), 0);
    assert.equal(await tell(start + 1 * HOUR), 0, "an event that already started");
  });

  test("a member who linked Discord gets the direct message, the others only the site", async () => {
    await app.store.linkDiscord(member.user.id, {
      discordId: "111111111111111111",
      username: "m",
      avatarHash: ""
    });
    const start = Date.now() + 40 * HOUR;
    await create(start, { title: "Discord reminder" });
    const notifier = createNotifier({
      store: app.store,
      discord: fake,
      config: { appOrigin: "" },
      logger: null
    });
    const { notifications } = await app.store.dueReminders(start - 5.5 * HOUR);
    notifier.send(notifications);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(
      sent.map(item => item[0]),
      ["111111111111111111"]
    );
    assert.match(sent[0][1], /Discord reminder/);
  });
});

describe("a team's Discord server and channel", () => {
  let app, owner, manager, player, teamId;
  const posts = [];
  const channels = [
    { id: "900000000000000001", name: "general", type: 0, position: 1 },
    { id: "900000000000000002", name: "scrims", type: 0, position: 0 },
    { id: "900000000000000003", name: "Voice", type: 2, position: 2 }
  ];
  let botInServer = true;
  const fake = {
    enabled: true,
    botEnabled: true,
    serverEnabled: true,
    botInstallUrl: state => `https://discord.test/install?state=${state}`,
    getGuild: async id => {
      if (!botInServer) {
        throw new Error("Unknown guild");
      }
      return { id, name: "Alpha HQ" };
    },
    listChannels: async () =>
      channels
        .filter(channel => channel.type === 0)
        .sort((left, right) => left.position - right.position)
        .map(channel => ({ id: channel.id, name: channel.name })),
    postMessage: async (channelId, content) => {
      posts.push([channelId, content]);
      return true;
    },
    sendDirectMessage: async () => true
  };
  const cookieOf = user => `hok_session=${user.browser.jar.get("hok_session")}`;
  const get = (path, user, extra = "") =>
    fetch(`${app.baseUrl}${path}`, {
      redirect: "manual",
      headers: { cookie: [user ? cookieOf(user) : "", extra].filter(Boolean).join("; ") }
    });
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));

  before(async () => {
    app = await startTestServer({ discordService: fake });
    [owner, manager, player] = await Promise.all(
      ["Owner", "Manager", "Player"].map(name => app.signIn(name))
    );
    teamId = (await owner.browser.post("/api/teams", team("Alpha Esports", "ALPH"))).body.id;
    for (const [user, role] of [
      [manager, "manager"],
      [player, "player"]
    ]) {
      await owner.browser.post(`/api/teams/${teamId}/invitations`, { tag: user.user.tag, role });
      const [invitation] = (await user.browser.get("/api/me/invitations")).body.items;
      await user.browser.post(`/api/invitations/${invitation.id}/accept`);
    }
  });
  after(() => app.close());

  const addBot = async (user, guild = "800000000000000001", forgeState = false) => {
    const start = await get(`/auth/discord/bot?team=${teamId}`, user);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const cookie = start.headers
      .getSetCookie()
      .find(item => item.startsWith("hok_discord_bot="))
      .split(";")[0];
    return get(
      `/auth/discord/bot/callback?state=${forgeState ? "forged" : state}&guild_id=${guild}`,
      user,
      cookie
    );
  };

  test("only the owner and the managers can connect a server; a visitor and a player are turned away", async () => {
    assert.equal(
      (await get(`/auth/discord/bot?team=${teamId}`, null)).headers.get("location"),
      "/login?next=%2Fteams"
    );
    assert.equal(
      (await get(`/auth/discord/bot?team=${teamId}`, player)).headers.get("location"),
      "/teams"
    );
    assert.equal((await player.browser.get(`/api/teams/${teamId}/discord`)).status, 403);
    assert.equal((await app.browser().get(`/api/teams/${teamId}/discord`)).status, 401);
  });

  test("adding the bot: a forged answer is refused, a server where the bot is not is refused, the real one is saved", async () => {
    assert.match(
      (await addBot(manager, "800000000000000001", true)).headers.get("location"),
      /discord=error/
    );
    botInServer = false;
    assert.match((await addBot(manager)).headers.get("location"), /discord=error/);
    assert.equal((await manager.browser.get(`/api/teams/${teamId}/discord`)).body.connected, false);
    botInServer = true;
    assert.match((await addBot(manager, "not-a-number")).headers.get("location"), /discord=error/);
    assert.match((await addBot(manager)).headers.get("location"), /discord=added/);
    const state = (await manager.browser.get(`/api/teams/${teamId}/discord`)).body;
    assert.deepEqual(
      [
        state.connected,
        state.guildName,
        state.channelId,
        state.channels.map(channel => channel.name)
      ],
      [true, "Alpha HQ", null, ["scrims", "general"]],
      "text channels only, in server order"
    );
  });

  test("the channel is chosen from the server's own list, announced once, and used for reminders and confirmed scrims", async () => {
    assert.equal(
      (
        await player.browser.put(`/api/teams/${teamId}/discord/channel`, {
          channelId: "900000000000000002"
        })
      ).status,
      403
    );
    assert.equal(
      (
        await manager.browser.put(`/api/teams/${teamId}/discord/channel`, {
          channelId: "900000000000000003"
        })
      ).status,
      404,
      "a voice channel is not on the list"
    );
    assert.equal(
      (await manager.browser.put(`/api/teams/${teamId}/discord/channel`, { channelId: "abc" }))
        .status,
      400
    );
    posts.length = 0;
    const saved = await manager.browser.put(`/api/teams/${teamId}/discord/channel`, {
      channelId: "900000000000000002"
    });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.body.channelName, posts.length], ["scrims", 1]);
    assert.match(posts[0][1], /Alpha Esports.*connected/);

    // a reminder reaches the channel. The moment is fixed, on a Wednesday: with the real clock, a run
    // on a Sunday evening or on a Monday would make the Monday digest due and add a second message.
    posts.length = 0;
    const now = Date.parse("2026-10-07T12:00:00Z");
    const start = now + 5.5 * HOUR;
    await owner.browser.post(`/api/teams/${teamId}/events`, {
      kind: "scrim",
      title: "Scrim vs Nova",
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 2 * HOUR).toISOString()
    });
    const notifier = createNotifier({ store: app.store, discord: fake, config: {}, logger: null });
    await runReminders({ store: app.store, notifier, now });
    await settle();
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0][0], "900000000000000002");
    assert.match(posts[0][1], /Scrim vs Nova.*in about 6 h/);
  });

  test("the weekly digest: Monday morning in the team's zone, once, only when something is planned", async () => {
    const monday = Date.parse("2026-10-05T09:00:00Z");
    const notifier = createNotifier({ store: app.store, discord: fake, config: {}, logger: null });
    await owner.browser.post(`/api/teams/${teamId}/events`, {
      kind: "tournament",
      title: "Open Cup R2",
      startsAt: "2026-10-07T18:00:00Z",
      endsAt: "2026-10-07T20:00:00Z"
    });
    await owner.browser.post(`/api/teams/${teamId}/events`, {
      kind: "availability",
      title: "",
      startsAt: "2026-10-08T18:00:00Z",
      endsAt: "2026-10-08T20:00:00Z"
    });
    posts.length = 0;
    await runReminders({ store: app.store, notifier, now: Date.parse("2026-10-04T09:00:00Z") });
    assert.equal(posts.length, 0, "Sunday: no digest");
    await runReminders({ store: app.store, notifier, now: monday });
    await settle();
    const digest = posts.filter(post => /this week/.test(post[1]));
    assert.equal(digest.length, 1);
    assert.match(digest[0][1], /Open Cup R2/);
    assert.doesNotMatch(
      digest[0][1],
      /Available/,
      "availability windows are not part of the digest"
    );
    await runReminders({ store: app.store, notifier, now: monday + 2 * HOUR });
    assert.equal(posts.filter(post => /this week/.test(post[1])).length, 1, "once per Monday");
  });

  test("a confirmed scrim is announced in the channel of each team that has one", async () => {
    const other = await app.signIn("Other");
    const otherId = (await other.browser.post("/api/teams", team("Nova Gaming", "NOVA"))).body.id;
    const start = Date.now() + 5 * 24 * HOUR;
    const request = (
      await owner.browser.post("/api/requests", {
        fromTeamId: teamId,
        toTeamId: otherId,
        format: 3,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + 2 * HOUR).toISOString()
      })
    ).body.id;
    posts.length = 0;
    assert.equal((await other.browser.post(`/api/requests/${request}/accept`)).status, 200);
    await settle();
    assert.equal(posts.length, 1, "only Alpha has a channel");
    assert.match(posts[0][1], /Scrim confirmed: \*\*Alpha Esports\*\* vs \*\*Nova Gaming\*\*/);
  });

  test("disconnecting forgets the server; another server resets the channel", async () => {
    assert.match(
      (await addBot(owner, "800000000000000009")).headers.get("location"),
      /discord=added/
    );
    assert.equal(
      (await owner.browser.get(`/api/teams/${teamId}/discord`)).body.channelId,
      null,
      "a new server has no channel yet"
    );
    assert.equal((await player.browser.delete(`/api/teams/${teamId}/discord`)).status, 403);
    assert.equal(
      (await manager.browser.delete(`/api/teams/${teamId}/discord`)).body.connected,
      false
    );
  });
});

describe("buttons and slash commands (signed interactions)", () => {
  let app, alpha, nova, outsider, alphaTeam, novaTeam, privateKey, requestId;
  const dms = [];
  const posts = [];
  before(async () => {
    const keys = generateKeyPairSync("ed25519");
    privateKey = keys.privateKey;
    const publicKey = keys.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex");
    const fetchStub = async url => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "channel" }),
      url
    });
    const service = createDiscordService(
      { discord: { botToken: "token", clientId: "1", publicKey } },
      fetchStub
    );
    service.sendDirectMessage = async (id, text, components) => dms.push([id, text, components]);
    service.postMessage = async (channelId, text) => posts.push([channelId, text]);
    app = await startTestServer({ discordService: service });
    [alpha, nova, outsider] = await Promise.all(
      ["Alpha", "Nova", "Outsider"].map(name => app.signIn(name))
    );
    alphaTeam = (await alpha.browser.post("/api/teams", team("Alpha Esports", "ALPH"))).body.id;
    novaTeam = (await nova.browser.post("/api/teams", team("Nova Gaming", "NOVA"))).body.id;
    await app.store.linkDiscord(alpha.user.id, {
      discordId: "222222222222222222",
      username: "alpha",
      avatarHash: ""
    });
    await app.store.linkDiscord(nova.user.id, {
      discordId: "333333333333333333",
      username: "nova",
      avatarHash: ""
    });
    const start = Date.now() + 3 * 24 * HOUR;
    requestId = (
      await alpha.browser.post("/api/requests", {
        fromTeamId: alphaTeam,
        toTeamId: novaTeam,
        format: 3,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + 2 * HOUR).toISOString()
      })
    ).body.id;
  });
  after(() => app.close());

  const post = (body, { valid = true } = {}) => {
    const raw = Buffer.from(JSON.stringify(body));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.concat([Buffer.from(timestamp), raw]), privateKey).toString(
      "hex"
    );
    return fetch(`${app.baseUrl}/discord/interactions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": valid ? signature : "00".repeat(64),
        "x-signature-timestamp": timestamp
      },
      body: raw
    });
  };
  const button = (discordId, customId) => ({
    type: 3,
    user: { id: discordId },
    data: { custom_id: customId }
  });
  const command = (discordId, name) => ({ type: 2, user: { id: discordId }, data: { name } });

  test("a request sent from the site reaches the other team's staff in Discord with its buttons", async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(dms.length, 1);
    assert.equal(dms[0][0], "333333333333333333");
    assert.deepEqual(
      dms[0][2][0].components.map(item => item.custom_id),
      [`rq:accept:${requestId}`, `rq:decline:${requestId}`]
    );
  });

  test("an unsigned or wrongly signed call is refused; Discord's ping is answered", async () => {
    assert.equal((await post({ type: 1 }, { valid: false })).status, 401);
    assert.equal(
      (
        await fetch(`${app.baseUrl}/discord/interactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        })
      ).status,
      401
    );
    const ping = await post({ type: 1 });
    assert.deepEqual(await ping.json(), { type: 1 });
  });

  test("slash commands: /requests lists what waits, /agenda lists what is planned, an unlinked person is told to link", async () => {
    const waiting = await (await post(command("333333333333333333", "requests"))).json();
    assert.match(waiting.data.content, /Alpha Esports/);
    assert.equal(waiting.data.flags, 64, "only the person sees the answer");
    assert.match(
      (await (await post(command("222222222222222222", "requests"))).json()).data.content,
      /No scrim request is waiting/,
      "the sender has nothing to answer"
    );
    assert.match(
      (await (await post(command("999999999999999999", "agenda"))).json()).data.content,
      /Link your Discord account/
    );
    assert.match(
      (await (await post(command("222222222222222222", "agenda"))).json()).data.content,
      /Nothing planned/
    );
  });

  test("the buttons follow the same rules as the site: the sender cannot answer its own request, the other staff can", async () => {
    const own = await (await post(button("222222222222222222", `rq:accept:${requestId}`))).json();
    assert.match(own.data.content, /not your team's turn/);
    assert.equal(own.data.flags, 64);
    const bogus = await (await post(button("333333333333333333", "rq:accept:not-an-id"))).json();
    assert.match(bogus.data.content, /not valid/);
    posts.length = 0;
    const accepted = await (
      await post(button("333333333333333333", `rq:accept:${requestId}`))
    ).json();
    assert.equal(accepted.type, 7, "the message is updated in place");
    assert.match(accepted.data.content, /accepted/);
    assert.deepEqual(accepted.data.components, [], "the buttons are gone");
    assert.equal((await alpha.browser.get(`/api/requests/${requestId}`)).body.status, "accepted");
    const events = (await alpha.browser.get(`/api/teams/${alphaTeam}/events`)).body.items;
    assert.ok(
      events.some(event => event.title === "Scrim vs Nova Gaming"),
      "the scrim is in the agenda"
    );
    const again = await (await post(button("333333333333333333", `rq:accept:${requestId}`))).json();
    assert.match(again.data.content, /already settled/);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(
      dms.some(
        item => /accepted the scrim request/.test(item[1]) && item[0] === "222222222222222222"
      ),
      "the other team is told in Discord"
    );
    assert.match(
      (await (await post(command("222222222222222222", "agenda"))).json()).data.content,
      /Scrim vs Nova Gaming/
    );
  });

  test("a person outside both teams cannot answer through Discord", async () => {
    await app.store.linkDiscord(outsider.user.id, {
      discordId: "444444444444444444",
      username: "o",
      avatarHash: ""
    });
    const start = Date.now() + 6 * 24 * HOUR;
    const fresh = (
      await alpha.browser.post("/api/requests", {
        fromTeamId: alphaTeam,
        toTeamId: novaTeam,
        format: 1,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + HOUR).toISOString()
      })
    ).body.id;
    const answer = await (await post(button("444444444444444444", `rq:decline:${fresh}`))).json();
    assert.equal(answer.data.flags, 64);
    assert.equal(
      (await alpha.browser.get(`/api/requests/${fresh}`)).body.status,
      "pending",
      "nothing changed"
    );
  });
});
