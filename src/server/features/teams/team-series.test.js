// A team shares series with its members: the creator of a series who leads a team (owner, manager or
// coach) puts the series on the team, every member then reads it (in the application and through their
// API keys), nobody else does, and leaving the team ends the access.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { SERIES_TEAMS_MAX, canShareSeries } from "./team-domain.js";
import { CREATE_BODY, startTestServer } from "../../../testing/test-app.js";

describe("who may share a series with a team (pure)", () => {
  test("the owner, the managers and the coaches; nobody else", () => {
    for (const role of ["owner", "manager", "coach"]) {
      assert.equal(canShareSeries(role), true, role);
    }
    for (const role of ["captain", "analyst", "player", "sub", "", null, undefined]) {
      assert.equal(canShareSeries(role), false, String(role));
    }
    assert.ok(SERIES_TEAMS_MAX >= 1 && SERIES_TEAMS_MAX <= 20);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

let teamNumber = 0;
/** A team made by `owner`, with `members` as { person, role }. */
async function makeTeam(owner, members = []) {
  teamNumber += 1;
  const created = await owner.browser.post("/api/teams", {
    name: `Shared Team ${teamNumber} ${Date.now()}`,
    tag: (Date.now() + teamNumber).toString(36).toUpperCase().slice(-5),
    level: "amateur",
    region: "EU",
    timezone: "UTC+0"
  });
  assert.equal(created.status, 201, created.text);
  for (const { person, role } of members) {
    await app.store.pool.execute(
      "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, '', ?)",
      [created.body.id, person.user.id, role, Date.now()]
    );
  }
  return created.body.id;
}

const newSeries = async person => {
  const created = await person.browser.post("/api/series", CREATE_BODY);
  assert.equal(created.status, 200, created.text);
  return created.body.id;
};
const key = async person => {
  const made = await person.browser.post("/api/me/api-keys", { name: "reader" });
  return { authorization: `Bearer ${made.body.secret}` };
};

describe("series shared with a team", { skip }, () => {
  test("the creator who leads the team shares; the members read, only read; the others see nothing", async () => {
    const [creator, member, coach, outsider] = await Promise.all(
      ["Creator", "Member", "Coach", "Outsider"].map(name => app.signIn(name))
    );
    const teamId = await makeTeam(creator, [
      { person: member, role: "player" },
      { person: coach, role: "coach" }
    ]);
    const seriesId = await newSeries(creator);

    // before: nobody else sees it
    for (const person of [member, coach, outsider]) {
      assert.equal((await person.browser.get(`/api/series/${seriesId}`)).status, 404);
    }

    const shared = await creator.browser.put(`/api/series/${seriesId}/teams/${teamId}`);
    assert.equal(shared.status, 200, shared.text);
    assert.deepEqual(shared.body, { shared: true, added: true });
    assert.equal(
      (await creator.browser.put(`/api/series/${seriesId}/teams/${teamId}`)).body.added,
      false,
      "twice is once"
    );

    // after: every member reads it, as a viewer
    for (const person of [member, coach]) {
      const read = await person.browser.get(`/api/series/${seriesId}`);
      assert.equal(read.status, 200, read.text);
      assert.equal(read.body.viewer.role, "viewer");
      assert.equal(read.body.viewer.canDelete, false);
      const listed = await person.browser.get("/api/series");
      assert.ok(
        listed.body.items.some(item => item.id === seriesId),
        "in their list too"
      );
      const mine = await person.browser.get(`/api/teams/${teamId}/series`);
      assert.deepEqual(
        mine.body.items.map(item => item.id),
        [seriesId]
      );
    }
    assert.equal((await outsider.browser.get(`/api/series/${seriesId}`)).status, 404);
    assert.equal(
      (await outsider.browser.get(`/api/teams/${teamId}/series`)).status,
      404,
      "the team does not exist for somebody who is not in it"
    );

    // a member only reads
    assert.equal((await member.browser.delete(`/api/series/${seriesId}`)).status, 403);
    assert.equal((await member.browser.post(`/api/series/${seriesId}/game`, {})).status, 403);
    assert.equal((await member.browser.put(`/api/series/${seriesId}/teams/${teamId}`)).status, 403);
    assert.equal(
      (await member.browser.delete(`/api/series/${seriesId}/teams/${teamId}`)).status,
      403,
      "a simple member cannot take it off the team"
    );
    assert.equal((await member.browser.get(`/api/series/${seriesId}/teams`)).status, 403);

    // through an API key: the same series, the same rules
    const bearer = await key(member);
    const viaKey = await app.browser().get(`/api/v1/series/${seriesId}`, bearer);
    assert.equal(viaKey.status, 200);
    assert.equal(viaKey.body.viewer.role, "viewer");
    assert.ok(
      (await app.browser().get("/api/v1/series", bearer)).body.items.some(
        item => item.id === seriesId
      )
    );
    assert.equal(
      (await app.browser().get(`/api/v1/teams/${teamId}/series`, bearer)).body.items.length,
      1
    );
    assert.equal(
      (await app.browser().get(`/api/v1/series/${seriesId}`, await key(outsider))).status,
      404
    );

    // it is not in the statistics of the member: "your scrims" are the ones they played
    assert.equal(
      (await member.browser.get("/api/stats/overview")).body.totals?.series ?? 0,
      0,
      "a shared series is not one of their scrims"
    );

    // the creator sees where it is, and takes it off
    const where = await creator.browser.get(`/api/series/${seriesId}/teams`);
    assert.deepEqual(
      where.body.shared.map(team => team.id),
      [teamId]
    );
    assert.deepEqual(where.body.available, []);
    assert.equal(
      (await creator.browser.delete(`/api/series/${seriesId}/teams/${teamId}`)).status,
      200
    );
    assert.equal((await member.browser.get(`/api/series/${seriesId}`)).status, 404, "access ends");
    assert.equal(
      (await creator.browser.delete(`/api/series/${seriesId}/teams/${teamId}`)).status,
      404,
      "not on the team any more"
    );
  });

  test("a leader of the team takes a series off it, but cannot share the series of somebody else", async () => {
    const [creator, coach, stranger] = await Promise.all(
      ["Maker", "TeamCoach", "Unrelated"].map(name => app.signIn(name))
    );
    const teamId = await makeTeam(creator, [{ person: coach, role: "coach" }]);
    const seriesId = await newSeries(creator);
    await creator.browser.put(`/api/series/${seriesId}/teams/${teamId}`);

    assert.equal(
      (await coach.browser.put(`/api/series/${seriesId}/teams/${teamId}`)).status,
      403,
      "they do not own the series"
    );
    assert.equal(
      (await coach.browser.delete(`/api/series/${seriesId}/teams/${teamId}`)).status,
      200,
      "but the team's coach can take it off their team"
    );
    assert.equal(
      (await stranger.browser.delete(`/api/series/${seriesId}/teams/${teamId}`)).status,
      404
    );
  });

  test("a creator who is only a player of the team cannot share; a team they are not in does not exist", async () => {
    const [leader, player, other] = await Promise.all(
      ["Boss", "JustAPlayer", "OtherLeader"].map(name => app.signIn(name))
    );
    const teamId = await makeTeam(leader, [{ person: player, role: "player" }]);
    const otherTeam = await makeTeam(other);
    const seriesId = await newSeries(player);

    const refused = await player.browser.put(`/api/series/${seriesId}/teams/${teamId}`);
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /owner, a manager or a coach/);
    assert.equal(
      (await player.browser.put(`/api/series/${seriesId}/teams/${otherTeam}`)).status,
      404,
      "a team they are not in"
    );
    assert.equal(
      (await leader.browser.get(`/api/series/${seriesId}`)).status,
      404,
      "still private"
    );
    assert.equal((await player.browser.put(`/api/series/${seriesId}/teams/not-an-id`)).status, 400);
  });

  test("leaving the team ends the access; a series is on a few teams at most", async () => {
    const [creator, member, founder] = await Promise.all(
      ["Host", "Leaver", "Founder"].map(name => app.signIn(name))
    );
    const teamId = await makeTeam(creator, [{ person: member, role: "player" }]);
    const seriesId = await newSeries(creator);
    await creator.browser.put(`/api/series/${seriesId}/teams/${teamId}`);
    assert.equal((await member.browser.get(`/api/series/${seriesId}`)).status, 200);
    await app.store.removeTeamMember(teamId, member.user.id);
    assert.equal((await member.browser.get(`/api/series/${seriesId}`)).status, 404);

    const extra = [];
    for (let index = 0; index < SERIES_TEAMS_MAX; index += 1) {
      // teams of somebody else, where the creator coaches (a person owns at most five teams)
      extra.push(await makeTeam(founder, [{ person: creator, role: "coach" }]));
    }
    let added = 0;
    let refused = null;
    for (const id of extra) {
      const answer = await creator.browser.put(`/api/series/${seriesId}/teams/${id}`);
      if (answer.status === 200) {
        added += 1;
      } else {
        refused = answer;
      }
    }
    assert.equal(added, SERIES_TEAMS_MAX - 1, "the first team counts");
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "too_many_teams");
  });

  test("deleting a series or a team removes the sharing", async () => {
    const creator = await app.signIn("Cleaner");
    const teamId = await makeTeam(creator);
    const seriesId = await newSeries(creator);
    await creator.browser.put(`/api/series/${seriesId}/teams/${teamId}`);
    const count = async () =>
      Number(
        (
          await app.store.pool.query("SELECT COUNT(*) AS n FROM team_series WHERE series_id = ?", [
            seriesId
          ])
        )[0][0].n
      );
    assert.equal(await count(), 1);
    assert.equal((await creator.browser.delete(`/api/series/${seriesId}`)).status, 200);
    assert.equal(await count(), 0, "gone with the series");
  });
});
