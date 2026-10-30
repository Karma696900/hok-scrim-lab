// Community: announcements, requests between teams (accept / counter / decline / cancel), the
// conversation, notifications, RSVPs, reminders, the calendar file, public player profiles, Discord
// (link, preferences, direct messages with a fake Discord).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  parseCounter,
  parseDiscordPrefs,
  parseMessage,
  parsePost,
  parseProfile,
  parseRequest,
  parseReport,
  parseRsvp,
  toIcs
} from "./community-domain.js";
import {
  createDiscordService,
  createNotifier,
  describeNotification,
  whyNotSent
} from "../discord/discord-service.js";
import { runReminders } from "../discord/reminders.js";
import { startTestServer } from "../../../testing/test-app.js";

const HOUR = 3600_000;
const inDays = days => Date.now() + days * 24 * HOUR;
const uuid = "16e11da1-7c03-422a-b39e-69742cd5f4c6";
const rejects = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);
const team = (name, tag, overrides = {}) => ({
  name,
  tag,
  level: "amateur",
  region: "EU",
  timezone: "UTC+1",
  languages: ["en"],
  ...overrides
});

describe("community validation", () => {
  test("an announcement and a request", () => {
    const post = parsePost({
      teamId: uuid,
      startsAt: inDays(1),
      endsAt: inDays(1) + 3 * HOUR,
      format: 3,
      note: " Mid focus "
    });
    assert.equal(post.note, "Mid focus");
    assert.equal(post.heroRule, "global-ban-pick");
    assert.equal(post.control, "online");
    rejects(() =>
      parsePost({ teamId: uuid, startsAt: inDays(1), endsAt: inDays(1) + HOUR, format: 4 })
    );
    rejects(() => parsePost({ teamId: uuid, startsAt: inDays(1), endsAt: inDays(20), format: 3 }));
    rejects(
      () => parsePost({ teamId: "x", startsAt: inDays(1), endsAt: inDays(1) + HOUR, format: 3 }),
      "invalid_id"
    );
    rejects(() => parsePost({ teamId: uuid, startsAt: inDays(-3), endsAt: inDays(-2), format: 3 }));
    const request = parseRequest({
      fromTeamId: uuid,
      toTeamId: "26e11da1-7c03-422a-b39e-69742cd5f4c6",
      startsAt: new Date(inDays(1)).toISOString(),
      endsAt: new Date(inDays(1) + 2 * HOUR).toISOString(),
      format: "5",
      heroRule: "free-for-all",
      control: "external"
    });
    assert.deepEqual(
      [request.format, request.heroRule, request.control, request.postId],
      [5, "free-for-all", "external", null]
    );
    rejects(() =>
      parseRequest({
        fromTeamId: uuid,
        toTeamId: uuid,
        startsAt: inDays(1),
        endsAt: inDays(1) + HOUR,
        format: 3
      })
    );
    rejects(() =>
      parseRequest({
        fromTeamId: uuid,
        toTeamId: "26e11da1-7c03-422a-b39e-69742cd5f4c6",
        startsAt: inDays(1),
        endsAt: inDays(1) + 20 * HOUR,
        format: 3
      })
    );
  });
  test("messages, counters, answers, reports", () => {
    assert.equal(parseMessage({ text: "  hi  " }), "hi");
    rejects(() => parseMessage({ text: "" }));
    rejects(() => parseMessage({ text: "x".repeat(601) }));
    assert.equal(parseCounter({ startsAt: inDays(2), endsAt: inDays(2) + HOUR }).note, "");
    assert.equal(parseRsvp({ answer: "maybe" }), "maybe");
    rejects(() => parseRsvp({ answer: "perhaps" }));
    rejects(() => parseReport({ reason: "x" }));
  });
  test("a player profile: at most 3 heroes, 5 languages", () => {
    assert.deepEqual(
      parseProfile({
        bio: "Mid laner",
        lane: "Mid Lane",
        timezone: "UTC+2",
        languages: ["en", "fr"],
        mainHeroes: ["533", "505"]
      }).mainHeroes,
      ["533", "505"]
    );
    rejects(() => parseProfile({ mainHeroes: ["1", "2", "3", "4"] }));
    rejects(() => parseProfile({ mainHeroes: ["1", "1"] }));
    rejects(() => parseProfile({ languages: ["xx"] }));
    rejects(() => parseProfile({ lane: "Top" }));
  });
  test("Discord preferences are booleans", () => {
    assert.deepEqual(parseDiscordPrefs({ requests: false }), {
      requests: false,
      reminders: true,
      results: true
    });
    rejects(() => parseDiscordPrefs({ requests: "yes" }));
  });
  test("the calendar file escapes text and keeps UTC times", () => {
    const text = toIcs(
      [
        {
          id: "e1",
          title: "Scrim; vs, Nova",
          startsAt: Date.UTC(2026, 9, 2, 20),
          endsAt: Date.UTC(2026, 9, 2, 22),
          note: "a\nb"
        }
      ],
      "Alpha",
      Date.UTC(2026, 9, 1)
    );
    assert.match(text, /DTSTART:20261002T200000Z/);
    assert.match(text, /SUMMARY:Scrim\\; vs\\, Nova/);
    assert.match(text, /DESCRIPTION:a\\nb/);
    assert.ok(text.endsWith("END:VCALENDAR\r\n"));
  });
});

describe("community API", () => {
  let app, alpha, nova, fox, coach, player, stranger, alphaId, novaId, foxId;
  const sent = [];
  const fakeDiscord = {
    enabled: true,
    botEnabled: true,
    authorizeUrl: state => `https://discord.test/authorize?state=${state}`,
    exchange: async code => {
      if (code !== "good") {
        throw new Error("bad code");
      }
      return "token";
    },
    fetchUser: async () => ({
      discordId: "123456789012345678",
      username: "karma#1",
      avatarHash: "abc"
    }),
    avatarUrl: (id, hash) => `https://cdn.test/${id}/${hash}.png`,
    sendDirectMessage: async (id, text) => {
      sent.push([id, text]);
      return true;
    }
  };
  const slot = (days = 2, hours = 2) => ({
    startsAt: inDays(days),
    endsAt: inDays(days) + hours * HOUR
  });
  const ask = (from, to, overrides = {}) =>
    alpha.browser.post("/api/requests", {
      fromTeamId: from,
      toTeamId: to,
      format: 3,
      heroRule: "global-ban-pick",
      control: "online",
      note: "Hi",
      ...slot(),
      ...overrides
    });
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));

  before(async () => {
    app = await startTestServer({ discordService: fakeDiscord });
    [alpha, nova, fox, coach, player, stranger] = await Promise.all(
      ["Alpha", "Nova", "Fox", "Coach", "Player", "Stranger"].map(name => app.signIn(name))
    );
    alphaId = (await alpha.browser.post("/api/teams", team("Alpha Esports", "ALPH"))).body.id;
    novaId = (await nova.browser.post("/api/teams", team("Nova Gaming", "NOVA", { level: "pro" })))
      .body.id;
    foxId = (await fox.browser.post("/api/teams", team("Crimson Fox", "FOX"))).body.id;
    for (const [user, role] of [
      [coach, "coach"],
      [player, "player"]
    ]) {
      await alpha.browser.post(`/api/teams/${alphaId}/invitations`, { tag: user.user.tag, role });
      const [invitation] = (await user.browser.get("/api/me/invitations")).body.items;
      await user.browser.post(`/api/invitations/${invitation.id}/accept`);
    }
  });
  after(() => app.close());

  test("an invitation is also a notification", async () => {
    const list = (await coach.browser.get("/api/notifications")).body.items;
    assert.equal(list[0].kind, "invitation");
    assert.equal(list[0].payload.team, "Alpha Esports");
    assert.equal((await coach.browser.get("/api/community/summary")).body.unreadNotifications, 1);
    assert.equal((await coach.browser.post("/api/notifications/read", {})).status, 200);
    assert.equal((await coach.browser.get("/api/community/summary")).body.unreadNotifications, 0);
  });

  test("announcements: staff post, anybody reads and filters, only staff close", async () => {
    assert.equal(
      (await player.browser.post("/api/scrim-posts", { teamId: alphaId, format: 3, ...slot(1, 3) }))
        .status,
      403
    );
    assert.equal(
      (await app.browser().post("/api/scrim-posts", { teamId: alphaId, format: 3, ...slot(1, 3) }))
        .status,
      401
    );
    const created = await nova.browser.post("/api/scrim-posts", {
      teamId: novaId,
      format: 5,
      heroRule: "free-for-all",
      control: "external",
      note: "Pro-level only",
      ...slot(1, 4)
    });
    assert.equal(created.status, 201);
    await fox.browser.post("/api/scrim-posts", { teamId: foxId, format: 3, ...slot(2, 2) });
    const all = (await app.browser().get("/api/scrim-posts")).body;
    assert.equal(all.total, 2);
    assert.equal(all.items[0].team.name, "Crimson Fox", "newest first");
    assert.equal(
      (await app.browser().get("/api/scrim-posts?level=pro")).body.items[0].team.name,
      "Nova Gaming"
    );
    assert.equal(
      (await app.browser().get("/api/scrim-posts?format=5&rule=free-for-all&control=external")).body
        .total,
      1
    );
    assert.equal((await app.browser().get("/api/scrim-posts?minHours=3")).body.total, 1);
    assert.equal(
      (await app.browser().get(`/api/scrim-posts?from=${inDays(10)}&to=${inDays(11)}`)).body.total,
      0
    );
    assert.equal((await app.browser().get("/api/scrim-posts?format=9")).body.total, 0);
    assert.deepEqual(
      (await nova.browser.get("/api/scrim-posts?mine=1")).body.items.map(item => item.team.name),
      ["Nova Gaming"],
      "mine: the announcements of the teams the viewer is staff of"
    );
    assert.equal((await player.browser.get("/api/scrim-posts?mine=1")).body.total, 0);
    assert.equal((await app.browser().get("/api/scrim-posts?mine=1")).status, 401);
    assert.equal((await fox.browser.delete(`/api/scrim-posts/${created.body.id}`)).status, 403);
    assert.equal((await nova.browser.delete(`/api/scrim-posts/${created.body.id}`)).status, 200);
    assert.equal((await app.browser().get("/api/scrim-posts")).body.total, 1);
  });

  test("a request: only staff of the sender ask; the other staff are notified and answer in turn", async () => {
    assert.equal(
      (
        await player.browser.post("/api/requests", {
          fromTeamId: alphaId,
          toTeamId: novaId,
          format: 3,
          ...slot()
        })
      ).status,
      403
    );
    assert.equal(
      (
        await stranger.browser.post("/api/requests", {
          fromTeamId: alphaId,
          toTeamId: novaId,
          format: 3,
          ...slot()
        })
      ).status,
      403
    );
    sent.length = 0;
    await nova.browser.put("/api/me/discord/prefs", {}); // not linked yet: nothing to save
    const firstSlot = slot();
    const created = await ask(alphaId, novaId, firstSlot);
    assert.equal(created.status, 201);
    const requestId = created.body.id;
    assert.equal(
      (await ask(alphaId, novaId, { startsAt: firstSlot.startsAt, endsAt: firstSlot.endsAt }))
        .status,
      409,
      "the same request twice"
    );
    assert.equal((await nova.browser.get("/api/community/summary")).body.awaitingRequests, 1);
    assert.equal((await nova.browser.get("/api/notifications")).body.items[0].kind, "request");
    // the sender cannot answer its own request, a stranger cannot even see it
    assert.equal((await alpha.browser.post(`/api/requests/${requestId}/accept`)).status, 403);
    assert.equal((await stranger.browser.get(`/api/requests/${requestId}`)).status, 404);
    assert.equal((await fox.browser.post(`/api/requests/${requestId}/accept`)).status, 404);
    const seen = (await nova.browser.get(`/api/requests/${requestId}`)).body;
    assert.deepEqual(
      [seen.status, seen.awaitingMe, seen.mySide, seen.from.name],
      ["pending", true, "to", "Alpha Esports"]
    );
    assert.equal((await alpha.browser.get(`/api/requests/${requestId}`)).body.awaitingMe, false);
    assert.equal((await alpha.browser.get("/api/requests")).body.items.length, 1);

    // a counter-proposal passes the turn
    const counterSlot = slot(3, 2);
    assert.equal(
      (await nova.browser.post(`/api/requests/${requestId}/counter`, counterSlot)).status,
      200
    );
    assert.equal(
      (await nova.browser.post(`/api/requests/${requestId}/accept`)).status,
      403,
      "now it is Alpha's turn"
    );
    const back = (await alpha.browser.get(`/api/requests/${requestId}`)).body;
    assert.deepEqual(
      [back.status, back.awaitingMe, back.startsAt],
      ["countered", true, Math.round(counterSlot.startsAt)]
    );
    assert.equal(
      (await alpha.browser.get("/api/notifications")).body.items[0].payload.action,
      "counter"
    );

    // the conversation
    assert.equal(
      (await alpha.browser.post(`/api/requests/${requestId}/messages`, { text: "Works for us" }))
        .status,
      201
    );
    assert.equal(
      (await stranger.browser.post(`/api/requests/${requestId}/messages`, { text: "hello" }))
        .status,
      404
    );
    assert.equal(
      (await alpha.browser.post(`/api/requests/${requestId}/messages`, { text: "" })).status,
      400
    );
    assert.equal(
      (await nova.browser.get(`/api/requests/${requestId}`)).body.messages
        .map(message => message.kind)
        .join(","),
      "counter,text"
    );

    // accepting puts the scrim in both agendas
    assert.equal((await alpha.browser.post(`/api/requests/${requestId}/accept`)).status, 200);
    assert.equal(
      (await alpha.browser.post(`/api/requests/${requestId}/accept`)).status,
      409,
      "already settled"
    );
    for (const [user, id, opponent] of [
      [alpha, alphaId, "Nova Gaming"],
      [nova, novaId, "Alpha Esports"]
    ]) {
      const events = (await user.browser.get(`/api/teams/${id}/events`)).body.items;
      assert.ok(
        events.some(
          event =>
            event.kind === "scrim" &&
            event.title === `Scrim vs ${opponent}` &&
            event.startsAt === Math.round(counterSlot.startsAt)
        ),
        `${id} has the scrim`
      );
    }
    assert.deepEqual(
      (await nova.browser.get("/api/notifications")).body.items.slice(0, 2).map(item => item.kind),
      ["answer", "message"]
    );
    assert.equal((await nova.browser.get("/api/community/summary")).body.awaitingRequests, 0);
  });

  test("decline, cancel, the daily limit, blocking, reporting", async () => {
    const declined = (await ask(alphaId, foxId, slot(4))).body.id;
    assert.equal((await fox.browser.post(`/api/requests/${declined}/decline`)).status, 200);
    assert.equal((await alpha.browser.get(`/api/requests/${declined}`)).body.status, "declined");
    const cancelled = (await ask(alphaId, foxId, slot(5))).body.id;
    assert.equal(
      (await fox.browser.post(`/api/requests/${cancelled}/cancel`)).status,
      403,
      "only the proposer cancels"
    );
    assert.equal((await alpha.browser.post(`/api/requests/${cancelled}/cancel`)).status, 200);
    assert.equal(
      (await alpha.browser.post(`/api/requests/${cancelled}/messages`, { text: "x" })).status,
      409,
      "a cancelled request is closed"
    );
    assert.equal(
      (await fox.browser.post(`/api/requests/${cancelled}/report`, { reason: "No-show last time" }))
        .status,
      200
    );
    assert.equal(
      (await fox.browser.post(`/api/requests/${cancelled}/report`, { reason: "x" })).status,
      400
    );
    assert.equal(
      (
        await stranger.browser.post(`/api/requests/${cancelled}/report`, {
          reason: "I was not there"
        })
      ).status,
      404
    );
    // the limit is five per team and day (three already sent: Nova, Fox, Fox)
    assert.equal((await ask(alphaId, foxId, slot(6))).status, 201);
    assert.equal((await ask(alphaId, foxId, slot(7))).status, 201);
    const limited = await ask(alphaId, foxId, slot(8));
    assert.equal(limited.status, 409);
    assert.equal(limited.body.code, "request_limit");
    // blocking
    assert.equal(
      (await player.browser.post(`/api/teams/${foxId}/blocks`, { teamId: alphaId })).status,
      403
    );
    assert.equal(
      (await fox.browser.post(`/api/teams/${foxId}/blocks`, { teamId: alphaId })).status,
      200
    );
    assert.equal((await ask(alphaId, foxId, slot(9))).status, 403);
    assert.equal((await alpha.browser.get("/api/admin/reports")).status, 403);
    const admin = await app.signIn("Admin", { admin: true });
    const report = (await admin.browser.get("/api/admin/reports")).body.items[0];
    assert.equal(report.reason, "No-show last time");
    assert.deepEqual(
      [report.teams.length, report.reporter.name],
      [2, "Fox"],
      "the two teams and the reporter are named"
    );
    assert.ok(Array.isArray(report.messages));
    assert.equal(
      (await fox.browser.delete(`/api/admin/reports/${report.id}`)).status,
      403,
      "only an administrator dismisses"
    );
    assert.equal((await admin.browser.delete(`/api/admin/reports/${report.id}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/reports/${report.id}`)).status, 404);
    assert.equal((await admin.browser.get("/api/admin/reports")).body.items.length, 0);
  });

  test("agenda: RSVP, my agenda across teams, the calendar file", async () => {
    const events = (await alpha.browser.get(`/api/teams/${alphaId}/events`)).body.items;
    const scrim = events.find(event => event.kind === "scrim");
    assert.equal(
      (await stranger.browser.post(`/api/events/${scrim.id}/rsvp`, { answer: "going" })).status,
      403
    );
    assert.equal(
      (await player.browser.post(`/api/events/${scrim.id}/rsvp`, { answer: "going" })).status,
      200
    );
    assert.equal(
      (await coach.browser.post(`/api/events/${scrim.id}/rsvp`, { answer: "maybe" })).status,
      200
    );
    assert.equal(
      (await coach.browser.post(`/api/events/${scrim.id}/rsvp`, { answer: "nope" })).status,
      400
    );
    const mine = (await player.browser.get(`/api/teams/${alphaId}/events`)).body.items.find(
      event => event.id === scrim.id
    );
    assert.deepEqual(
      [mine.rsvp.mine, mine.rsvp.going.length, mine.rsvp.maybe.length],
      ["going", 1, 1]
    );
    const agenda = (await player.browser.get("/api/me/agenda")).body.items;
    assert.ok(agenda.some(event => event.id === scrim.id && event.team.tag === "ALPH"));
    assert.equal((await stranger.browser.get("/api/me/agenda")).body.items.length, 0);
    assert.equal((await app.browser().get("/api/me/agenda")).status, 401);
    const ics = await fetch(`${app.baseUrl}/api/teams/${alphaId}/events.ics`, {
      headers: { cookie: `hok_session=${alpha.browser.jar.get("hok_session")}` }
    });
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get("content-type"), /text\/calendar/);
    assert.match(await ics.text(), /SUMMARY:Scrim vs Nova Gaming/);
    assert.equal((await stranger.browser.get(`/api/teams/${alphaId}/events.ics`)).status, 403);
  });

  test("reminders: once per event, not for those who said no", async () => {
    const soon = {
      kind: "practice",
      title: "Practice",
      startsAt: Date.now() + 30 * 60_000,
      endsAt: Date.now() + 90 * 60_000
    };
    const created = await alpha.browser.post(`/api/teams/${alphaId}/events`, soon);
    assert.equal(created.status, 201);
    await player.browser.post(`/api/events/${created.body.id}/rsvp`, { answer: "no" });
    const before = (await player.browser.get("/api/notifications")).body.items.length;
    const count = await runReminders({ store: app.store, notifier: null });
    assert.ok(count >= 2, "owner and coach are told");
    assert.equal(
      (await player.browser.get("/api/notifications")).body.items.length,
      before,
      "the one who said no is not"
    );
    assert.equal(
      (await coach.browser.get("/api/notifications")).body.items.some(
        item => item.kind === "reminder"
      ),
      true
    );
    assert.equal(await runReminders({ store: app.store, notifier: null }), 0, "never twice");
  });

  test("player profiles: public page, own edit, admin chip, no e-mail", async () => {
    assert.equal((await app.browser().get("/api/players/ZZZZZZ")).status, 404);
    assert.equal((await app.browser().get("/api/players/!!")).status, 404);
    assert.equal((await app.browser().put("/api/me/player-profile", {})).status, 401);
    assert.equal(
      (
        await player.browser.put("/api/me/player-profile", {
          bio: "Jungler",
          lane: "Jungle",
          timezone: "UTC+2",
          languages: ["en", "fr"],
          mainHeroes: ["h01", "h02"]
        })
      ).status,
      200
    );
    const view = (await app.browser().get(`/api/players/${player.user.tag.toLowerCase()}`)).body;
    assert.deepEqual(
      [
        view.name,
        view.profile.bio,
        view.profile.mainHeroes,
        view.teams[0].name,
        view.teams[0].role,
        view.discordLinked,
        view.admin,
        view.isMe
      ],
      ["Player", "Jungler", ["h01", "h02"], "Alpha Esports", "player", false, false, false]
    );
    assert.equal(JSON.stringify(view).includes("@"), false, "the e-mail is never published");
    assert.equal((await player.browser.get(`/api/players/${player.user.tag}`)).body.isMe, true);
    const admin = await app.signIn("Boss", { admin: true });
    assert.equal((await app.browser().get(`/api/players/${admin.user.tag}`)).body.admin, true);
  });

  test("Discord: link, preferences, direct messages only for what was asked, unlink", async () => {
    assert.equal((await coach.browser.get("/api/me/discord")).body.linked, false);
    assert.equal(
      (await coach.browser.put("/api/me/discord/prefs", { requests: false })).status,
      404,
      "nothing to configure before linking"
    );
    // the browser redirect with a state cookie
    const start = await fetch(`${app.baseUrl}/auth/discord`, {
      redirect: "manual",
      headers: { cookie: `hok_session=${nova.browser.jar.get("hok_session")}` }
    });
    assert.equal(start.status, 302);
    assert.match(start.headers.get("location"), /^https:\/\/discord\.test\/authorize\?state=/);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const stateCookie = start.headers
      .getSetCookie()
      .find(item => item.startsWith("hok_discord_state="))
      .split(";")[0];
    const session = `hok_session=${nova.browser.jar.get("hok_session")}`;
    const wrong = await fetch(`${app.baseUrl}/auth/discord/callback?code=good&state=forged`, {
      redirect: "manual",
      headers: { cookie: `${session}; ${stateCookie}` }
    });
    assert.match(wrong.headers.get("location"), /error=1/);
    const callback = await fetch(`${app.baseUrl}/auth/discord/callback?code=good&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `${session}; ${stateCookie}` }
    });
    assert.equal(callback.headers.get("location"), "/discord?linked=1");
    const linked = (await nova.browser.get("/api/me/discord")).body;
    assert.deepEqual(
      [linked.linked, linked.username, linked.avatarUrl, linked.prefs.requests],
      [true, "karma#1", "https://cdn.test/123456789012345678/abc.png", true]
    );
    assert.equal(
      (await app.browser().get("/auth/discord")).status,
      302,
      "a visitor is sent to sign in"
    );
    // the same Discord account cannot be on two site accounts
    const other = await fetch(`${app.baseUrl}/auth/discord`, {
      redirect: "manual",
      headers: { cookie: `hok_session=${fox.browser.jar.get("hok_session")}` }
    });
    const otherState = new URL(other.headers.get("location")).searchParams.get("state");
    const taken = await fetch(
      `${app.baseUrl}/auth/discord/callback?code=good&state=${otherState}`,
      {
        redirect: "manual",
        headers: {
          cookie: `hok_session=${fox.browser.jar.get("hok_session")}; ${
            other.headers
              .getSetCookie()
              .find(item => item.startsWith("hok_discord_state="))
              .split(";")[0]
          }`
        }
      }
    );
    assert.match(taken.headers.get("location"), /error=taken/);

    // a request for Nova now also reaches Discord; with the preference off it does not
    sent.length = 0;
    const askFromFox = overrides =>
      fox.browser.post("/api/requests", {
        fromTeamId: foxId,
        toTeamId: novaId,
        format: 3,
        ...overrides
      });
    assert.equal((await askFromFox(slot(12))).status, 201);
    await settle();
    assert.equal(sent.length, 1);
    assert.match(sent[0][1], /Crimson Fox asks you for a BO3 scrim/);
    assert.equal(
      (
        await nova.browser.put("/api/me/discord/prefs", {
          requests: false,
          reminders: true,
          results: true
        })
      ).body.prefs.requests,
      false
    );
    sent.length = 0;
    assert.equal((await askFromFox(slot(13))).status, 201);
    await settle();
    assert.equal(sent.length, 0, "the preference is respected");

    // "send me a test message": sent, or told why not
    assert.equal(
      (await coach.browser.post("/api/me/discord/test")).status,
      404,
      "nothing to test before linking"
    );
    assert.equal((await app.browser().post("/api/me/discord/test")).status, 401);
    sent.length = 0;
    assert.deepEqual((await nova.browser.post("/api/me/discord/test")).body, { sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], "123456789012345678", "to the Discord account that was linked");
    assert.match(sent[0][1], /^Test message from HOK Global Scrim Lab/);
    const sendDirectMessage = fakeDiscord.sendDirectMessage;
    const fails = (status, discordCode) => async () => {
      throw Object.assign(new Error("refused"), { status, discordCode });
    };
    for (const [failure, reason] of [
      [fails(403, 50007), "shared-server"],
      [fails(401, null), "bot-token"],
      [fails(429, null), "busy"],
      [fails(400, 40003), "busy"],
      [fails(500, null), "unknown"],
      [async () => Promise.reject(new TypeError("fetch failed")), "unreachable"]
    ]) {
      fakeDiscord.sendDirectMessage = failure;
      assert.deepEqual(
        (await nova.browser.post("/api/me/discord/test")).body,
        { sent: false, reason },
        reason
      );
    }
    fakeDiscord.sendDirectMessage = sendDirectMessage;
    fakeDiscord.botEnabled = false;
    assert.deepEqual((await nova.browser.post("/api/me/discord/test")).body, {
      sent: false,
      reason: "no-bot"
    });
    fakeDiscord.botEnabled = true;

    assert.equal((await nova.browser.delete("/api/me/discord")).body.linked, false);
  });
});

describe("Discord service", () => {
  test("a refusal of Discord keeps its own code, and a failure is explained for the person", async () => {
    const refusing = body => async () => ({ ok: false, status: 403, json: async () => body });
    const service = createDiscordService(
      { discord: { botToken: "token" } },
      refusing({ code: 50007 })
    );
    await assert.rejects(
      service.sendDirectMessage("123456789012345678", "hello"),
      error => error.status === 403 && error.discordCode === 50007
    );
    assert.equal(whyNotSent({ status: 403, discordCode: 50007 }), "shared-server");
    assert.equal(whyNotSent({ status: 401 }), "bot-token");
    assert.equal(whyNotSent({ status: 429 }), "busy");
    assert.equal(whyNotSent({ status: 400, discordCode: 40003 }), "busy");
    assert.equal(whyNotSent({ status: 500 }), "unknown");
    assert.equal(whyNotSent(new TypeError("fetch failed")), "unreachable");
  });

  test("it is off without variables, and the authorize address carries the state", () => {
    assert.equal(createDiscordService({ discord: {} }).enabled, false);
    const service = createDiscordService({
      discord: {
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "https://x.test/cb",
        botToken: "bot"
      }
    });
    assert.equal(service.enabled, true);
    assert.equal(service.botEnabled, true);
    const url = new URL(service.authorizeUrl("abc"));
    assert.deepEqual(
      [
        url.searchParams.get("state"),
        url.searchParams.get("scope"),
        url.searchParams.get("client_id")
      ],
      ["abc", "identify", "id"]
    );
  });
  test("a direct message opens a channel then posts, with the bot token and no mention", async () => {
    const calls = [];
    const service = createDiscordService(
      {
        discord: {
          clientId: "i",
          clientSecret: "s",
          redirectUri: "https://x.test/cb",
          botToken: "BOT"
        }
      },
      async (url, options) => {
        calls.push([url, options]);
        return { ok: true, status: 200, json: async () => ({ id: "chan" }) };
      }
    );
    assert.equal(await service.sendDirectMessage("42", "hello @everyone"), true);
    assert.match(calls[0][0], /users\/@me\/channels$/);
    assert.equal(calls[0][1].headers.authorization, "Bot BOT");
    assert.match(calls[1][0], /channels\/chan\/messages$/);
    assert.deepEqual(JSON.parse(calls[1][1].body).allowed_mentions, { parse: [] });
    assert.equal(await createDiscordService({ discord: {} }).sendDirectMessage("42", "x"), false);
  });
  test("a failing Discord never breaks the notifier", async () => {
    const warnings = [];
    const notifier = createNotifier({
      store: {
        discordTargets: async () => new Map([["u", { discordId: "1", prefs: { requests: true } }]])
      },
      discord: {
        botEnabled: true,
        sendDirectMessage: async () => {
          throw new Error("down");
        }
      },
      config: {},
      logger: { warn: (...args) => warnings.push(args) }
    });
    notifier.send([
      {
        userId: "u",
        kind: "request",
        payload: { team: "A", startsAt: 0, format: 3, heroRule: "free-for-all" }
      }
    ]);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(warnings.length, 1);
  });
  test("messages are written in plain English", () => {
    assert.match(
      describeNotification("answer", { team: "Nova", action: "accept" }),
      /Nova accepted/
    );
    assert.match(
      describeNotification("reminder", {
        title: "VOD",
        team: "A",
        startsAt: Date.UTC(2026, 9, 2, 20)
      }),
      /starts at .*2026/
    );
    assert.match(
      describeNotification("invitation", { team: "A", by: "Karma", role: "coach" }),
      /Karma invites you/
    );
  });
});

describe("site labels", () => {
  let app, admin, player;
  before(async () => {
    app = await startTestServer();
    admin = await app.signIn("Boss", { admin: true });
    player = await app.signIn("Someone");
  });
  after(() => app.close());

  test("only an administrator gives labels; they are shown on the player page and in rosters", async () => {
    const { parseLabels } = await import("./community-domain.js");
    assert.deepEqual(parseLabels({ labels: ["verified", "moderator"] }), ["verified", "moderator"]);
    rejects(() => parseLabels({ labels: ["verified", "verified"] }));
    rejects(() => parseLabels({ labels: ["king"] }));
    rejects(() => parseLabels({ labels: "verified" }));
    assert.equal(
      (
        await player.browser.put(`/api/admin/players/${player.user.tag}/labels`, {
          labels: ["verified"]
        })
      ).status,
      403
    );
    assert.equal(
      (
        await app
          .browser()
          .put(`/api/admin/players/${player.user.tag}/labels`, { labels: ["verified"] })
      ).status,
      401
    );
    assert.equal(
      (await admin.browser.put(`/api/admin/players/ZZZZZZ/labels`, { labels: ["verified"] }))
        .status,
      404
    );
    assert.equal(
      (
        await admin.browser.put(`/api/admin/players/${player.user.tag}/labels`, {
          labels: ["organiser", "verified"]
        })
      ).status,
      200
    );
    assert.deepEqual((await app.browser().get(`/api/players/${player.user.tag}`)).body.labels, [
      "organiser",
      "verified"
    ]);
    const teamId = (await player.browser.post("/api/teams", team("Label Squad", "LBL"))).body.id;
    assert.deepEqual((await app.browser().get(`/api/teams/${teamId}`)).body.members[0].labels, [
      "organiser",
      "verified"
    ]);
    assert.equal(
      (await admin.browser.put(`/api/admin/players/${player.user.tag}/labels`, { labels: [] }))
        .status,
      200
    );
    assert.deepEqual((await app.browser().get(`/api/players/${player.user.tag}`)).body.labels, []);
  });
});
