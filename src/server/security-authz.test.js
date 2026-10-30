// Authorization: ownership, sharing, import, online roles, guest identity, legacy rows.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { CREATE_BODY, playFullDraft, startTestServer } from "../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

async function ownerOf(table, id) {
  const [[row]] = await app.store.pool.query(`SELECT owner_user_id FROM ${table} WHERE id = ?`, [
    id
  ]);
  return row.owner_user_id;
}

describe("series ownership (IDOR / BOLA)", { skip }, () => {
  test("another visitor cannot list, read, change or delete someone else's series", async () => {
    const alice = app.browser();
    const { body: series } = await alice.post("/api/series", CREATE_BODY);
    const base = `/api/series/${series.id}`;
    await alice.post(`${base}/game`, { blueTeam: "Alpha" });

    for (const intruder of [app.browser(), (await app.signIn("Mallory")).browser]) {
      assert.equal((await intruder.get(base)).status, 404);
      assert.equal((await intruder.get("/api/series")).body.items.length, 0);
      assert.equal((await intruder.delete(base)).status, 404);
      assert.equal((await intruder.post(`${base}/game/ready`)).status, 404);
      assert.equal((await intruder.post(`${base}/game/action`, { heroId: "h01" })).status, 404);
      assert.equal((await intruder.post(`${base}/game/timer/start`)).status, 404);
      assert.equal(
        (await intruder.post(`${base}/game/complete`, { winner: "Alpha", durationSeconds: 1 }))
          .status,
        404
      );
      assert.equal((await intruder.patch(`${base}/games/0`, { durationSeconds: 1 })).status, 404);
      assert.equal((await intruder.post(`${base}/invites`, {})).status, 404);
      assert.equal((await intruder.get(`${base}/sharing`)).status, 404);
    }
    const stillThere = await alice.get(base);
    assert.equal(stillThere.status, 200);
    assert.equal(
      stillThere.body.currentGame.draft.started,
      false,
      "intruder calls changed nothing"
    );
  });

  test("the generic whole-object PUT no longer exists", async () => {
    const alice = app.browser();
    const { body: series } = await alice.post("/api/series", CREATE_BODY);
    const response = await alice.put(`/api/series/${series.id}`, {
      ...series,
      teamA: { name: "Hacked" }
    });
    assert.equal(response.status, 404);
    assert.equal((await alice.get(`/api/series/${series.id}`)).body.teamA.name, "Alpha");
  });

  test("series ids are validated before touching the database", async () => {
    assert.equal((await app.browser().get("/api/series/not-a-uuid")).status, 400);
  });

  test("lists are paginated", async () => {
    const bob = app.browser();
    for (let index = 0; index < 3; index += 1) {
      await bob.post("/api/series", { ...CREATE_BODY, teamA: `T${index}`, teamB: `U${index}` });
    }
    const page = await bob.get("/api/series?page=2&pageSize=2");
    assert.equal(page.body.items.length, 1);
    assert.equal(page.body.total, 3);
    assert.equal((await bob.get("/api/series?pageSize=1000")).status, 400);
    assert.equal((await bob.get("/api/series?page=0")).status, 400);
  });
});

describe("series import", { skip }, () => {
  async function exportedSeries(owner) {
    const { body: series } = await owner.post("/api/series", { ...CREATE_BODY, bestOf: 1 });
    await owner.post(`/api/series/${series.id}/game`, { blueTeam: "Alpha" });
    await owner.post(`/api/series/${series.id}/game/ready`);
    await playFullDraft(owner, series.id);
    await app.rewriteSeries(series.id, stored => {
      stored.currentGame.draft.deadline = 1;
    });
    await owner.post(`/api/series/${series.id}/game/advance`);
    await owner.post(`/api/series/${series.id}/game/complete`, {
      winner: "Bravo",
      durationSeconds: 1234
    });
    return (await owner.get(`/api/series/${series.id}`)).body;
  }

  test("importing never overwrites an existing series, even with a known id", async () => {
    const victim = app.browser();
    const original = await exportedSeries(victim);
    const attacker = app.browser();
    const response = await attacker.post("/api/series/import", {
      ...original,
      teamA: { name: "Pwned" },
      games: []
    });
    assert.equal(response.status, 200, response.text);
    assert.notEqual(response.body.id, original.id);
    assert.equal(response.body.viewer.role, "owner");
    const intact = (await victim.get(`/api/series/${original.id}`)).body;
    assert.equal(intact.teamA.name, "Alpha");
    assert.equal(intact.games.length, 1);
    assert.equal((await attacker.get(`/api/series/${original.id}`)).status, 404);
  });

  test("a valid export round-trips with its games and a recomputed status", async () => {
    const original = await exportedSeries(app.browser());
    const copy = await app.browser().post("/api/series/import", original);
    assert.equal(copy.status, 200, copy.text);
    assert.equal(copy.body.status, "complete");
    assert.equal(copy.body.games.length, 1);
    assert.equal(copy.body.games[0].winner, "Bravo");
    assert.equal(copy.body.games[0].durationSeconds, 1234);
    assert.deepEqual(copy.body.games[0].draft.picks, original.games[0].draft.picks);
    assert.equal(copy.body.currentGame, null);
  });

  test("malformed or hostile imports are rejected with a 400", async () => {
    const original = await exportedSeries(app.browser());
    const mutate = change => {
      const copy = structuredClone(original);
      change(copy);
      return copy;
    };
    const cases = {
      "unknown hero": mutate(copy => {
        copy.games[0].draft.picks.blue[0] = "nope";
      }),
      "hero used twice": mutate(copy => {
        copy.games[0].draft.picks.blue[0] = copy.games[0].draft.bans.blue[0];
      }),
      "unexpected series field": mutate(copy => {
        copy.isAdmin = true;
      }),
      "unexpected game field": mutate(copy => {
        copy.games[0].owner = "x";
      }),
      "bestOf out of range": mutate(copy => {
        copy.bestOf = 500;
      }),
      "more games than bestOf": mutate(copy => {
        copy.games.push(structuredClone(copy.games[0]));
      }),
      "same team names": mutate(copy => {
        copy.teamB.name = copy.teamA.name;
      }),
      "winner is not a team": mutate(copy => {
        copy.games[0].winner = "Mallory";
      }),
      "same side twice": mutate(copy => {
        copy.games[0].redTeam = copy.games[0].blueTeam;
      }),
      "negative duration": mutate(copy => {
        copy.games[0].durationSeconds = -1;
      }),
      "huge duration": mutate(copy => {
        copy.games[0].durationSeconds = 10 ** 9;
      }),
      "too many bans": mutate(copy => {
        copy.games[0].draft.bans.red = ["h20", "h21", "h22", "h23", "h24", "h25"];
      }),
      "html in team name": mutate(copy => {
        copy.teamA.name = "<img onerror=x>";
        copy.games[0].blueTeam = copy.teamA.name;
      }),
      "games not a list": mutate(copy => {
        copy.games = {};
      })
    };
    for (const [label, payload] of Object.entries(cases)) {
      const response = await app.browser().post("/api/series/import", payload);
      assert.equal(response.status, 400, `${label}: ${response.text}`);
    }
    for (const body of [[], "text", 12, null]) {
      assert.equal((await app.browser().post("/api/series/import", body)).status, 400);
    }
  });
});

describe("tier list ownership and sharing", { skip }, () => {
  const body = { name: "Mine", tiers: [{ id: "t1", label: "S", heroes: [] }], unranked: ["h01"] };

  test("tier lists are private to their owner", async () => {
    const alice = app.browser();
    const { body: list } = await alice.post("/api/tier-lists", body);
    const mallory = (await app.signIn("Mallory")).browser;
    assert.equal((await mallory.get(`/api/tier-lists/${list.id}`)).status, 404);
    assert.equal((await mallory.get("/api/tier-lists")).body.items.length, 0);
    assert.equal(
      (await mallory.put(`/api/tier-lists/${list.id}`, { ...body, name: "Pwned" })).status,
      404
    );
    assert.equal((await mallory.delete(`/api/tier-lists/${list.id}`)).status, 404);
    assert.equal(
      (await app.browser().get("/api/tier-lists")).body.items.length,
      0,
      "anonymous visitors see nothing"
    );
    assert.equal((await alice.get(`/api/tier-lists/${list.id}`)).body.name, "Mine");
  });

  test("an invitation link grants viewer or editor access, once, and can be revoked", async () => {
    const alice = app.browser();
    const { body: list } = await alice.post("/api/tier-lists", body);
    const viewerInvite = (
      await alice.post(`/api/tier-lists/${list.id}/invites`, { role: "viewer" })
    ).body;
    assert.match(viewerInvite.token, /^t_/);

    const viewer = app.browser();
    const accepted = await viewer.post("/api/invites/accept", { token: viewerInvite.token });
    assert.equal(accepted.status, 200, accepted.text);
    assert.deepEqual(
      { kind: accepted.body.kind, role: accepted.body.role },
      { kind: "tierList", role: "viewer" }
    );
    assert.equal((await viewer.get(`/api/tier-lists/${list.id}`)).body.viewer.role, "viewer");
    assert.equal(
      (await viewer.put(`/api/tier-lists/${list.id}`, { ...body, name: "Nope" })).status,
      403
    );
    assert.equal((await viewer.delete(`/api/tier-lists/${list.id}`)).status, 403);
    assert.equal((await viewer.post(`/api/tier-lists/${list.id}/invites`, {})).status, 404);
    assert.equal((await viewer.get("/api/tier-lists")).body.items.length, 1);

    assert.equal(
      (await app.browser().post("/api/invites/accept", { token: viewerInvite.token })).status,
      409,
      "single use"
    );
    assert.equal(
      (await app.browser().post("/api/invites/accept", { token: "t_garbage" })).status,
      404
    );

    const editorInvite = (
      await alice.post(`/api/tier-lists/${list.id}/invites`, { role: "editor" })
    ).body;
    const editor = app.browser();
    await editor.post("/api/invites/accept", { token: editorInvite.token });
    const edited = await editor.put(`/api/tier-lists/${list.id}`, {
      ...body,
      name: "Edited",
      expectedVersion: 0
    });
    assert.equal(edited.status, 200, edited.text);
    assert.equal((await alice.get(`/api/tier-lists/${list.id}`)).body.name, "Edited");

    const sharing = (await alice.get(`/api/tier-lists/${list.id}/sharing`)).body;
    assert.equal(sharing.members.length, 2);
    const third = (await alice.post(`/api/tier-lists/${list.id}/invites`, { role: "viewer" })).body;
    const listed = (await alice.get(`/api/tier-lists/${list.id}/sharing`)).body.invites;
    const toRevoke = listed.find(invite => invite.uses === 0);
    assert.equal(
      (await alice.delete(`/api/tier-lists/${list.id}/invites/${toRevoke.id}`)).status,
      200
    );
    assert.equal(
      (await app.browser().post("/api/invites/accept", { token: third.token })).status,
      404,
      "revoked"
    );

    const leaver = sharing.members.find(member => member.role === "viewer");
    assert.equal(
      (await alice.delete(`/api/tier-lists/${list.id}/members/${leaver.userId}`)).status,
      200
    );
    assert.equal(
      (await viewer.get(`/api/tier-lists/${list.id}`)).status,
      404,
      "removed members lose access"
    );
    assert.equal(
      (await editor.delete(`/api/tier-lists/${list.id}/members/me`)).status,
      200,
      "members can leave"
    );
  });

  test("expired invitations are refused", async () => {
    const alice = app.browser();
    const { body: list } = await alice.post("/api/tier-lists", body);
    const invite = (await alice.post(`/api/tier-lists/${list.id}/invites`, { role: "viewer" }))
      .body;
    await app.store.pool.query(
      "UPDATE tier_list_invites SET expires_at = ? WHERE tier_list_id = ?",
      [Date.now() - 1000, list.id]
    );
    assert.equal(
      (await app.browser().post("/api/invites/accept", { token: invite.token })).status,
      404
    );
  });

  test("series can be shared read-only or for editing, and only by their owner", async () => {
    const alice = app.browser();
    const { body: series } = await alice.post("/api/series", CREATE_BODY);
    const base = `/api/series/${series.id}`;
    const viewer = app.browser();
    await viewer.post("/api/invites/accept", {
      token: (await alice.post(`${base}/invites`, { role: "viewer" })).body.token
    });
    assert.equal((await viewer.get(base)).body.viewer.role, "viewer");
    assert.equal((await viewer.post(`${base}/game`, { blueTeam: "Alpha" })).status, 403);
    assert.equal((await viewer.delete(base)).status, 403);

    const editor = app.browser();
    await editor.post("/api/invites/accept", {
      token: (await alice.post(`${base}/invites`, { role: "editor" })).body.token
    });
    assert.equal((await editor.post(`${base}/game`, { blueTeam: "Alpha" })).status, 200);
    assert.equal((await editor.delete(base)).status, 403, "deletion is reserved to the creator");
    assert.equal((await alice.delete(base)).status, 200);
  });
});

describe("online series roles", { skip }, () => {
  async function onlineRoom() {
    const a = await app.signIn("Alpha");
    const b = await app.signIn("Bravo");
    const created = await a.browser.post("/api/online/series", { ...CREATE_BODY, bestOf: 1 });
    assert.equal(created.status, 200, created.text);
    const joined = await b.browser.post(`/api/online/${created.body.online.invitationCode}/join`);
    assert.equal(joined.status, 200, joined.text);
    return {
      a,
      b,
      id: created.body.id,
      base: `/api/series/${created.body.id}`,
      code: created.body.online.invitationCode
    };
  }

  test("only the creator sees the invitation code; only two Google players can join", async () => {
    const { a, b, id, code } = await onlineRoom();
    assert.equal((await b.browser.get(`/api/series/${id}`)).body.online.invitationCode, undefined);
    assert.equal((await a.browser.get(`/api/series/${id}`)).body.online.invitationCode, code);
    const third = await app.signIn("Third");
    assert.equal((await third.browser.post(`/api/online/${code}/join`)).status, 409);
    assert.equal((await third.browser.get(`/api/series/${id}`)).status, 404);
    assert.equal((await app.browser().post(`/api/online/${code}/join`)).status, 401);
    assert.equal(
      (await a.browser.post(`/api/online/${code}/join`)).status,
      400,
      "cannot join your own room"
    );
    assert.equal((await third.browser.post("/api/online/zzzz/join")).status, 404);
  });

  test("start, result and duration belong to the creator; both players run the ready check; picks follow the turn", async () => {
    const { a, b, base } = await onlineRoom();
    assert.equal((await b.browser.post(`${base}/game`, { blueTeam: "Alpha" })).status, 403);
    assert.equal((await a.browser.post(`${base}/game`, { blueTeam: "Alpha" })).status, 200);

    assert.equal(
      (await a.browser.post(`${base}/game/action`, { heroId: "h01" })).status,
      400,
      "draft not started yet"
    );
    assert.equal(
      (await a.browser.post(`${base}/game/ready`)).body.currentGame.draft.started,
      false
    );
    assert.equal((await b.browser.post(`${base}/game/ready`)).body.currentGame.draft.started, true);

    assert.equal(
      (await b.browser.post(`${base}/game/action`, { heroId: "h01" })).status,
      403,
      "it is Alpha's (blue) turn"
    );
    assert.equal((await a.browser.post(`${base}/game/action`, { heroId: "h01" })).status, 200);
    assert.equal(
      (await a.browser.post(`${base}/game/action`, { heroId: "h02" })).status,
      403,
      "now Bravo's turn"
    );
    assert.equal((await b.browser.post(`${base}/game/action`, { heroId: "h02" })).status, 200);

    assert.equal(
      (await b.browser.post(`${base}/game/timer/start`)).status,
      200,
      "either participant may run the game timer"
    );
    assert.equal(
      (await b.browser.post(`${base}/game/complete`, { winner: "Bravo", durationSeconds: 60 }))
        .status,
      403
    );
    assert.equal((await b.browser.delete(base)).status, 403, "only the creator deletes");
    assert.equal((await b.browser.post(`${base}/invites`, { role: "viewer" })).status, 404);
  });

  test("online series can only be shared read-only, and spectators cannot act", async () => {
    const { a, base } = await onlineRoom();
    assert.equal((await a.browser.post(`${base}/invites`, { role: "editor" })).status, 400);
    const invite = (await a.browser.post(`${base}/invites`, { role: "viewer" })).body;
    const spectator = app.browser();
    await spectator.post("/api/invites/accept", { token: invite.token });
    assert.equal((await spectator.get(base)).status, 200);
    assert.equal((await spectator.post(`${base}/game`, { blueTeam: "Alpha" })).status, 403);
    assert.equal((await spectator.post(`${base}/game/ready`)).status, 403);
    assert.equal((await spectator.post(`${base}/game/action`, { heroId: "h01" })).status, 403);
  });
});

describe("guest identity", { skip }, () => {
  test("a guest owns their data through a random httpOnly cookie, and it moves to the account on sign-in", async () => {
    const guest = app.browser();
    const { body: series } = await guest.post("/api/series", CREATE_BODY);
    const { body: list } = await guest.post("/api/tier-lists", {
      name: "Guest list",
      tiers: [],
      unranked: []
    });
    const cookieValue = [...guest.jar].find(([key]) => key === "hok_session")?.[1];
    assert.ok(cookieValue && cookieValue.length >= 43, "256-bit token");
    assert.equal((await guest.get("/api/auth/me")).body.guest, true);
    assert.equal((await guest.get("/api/auth/me")).body.user, null);

    const guestId = await ownerOf("series", series.id);
    const account = await app.signIn("Carol");
    await app.store.mergeGuestInto(guestId, account.user.id);

    assert.equal(await ownerOf("series", series.id), account.user.id);
    assert.equal(await ownerOf("tier_lists", list.id), account.user.id);
    assert.equal((await account.browser.get(`/api/series/${series.id}`)).status, 200);
    assert.equal(
      (await guest.get(`/api/series/${series.id}`)).status,
      404,
      "the old guest cookie is dead"
    );
    const [[remaining]] = await app.store.pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE id = ?",
      [guestId]
    );
    assert.equal(Number(remaining.n), 0);
  });

  test("anonymous reads never create a guest; two guests never share data", async () => {
    const [[before]] = await app.store.pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE is_guest = TRUE"
    );
    const reader = app.browser();
    await reader.get("/api/series");
    await reader.get("/api/tier-lists");
    await reader.get("/api/heroes");
    const [[after]] = await app.store.pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE is_guest = TRUE"
    );
    assert.equal(after.n, before.n);
    const one = app.browser();
    const two = app.browser();
    const { body: series } = await one.post("/api/series", CREATE_BODY);
    await two.post("/api/series", CREATE_BODY);
    assert.equal((await two.get(`/api/series/${series.id}`)).status, 404);
  });

  test("expired guests without data are purged, data owners are kept", async () => {
    const empty = await app.store.createGuestUser();
    const keeper = app.browser();
    const { body: series } = await keeper.post("/api/series", CREATE_BODY);
    await app.store.pool.query("DELETE FROM sessions WHERE user_id IN (?, ?)", [
      empty.id,
      await ownerOf("series", series.id)
    ]);
    const result = await app.store.purgeExpired();
    assert.ok(result.guests >= 1);
    const [[gone]] = await app.store.pool.query("SELECT COUNT(*) AS n FROM users WHERE id = ?", [
      empty.id
    ]);
    assert.equal(Number(gone.n), 0);
    const [[kept]] = await app.store.pool.query("SELECT COUNT(*) AS n FROM series WHERE id = ?", [
      series.id
    ]);
    assert.equal(Number(kept.n), 1);
  });
});

describe("legacy (orphan) rows", { skip }, () => {
  test("rows without an owner are invisible to everybody until claimed", async () => {
    const now = new Date().toISOString();
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const data = {
      id,
      createdAt: now,
      updatedAt: now,
      teamA: { name: "Old A" },
      teamB: { name: "Old B" },
      bestOf: 1,
      winsRequired: 1,
      gameMode: "free-for-all",
      status: "active",
      games: [],
      currentGame: null
    };
    await app.store.pool.query(
      "INSERT INTO series (id, data_json, created_at, updated_at, owner_user_id) VALUES (?, ?, ?, ?, NULL)",
      [id, JSON.stringify(data), now, now]
    );
    const dave = await app.signIn("Dave");
    assert.equal((await dave.browser.get(`/api/series/${id}`)).status, 404);
    assert.equal((await app.browser().get(`/api/series/${id}`)).status, 404);
    assert.ok((await app.store.countOrphans()).series >= 1);

    const claimed = await app.store.claimOrphans(dave.user.id);
    assert.ok(claimed.series >= 1);
    assert.equal((await dave.browser.get(`/api/series/${id}`)).body.teamA.name, "Old A");
    assert.equal((await app.store.countOrphans()).series, 0);
  });
});
