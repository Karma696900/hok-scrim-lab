// Teams: validation, and the API (create, browse, invitations that must be answered, roles,
// leaving, deleting).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import {
  nameKey,
  parseInvitation,
  parseMaxMembers,
  parseMemberRole,
  parseTeam
} from "./team-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const team = (overrides = {}) => ({
  name: "Alpha Esports",
  tag: "alph",
  description: "Evening scrims",
  region: "EU",
  timezone: "UTC+1",
  languages: ["en", "fr"],
  level: "amateur",
  ...overrides
});
const rejects = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);

describe("team validation", () => {
  test("a team is normalised (tag in capitals, spaces collapsed)", () => {
    const parsed = parseTeam(team({ name: "  Alpha   Esports ", tag: "alph" }));
    assert.equal(parsed.name, "Alpha Esports");
    assert.equal(parsed.tag, "ALPH");
    assert.equal(parsed.nameKey, nameKey("alpha esports"));
  });
  test("what is not allowed is refused", () => {
    rejects(() => parseTeam(team({ name: "A" })));
    rejects(() => parseTeam(team({ tag: "TOOLONG" })));
    rejects(() => parseTeam(team({ tag: "a-b" })));
    rejects(() => parseTeam(team({ region: "MOON" })));
    rejects(() => parseTeam(team({ level: "god" })));
    rejects(() => parseTeam(team({ timezone: "Paris" })));
    rejects(() => parseTeam(team({ languages: ["xx"] })));
    rejects(() => parseTeam(team({ languages: ["en", "en"] })));
    rejects(() => parseTeam(team({ name: "<b>x</b>" })));
    rejects(() => parseTeam(null));
  });
  test("a lane only goes with a player or a substitute; the owner role is never handed out", () => {
    assert.deepEqual(parseMemberRole({ role: "coach", lane: "Jungle" }), {
      role: "coach",
      lane: ""
    });
    assert.deepEqual(parseMemberRole({ role: "player", lane: "Jungle" }), {
      role: "player",
      lane: "Jungle"
    });
    rejects(() => parseMemberRole({ role: "owner" }));
    rejects(() => parseMemberRole({ role: "player", lane: "Top" }));
  });
  test("an invitation names a player by the tag shown on their profile", () => {
    assert.equal(parseInvitation({ tag: "#k7m2qx", role: "player" }).tag, "K7M2QX");
    rejects(() => parseInvitation({ tag: "", role: "player" }));
    rejects(() => parseInvitation({ tag: "no way", role: "player" }));
  });
});

describe("member limit", () => {
  test("a team chooses a limit from 7 to 20 (10 by default)", () => {
    assert.equal(parseTeam(team()).maxMembers, 10);
    assert.equal(parseMaxMembers(7), 7);
    assert.equal(parseMaxMembers(20), 20);
    assert.equal(parseMaxMembers("12"), 12);
    for (const bad of [6, 21, 0, -1, 7.5, "abc", [], {}, true]) {
      rejects(() => parseMaxMembers(bad));
    }
  });
});

describe("teams API", () => {
  let app, owner, manager, player, stranger, teamId;
  before(async () => {
    app = await startTestServer();
    [owner, manager, player, stranger] = await Promise.all(
      ["Owner", "Manager", "Player", "Stranger"].map(name => app.signIn(name))
    );
  });
  after(() => app.close());

  test("a visitor can browse teams but not create one", async () => {
    assert.equal((await app.browser().get("/api/teams")).status, 200);
    assert.equal((await app.browser().post("/api/teams", team())).status, 401);
  });

  test("creating a team makes the creator its owner; name and tag are unique", async () => {
    const created = await owner.browser.post("/api/teams", team());
    assert.equal(created.status, 201);
    teamId = created.body.id;
    const sheet = (await owner.browser.get(`/api/teams/${teamId}`)).body;
    assert.equal(sheet.myRole, "owner");
    assert.deepEqual(
      sheet.members.map(member => [member.name, member.role]),
      [["Owner", "owner"]]
    );
    assert.equal(
      (await manager.browser.post("/api/teams", team({ tag: "OTHR" }))).status,
      409,
      "same name, any case"
    );
    assert.equal(
      (await manager.browser.post("/api/teams", team({ name: "alpha  esports" }))).status,
      409,
      "same name, other spacing"
    );
    assert.equal(
      (await manager.browser.post("/api/teams", team({ name: "Beta Squad", tag: "ALPH" }))).status,
      409,
      "same tag"
    );
  });

  test("the list is public and can be searched and filtered", async () => {
    const all = (await app.browser().get("/api/teams")).body;
    assert.equal(all.total, 1);
    assert.equal(all.items[0].memberCount, 1);
    assert.deepEqual(all.items[0].lanes, [], "nobody has a lane yet");
    assert.equal((await app.browser().get("/api/teams?q=alph")).body.total, 1);
    assert.equal((await app.browser().get("/api/teams?q=zzz")).body.total, 0);
    assert.equal((await app.browser().get("/api/teams?level=pro")).body.total, 0);
    assert.equal((await app.browser().get("/api/teams?level=nope")).status, 400);
  });

  test("somebody is only added after answering an invitation", async () => {
    assert.equal(
      (
        await owner.browser.post(`/api/teams/${teamId}/invitations`, {
          tag: manager.user.tag,
          role: "manager"
        })
      ).status,
      201
    );
    assert.equal(
      (await manager.browser.get(`/api/teams/${teamId}`)).body.members.length,
      1,
      "still not in the roster"
    );
    assert.equal(
      (
        await owner.browser.post(`/api/teams/${teamId}/invitations`, {
          tag: manager.user.tag,
          role: "coach"
        })
      ).status,
      409,
      "already invited"
    );
    assert.equal(
      (
        await owner.browser.post(`/api/teams/${teamId}/invitations`, {
          tag: "ZZZZZZ",
          role: "coach"
        })
      ).status,
      404
    );

    const pending = (await manager.browser.get("/api/me/invitations")).body.items;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].team.name, "Alpha Esports");
    assert.equal(
      (await stranger.browser.post(`/api/invitations/${pending[0].id}/accept`)).status,
      404,
      "somebody else's invitation"
    );
    assert.equal(
      (await manager.browser.post(`/api/invitations/${pending[0].id}/accept`)).status,
      200
    );
    assert.equal((await manager.browser.get("/api/me/invitations")).body.items.length, 0);
    assert.equal((await manager.browser.get(`/api/teams/${teamId}`)).body.myRole, "manager");
  });

  test("a declined invitation adds nobody", async () => {
    await manager.browser.post(`/api/teams/${teamId}/invitations`, {
      tag: player.user.tag,
      role: "player",
      lane: "Jungle"
    });
    const [invitation] = (await player.browser.get("/api/me/invitations")).body.items;
    assert.equal(
      (await player.browser.post(`/api/invitations/${invitation.id}/decline`)).status,
      200
    );
    assert.equal((await owner.browser.get(`/api/teams/${teamId}`)).body.members.length, 2);
  });

  test("a manager can invite, and cancel an invitation; a plain member and a stranger cannot manage", async () => {
    const sent = await manager.browser.post(`/api/teams/${teamId}/invitations`, {
      tag: player.user.tag,
      role: "player",
      lane: "Mid Lane"
    });
    assert.equal(sent.status, 201);
    const sheet = (await owner.browser.get(`/api/teams/${teamId}`)).body;
    assert.equal(sheet.invitations.length, 1, "the staff sees pending invitations");
    assert.equal(
      (await app.browser().get(`/api/teams/${teamId}`)).body.invitations.length,
      0,
      "the public does not"
    );
    assert.equal(
      (
        await stranger.browser.post(`/api/teams/${teamId}/invitations`, {
          tag: player.user.tag,
          role: "player"
        })
      ).status,
      403
    );
    assert.equal(
      (await stranger.browser.put(`/api/teams/${teamId}`, team({ description: "hacked" }))).status,
      403
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${teamId}/invitations/${sent.body.id}`)).status,
      200
    );
    assert.equal((await owner.browser.get(`/api/teams/${teamId}`)).body.invitations.length, 0);
  });

  test("roles: only the owner names a manager; the owner cannot be changed or removed", async () => {
    const [invitation] = await (async () => {
      await owner.browser.post(`/api/teams/${teamId}/invitations`, {
        tag: player.user.tag,
        role: "player",
        lane: "Farm Lane"
      });
      return (await player.browser.get("/api/me/invitations")).body.items;
    })();
    await player.browser.post(`/api/invitations/${invitation.id}/accept`);
    assert.deepEqual(
      (await app.browser().get("/api/teams")).body.items[0].lanes,
      ["Farm Lane"],
      "the list shows the lanes the roster covers"
    );
    assert.deepEqual((await player.browser.get("/api/me/teams")).body.items[0].lanes, [
      "Farm Lane"
    ]);
    assert.equal(
      (
        await manager.browser.put(`/api/teams/${teamId}/members/${player.user.id}`, {
          role: "manager"
        })
      ).status,
      403
    );
    assert.equal(
      (
        await manager.browser.put(`/api/teams/${teamId}/members/${player.user.id}`, {
          role: "captain"
        })
      ).status,
      200
    );
    assert.equal(
      (
        await player.browser.put(`/api/teams/${teamId}/members/${manager.user.id}`, {
          role: "player"
        })
      ).status,
      403,
      "a captain is not staff"
    );
    assert.equal(
      (
        await manager.browser.put(`/api/teams/${teamId}/members/${owner.user.id}`, {
          role: "player"
        })
      ).status,
      404,
      "the owner row is untouchable"
    );
    assert.equal(
      (await manager.browser.delete(`/api/teams/${teamId}/members/${owner.user.id}`)).status,
      403
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${teamId}/members/${owner.user.id}`)).status,
      403,
      "the owner deletes the team instead"
    );
  });

  test("a member can leave; a plain member cannot remove somebody; the owner can", async () => {
    assert.equal(
      (await player.browser.delete(`/api/teams/${teamId}/members/${manager.user.id}`)).status,
      403
    );
    assert.equal(
      (await manager.browser.delete(`/api/teams/${teamId}/members/${player.user.id}`)).status,
      200
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${teamId}/members/${manager.user.id}`)).status,
      200
    );
    assert.equal((await owner.browser.get(`/api/teams/${teamId}`)).body.members.length, 1);
  });

  test("my teams, then deleting: only the owner can", async () => {
    assert.equal((await owner.browser.get("/api/me/teams")).body.items[0].myRole, "owner");
    assert.equal((await stranger.browser.delete(`/api/teams/${teamId}`)).status, 403);
    assert.equal((await owner.browser.delete(`/api/teams/${teamId}`)).status, 200);
    assert.equal((await app.browser().get(`/api/teams/${teamId}`)).status, 404);
  });

  test("the member limit is kept: a full team refuses an invitation, and cannot be set below its size", async () => {
    const created = await owner.browser.post(
      "/api/teams",
      team({ name: "Small Squad", tag: "SML", maxMembers: 7 })
    );
    const id = created.body.id;
    assert.equal((await owner.browser.get(`/api/teams/${id}`)).body.maxMembers, 7);
    const guests = await Promise.all(
      Array.from({ length: 7 }, (_, index) => app.signIn(`Guest${index}`))
    );
    // the owner is member 1: six invitations fill the team (members + pending invitations)
    for (const guest of guests.slice(0, 6)) {
      assert.equal(
        (
          await owner.browser.post(`/api/teams/${id}/invitations`, {
            tag: guest.user.tag,
            role: "player"
          })
        ).status,
        201
      );
    }
    const refused = await owner.browser.post(`/api/teams/${id}/invitations`, {
      tag: guests[6].user.tag,
      role: "player"
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "team_full");
    assert.equal(
      (
        await owner.browser.put(
          `/api/teams/${id}`,
          team({ name: "Small Squad", tag: "SML", maxMembers: 20 })
        )
      ).status,
      200,
      "the limit can be raised"
    );
    assert.equal(
      (
        await owner.browser.post(`/api/teams/${id}/invitations`, {
          tag: guests[6].user.tag,
          role: "player"
        })
      ).status,
      201,
      "and then there is room"
    );
    const below = await owner.browser.put(
      `/api/teams/${id}`,
      team({ name: "Small Squad", tag: "SML", maxMembers: 7 })
    );
    assert.equal(below.status, 409, "the team holds 8 members and invitations: 7 is too low");
    assert.equal(below.body.code, "team_size_below_members");
    assert.equal(
      (
        await owner.browser.put(
          `/api/teams/${id}`,
          team({ name: "Small Squad", tag: "SML", maxMembers: 6 })
        )
      ).status,
      400,
      "below 7 is invalid"
    );
  });

  test("a team logo: staff only, processed to a small square WebP, versioned, removable", async () => {
    const id = (await owner.browser.post("/api/teams", team({ name: "Logo Squad", tag: "LOGO" })))
      .body.id;
    const png = await sharp({
      create: { width: 300, height: 120, channels: 3, background: "#3366ff" }
    })
      .png()
      .toBuffer();
    const send = (user, body = png, type = "image/png") =>
      fetch(`${app.baseUrl}/api/teams/${id}/logo`, {
        method: "PUT",
        headers: {
          "content-type": type,
          cookie: user ? `hok_session=${user.browser.jar.get("hok_session")}` : ""
        },
        body
      });
    assert.equal((await send(null)).status, 401);
    assert.equal((await send(stranger)).status, 403);
    assert.equal((await send(owner, Buffer.from("not an image"))).status, 400);
    assert.ok((await send(owner, png, "text/html")).status >= 400, "only pictures are accepted");
    const saved = await send(owner);
    assert.equal(saved.status, 200);
    const { logoVersion } = await saved.json();
    assert.ok(logoVersion > 0);
    assert.equal((await app.browser().get(`/api/teams/${id}`)).body.logoVersion, logoVersion);
    const picture = await fetch(`${app.baseUrl}/team-logos/${id}?v=${logoVersion}`);
    assert.equal(picture.status, 200);
    assert.equal(picture.headers.get("content-type"), "image/webp");
    const meta = await sharp(Buffer.from(await picture.arrayBuffer())).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [256, 256, "webp"]);
    assert.equal((await owner.browser.delete(`/api/teams/${id}/logo`)).status, 200);
    assert.equal((await app.browser().get(`/api/teams/${id}`)).body.logoVersion, 0);
    assert.equal((await fetch(`${app.baseUrl}/team-logos/${id}`)).status, 404);
    assert.equal((await fetch(`${app.baseUrl}/team-logos/not-an-id`)).status, 404);
  });

  test("a person is in at most five teams", async () => {
    for (let index = 0; index < 5; index += 1) {
      assert.equal(
        (
          await stranger.browser.post(
            "/api/teams",
            team({ name: `Squad ${index}`, tag: `SQ${index}` })
          )
        ).status,
        201
      );
    }
    assert.equal(
      (await stranger.browser.post("/api/teams", team({ name: "Squad six", tag: "SQ6" }))).status,
      409
    );
  });
});

describe("team agenda", () => {
  let app, owner, coach, player, stranger, teamId;
  const hour = 3600_000;
  const inDays = days => Date.now() + days * 24 * hour;
  const event = (overrides = {}) => ({
    kind: "scrim",
    title: "Scrim vs Nova",
    startsAt: inDays(2),
    endsAt: inDays(2) + 2 * hour,
    note: "BO3, lobby by DM",
    ...overrides
  });

  before(async () => {
    app = await startTestServer();
    [owner, coach, player, stranger] = await Promise.all(
      ["Owner", "Coach", "Player", "Stranger"].map(name => app.signIn(name))
    );
    teamId = (await owner.browser.post("/api/teams", team())).body.id;
    for (const [user, role] of [
      [coach, "coach"],
      [player, "player"]
    ]) {
      await owner.browser.post(`/api/teams/${teamId}/invitations`, { tag: user.user.tag, role });
      const [invitation] = (await user.browser.get("/api/me/invitations")).body.items;
      await user.browser.post(`/api/invitations/${invitation.id}/accept`);
    }
  });
  after(() => app.close());

  test("validation: kinds, order, length, dates", async () => {
    const { parseEvent, parseWindow } = await import("./team-domain.js");
    assert.equal(parseEvent(event()).kind, "scrim");
    assert.equal(
      parseEvent({ kind: "availability", startsAt: inDays(1), endsAt: inDays(1) + hour }).title,
      "Available"
    );
    assert.equal(
      parseEvent({
        ...event(),
        startsAt: new Date(inDays(3)).toISOString(),
        endsAt: new Date(inDays(3) + hour).toISOString()
      }).startsAt > 0,
      true
    );
    rejects(() => parseEvent(event({ title: "" })));
    rejects(() => parseEvent(event({ kind: "party" })));
    rejects(() => parseEvent(event({ endsAt: inDays(2) })), "invalid_body");
    rejects(() => parseEvent(event({ endsAt: inDays(5) })));
    rejects(() => parseEvent(event({ startsAt: "2026-01-01T10:00:00+02:00" })), "invalid_body");
    rejects(() => parseEvent(event({ startsAt: "yesterday" })));
    rejects(() => parseEvent(event({ note: "x".repeat(401) })));
    rejects(() => parseWindow({ from: "0", to: "1" }));
    rejects(
      () => parseWindow({ from: String(Date.now()), to: String(Date.now() + 400 * 24 * hour) }),
      "invalid_query"
    );
  });

  test("the staff and the captain schedule; a player and a stranger cannot", async () => {
    assert.equal((await player.browser.post(`/api/teams/${teamId}/events`, event())).status, 403);
    assert.equal((await stranger.browser.post(`/api/teams/${teamId}/events`, event())).status, 403);
    assert.equal((await app.browser().post(`/api/teams/${teamId}/events`, event())).status, 401);
    assert.equal((await coach.browser.post(`/api/teams/${teamId}/events`, event())).status, 201);
    assert.equal(
      (
        await owner.browser.post(
          `/api/teams/${teamId}/events`,
          event({
            kind: "availability",
            title: "",
            startsAt: inDays(3),
            endsAt: inDays(3) + 3 * hour,
            note: "private note"
          })
        )
      ).status,
      201
    );
    assert.equal(
      (
        await owner.browser.post(
          `/api/teams/${teamId}/events`,
          event({ kind: "vod", title: "VOD review", startsAt: inDays(4), endsAt: inDays(4) + hour })
        )
      ).status,
      201
    );
  });

  test("members see everything; a stranger and a visitor only see the public availability, without its note", async () => {
    const mine = (await player.browser.get(`/api/teams/${teamId}/events`)).body;
    assert.deepEqual(
      mine.items.map(item => item.kind),
      ["scrim", "availability", "vod"]
    );
    assert.equal(mine.canSchedule, false);
    assert.equal((await coach.browser.get(`/api/teams/${teamId}/events`)).body.canSchedule, true);
    for (const viewer of [stranger.browser, app.browser()]) {
      const seen = (await viewer.get(`/api/teams/${teamId}/events`)).body;
      assert.deepEqual(
        seen.items.map(item => item.kind),
        ["availability"]
      );
      assert.equal(seen.items[0].note, "", "a private note is never shown");
    }
  });

  test("the window limits the list; edit and delete", async () => {
    const narrow = (
      await owner.browser.get(`/api/teams/${teamId}/events?from=${inDays(1.5)}&to=${inDays(2.5)}`)
    ).body.items;
    assert.deepEqual(
      narrow.map(item => item.title),
      ["Scrim vs Nova"]
    );
    assert.equal((await owner.browser.get(`/api/teams/${teamId}/events?from=5&to=4`)).status, 400);
    const [first] = narrow;
    assert.equal(
      (
        await owner.browser.put(
          `/api/teams/${teamId}/events/${first.id}`,
          event({ title: "Scrim vs Fox" })
        )
      ).status,
      200
    );
    assert.equal(
      (await player.browser.delete(`/api/teams/${teamId}/events/${first.id}`)).status,
      403
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${teamId}/events/${first.id}`)).status,
      200
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${teamId}/events/${first.id}`)).status,
      404
    );
    assert.equal(
      (await app.browser().get("/api/teams/00000000-0000-4000-8000-000000000000/events")).status,
      404
    );
  });

  test("an event of another team cannot be reached through this one", async () => {
    const other = (
      await stranger.browser.post("/api/teams", team({ name: "Other Squad", tag: "OTH" }))
    ).body.id;
    const id = (await stranger.browser.post(`/api/teams/${other}/events`, event())).body.id;
    assert.equal((await owner.browser.delete(`/api/teams/${teamId}/events/${id}`)).status, 404);
    assert.equal(
      (await owner.browser.put(`/api/teams/${teamId}/events/${id}`, event())).status,
      404
    );
  });
});
