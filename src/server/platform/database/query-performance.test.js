// What scripts/performance/api-probe.mjs found on a database with thousands of rows, pinned so that it
// stays fixed:
//  - the lists of series and tier lists are read through the person's own rows (a UNION of two index
//    lookups) and still show exactly what the old `OR` showed: what they own plus what is shared with
//    them, never someone else's;
//  - a page boundary never swaps two series saved in the same millisecond;
//  - a person who runs no team costs one query to list their requests;
//  - the reminder loop asks what it already sent ONCE for all the events of the window, not once per event;
//  - the two indexes of migration 030 exist (the plans themselves are the probe's job: on a few rows the
//    optimizer is right to read the whole table).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { loadConfig } from "../../config.js";
import { createStore } from "./store.js";
import { CREATE_BODY, startTestServer } from "../../../testing/test-app.js";
import { recordStatements } from "../../../testing/sql-recorder.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const idsOf = response => response.body.items.map(item => item.id).sort();

describe("the series a person sees", { skip }, () => {
  const setup = async () => {
    const [alice, bob, carol] = await Promise.all(["Alice", "Bob", "Carol"].map(app.signIn));
    const make = async who => (await who.browser.post("/api/series", CREATE_BODY)).body.id;
    const mine = [await make(alice), await make(alice)];
    const his = [await make(bob), await make(bob)];
    // one of Bob's series is shared with Alice (what accepting an invitation writes)
    await app.store.pool.query(
      "INSERT INTO series_members (series_id, user_id, role, created_at) VALUES (?, ?, 'viewer', ?)",
      [his[0], alice.user.id, new Date().toISOString()]
    );
    return { alice, bob, carol, mine, his };
  };

  test("the ones they own plus the ones shared with them, and nobody else's", async () => {
    const { alice, bob, carol, mine, his } = await setup();
    const listed = await alice.browser.get("/api/series?pageSize=50");
    assert.deepEqual(idsOf(listed), [...mine, his[0]].sort());
    assert.equal(listed.body.total, 3);
    assert.deepEqual(idsOf(await bob.browser.get("/api/series?pageSize=50")), [...his].sort());
    assert.equal((await carol.browser.get("/api/series")).body.total, 0);
    // the shared one carries the role that was given, the owned ones are "owner"
    const roles = Object.fromEntries(listed.body.items.map(item => [item.id, item.viewer.role]));
    assert.equal(roles[mine[0]], "owner");
    assert.equal(roles[his[0]], "viewer");
  });

  test("filters apply to the visible set only, and the overview counts it", async () => {
    const { alice, mine } = await setup();
    await app.store.pool.query("UPDATE series SET status = 'complete' WHERE id = ?", [mine[0]]);
    const finished = await alice.browser.get("/api/series?status=complete&pageSize=50");
    assert.deepEqual(idsOf(finished), [mine[0]]);
    assert.equal(finished.body.total, 1);
    const counts = (await alice.browser.get("/api/overview")).body.counts;
    assert.ok(counts.series >= 3, "owned + shared are counted");
  });

  test("two series saved in the same instant keep their order from one page to the next", async () => {
    const { alice, mine, his } = await setup();
    const shared = [...mine, his[0]];
    await app.store.pool.query("UPDATE series SET updated_at = ? WHERE id IN (?)", [
      "2026-01-01T00:00:00.000Z",
      shared
    ]);
    const walk = async () => {
      const seen = [];
      for (let page = 1; page <= 3; page += 1) {
        const response = await alice.browser.get(`/api/series?pageSize=1&page=${page}`);
        seen.push(...response.body.items.map(item => item.id));
      }
      return seen;
    };
    const first = await walk();
    // the id breaks the tie, so the order is the ids' own: stable, and the same for every page
    assert.deepEqual(
      first,
      [...shared].sort(),
      "each series once, none skipped, ties broken by id"
    );
    assert.deepEqual(await walk(), first, "and in the same order the second time");
  });

  test("a series nobody owns any more is seen by the people it is shared with, not by its old owner", async () => {
    const { alice, bob, mine, his } = await setup();
    await app.store.pool.query("UPDATE series SET owner_user_id = NULL WHERE id = ?", [mine[0]]);
    await app.store.pool.query(
      "INSERT INTO series_members (series_id, user_id, role, created_at) VALUES (?, ?, 'viewer', ?)",
      [mine[0], bob.user.id, new Date().toISOString()]
    );
    assert.ok(idsOf(await bob.browser.get("/api/series?pageSize=50")).includes(mine[0]));
    assert.ok(!idsOf(await alice.browser.get("/api/series?pageSize=50")).includes(mine[0]));
    const rest = await alice.browser.get("/api/series?pageSize=50");
    assert.deepEqual(
      idsOf(rest),
      [mine[1], his[0]].sort(),
      "her other one and the one shared with her"
    );
  });

  test("the statistics read the scrims they created or played in, not the shared ones", async () => {
    const { alice, bob, mine, his } = await setup();
    // Bob's second series is an online one in which Alice is the other team
    await app.store.pool.query(
      "INSERT INTO online_series (series_id, invitation_code, team_a_user_id, team_b_user_id) VALUES (?, ?, ?, ?)",
      [his[1], `code-${randomUUID()}`, bob.user.id, alice.user.id]
    );
    const listed = await app.store.listOwnScrims(alice.user.id);
    assert.deepEqual(listed.map(series => series.id).sort(), [...mine, his[1]].sort());
    assert.equal(await app.store.countOwnScrims(alice.user.id), 3);
    assert.equal(await app.store.countOwnScrims(alice.user.id, { status: "complete" }), 0);
    assert.ok(!listed.some(series => series.id === his[0]), "the merely shared one is left out");
  });
});

describe("the tournament games", { skip }, () => {
  const insert = async (day, picks) => {
    const id = randomUUID();
    await app.store.pool.query(
      "INSERT INTO competitive_series (id, event, stage, team_a, team_b, best_of, rule, played_on, patch, source_url, note, created_at, updated_at) VALUES (?, 'Cup', 'Final', 'A', 'B', 3, 'free-for-all', ?, '1.0', '', '', ?, ?)",
      [id, day, Date.now(), Date.now()]
    );
    await app.store.pool.query(
      "INSERT INTO competitive_games (id, series_id, game_number, blue_team, red_team, winner, duration_seconds, draft_json) VALUES (?, ?, 1, 'A', 'B', 'A', 1200, ?)",
      [randomUUID(), id, JSON.stringify({ bans: { blue: [], red: [] }, picks, pickLanes: {} })]
    );
  };

  test("a date picked by the visitor cuts the games, and costs one query per month, not per date", async () => {
    await insert("2031-03-10", { blue: ["h01"], red: ["h02"] });
    await insert("2031-03-25", { blue: ["h03"], red: ["h04"] });
    await app.store.deleteTournament(randomUUID()); // any tournament write: forget what was kept
    const { result, statements } = await recordStatements(app.store.pool, async () => {
      const early = await app.store.competitiveGames("2031-03-05");
      const late = await app.store.competitiveGames("2031-03-20");
      const lateAgain = await app.store.competitiveGames("2031-03-26");
      const everything = await app.store.competitiveGames(null);
      return { early, late, lateAgain, everything };
    });
    // the query has no ORDER BY (nothing reads the games in an order): compare them sorted
    const days = games =>
      games
        .filter(game => game.playedOn.startsWith("2031-03"))
        .map(game => game.playedOn)
        .sort();
    assert.deepEqual(days(result.early), ["2031-03-10", "2031-03-25"]);
    assert.deepEqual(days(result.late), ["2031-03-25"]);
    assert.deepEqual(days(result.lateAgain), []);
    assert.ok(days(result.everything).length >= 2);
    const reads = statements.filter(sql => /FROM competitive_games/.test(sql));
    assert.equal(reads.length, 2, `one read for the month and one for "all":\n${reads.join("\n")}`);
  });
});

describe("the tier lists a person sees", { skip }, () => {
  test("the ones they own plus the ones shared with them, searched and counted", async () => {
    const [alice, bob] = await Promise.all(["Alice", "Bob"].map(app.signIn));
    const make = async (who, name) =>
      (await who.browser.post("/api/tier-lists", { name, lane: "Jungle", tiers: [], unranked: [] }))
        .body.id;
    const mine = await make(alice, "Alice jungle");
    const shared = await make(bob, "Bob shared jungle");
    const secret = await make(bob, "Bob private");
    await app.store.pool.query(
      "INSERT INTO tier_list_members (tier_list_id, user_id, role, created_at) VALUES (?, ?, 'viewer', ?)",
      [shared, alice.user.id, new Date().toISOString()]
    );
    const listed = await alice.browser.get("/api/tier-lists");
    assert.deepEqual(idsOf(listed), [mine, shared].sort());
    assert.equal(listed.body.total, 2);
    assert.ok(!idsOf(listed).includes(secret));
    const found = await alice.browser.get("/api/tier-lists?q=shared");
    assert.deepEqual(idsOf(found), [shared]);
    assert.equal(found.body.total, 1);
    const byLane = await alice.browser.get("/api/tier-lists?lane=Jungle");
    assert.equal(byLane.body.total, 2);
  });
});

describe("the request list and the reminder loop", { skip }, () => {
  test("a person who runs no team costs one query and gets an empty list", async () => {
    const { user } = await app.signIn("Nobody");
    const { result, statements } = await recordStatements(app.store.pool, () =>
      app.store.listRequests(user.id)
    );
    assert.deepEqual(result, []);
    assert.equal(statements.length, 1, statements.join("\n"));
    assert.match(statements[0], /FROM team_members/);
  });

  test("the reminder loop reads what it already sent once, whatever the number of events", async () => {
    const HOUR = 3_600_000;
    const owner = await app.signIn("Captain");
    const team = (
      await owner.browser.post("/api/teams", {
        name: `Reminders ${randomUUID().slice(0, 6)}`,
        tag: randomUUID().slice(0, 4).toUpperCase(),
        level: "amateur",
        region: "EU",
        timezone: "UTC",
        languages: ["en"]
      })
    ).body;
    const start = Date.now() + 3 * HOUR;
    for (let index = 0; index < 5; index += 1) {
      const at = start + index * 60_000;
      const created = await owner.browser.post(`/api/teams/${team.id}/events`, {
        kind: "scrim",
        title: `Scrim ${index}`,
        startsAt: new Date(at).toISOString(),
        endsAt: new Date(at + 2 * HOUR).toISOString()
      });
      assert.equal(created.status, 201, created.text);
    }
    const first = await recordStatements(app.store.pool, () => app.store.dueReminders(Date.now()));
    assert.equal(first.result.posts.length, 5, "one team post per event");
    const lookups = first.statements.filter(sql => /FROM event_reminders/.test(sql));
    assert.equal(lookups.length, 1, `one lookup for 5 events:\n${lookups.join("\n")}`);
    const again = await recordStatements(app.store.pool, () => app.store.dueReminders(Date.now()));
    assert.equal(again.result.posts.length, 0, "and nothing is sent twice");
    assert.ok(
      again.statements.length <= 3,
      `a quiet minute stays short:\n${again.statements.join("\n")}`
    );
  });

  test("migration 031 added the three indexes the audit of the SQL asked for", async () => {
    const [rows] = await app.store.pool.query(
      "SELECT table_name AS t, index_name AS i, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('idx_users_guest', 'idx_reflex_runs_score', 'idx_notifications_recent') GROUP BY table_name, index_name ORDER BY index_name"
    );
    assert.deepEqual(
      rows.map(row => [row.t, row.i, row.c]),
      [
        ["users", "idx_users_guest", "is_guest"],
        ["notifications", "idx_notifications_recent", "user_id,created_at"],
        ["reflex_runs", "idx_reflex_runs_score", "user_id,exercise,score"]
      ].sort((a, b) => a[1].localeCompare(b[1]))
    );
  });

  test("migration 030 added the two indexes the probe asked for", async () => {
    const [rows] = await app.store.pool.query(
      "SELECT table_name AS t, index_name AS i, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('idx_team_events_starts', 'idx_requests_awaiting') GROUP BY table_name, index_name ORDER BY index_name"
    );
    assert.deepEqual(
      rows.map(row => [row.t, row.i, row.c]),
      [
        ["scrim_requests", "idx_requests_awaiting", "awaiting_team_id,status"],
        ["team_events", "idx_team_events_starts", "starts_at"]
      ]
    );
  });
});

describe("the connection pool", { skip }, () => {
  const settings = env => loadConfig({ NODE_ENV: "test", DB_PASSWORD: "x", ...env }).db;
  const sizes = db => [db.connectionLimit, db.queueLimit, db.connectTimeout];

  test("size, queue and timeout come from the environment, with safe fallbacks", () => {
    assert.deepEqual(sizes(settings({})), [10, 0, 10_000], "the defaults of before");
    assert.deepEqual(
      sizes(settings({ DB_POOL_SIZE: "25", DB_QUEUE_LIMIT: "200", DB_CONNECT_TIMEOUT_MS: "3000" })),
      [25, 200, 3000]
    );
    // a value that makes no sense is ignored, never half-applied (compose passes an empty one when unset)
    for (const bad of ["", "0", "-3", "abc", "1.5", "500"]) {
      assert.equal(settings({ DB_POOL_SIZE: bad }).connectionLimit, 10, `DB_POOL_SIZE=${bad}`);
    }
    assert.equal(settings({ DB_QUEUE_LIMIT: "-1" }).queueLimit, 0);
    assert.equal(settings({ DB_CONNECT_TIMEOUT_MS: "5" }).connectTimeout, 10_000);
  });

  test("the pool is built with them, and a full queue fails at once instead of waiting", async () => {
    const store = createStore({ ...app.database.config, connectionLimit: 1, queueLimit: 1 });
    try {
      assert.equal(store.pool.pool.config.connectionLimit, 1);
      assert.equal(store.pool.pool.config.queueLimit, 1);
      const held = await store.pool.getConnection(); // the only connection is busy
      const waiting = store.pool.query("SELECT 1 AS one"); // the one place in the queue
      await assert.rejects(store.pool.query("SELECT 2 AS two"), /queue limit/i);
      held.release();
      const [[row]] = await waiting;
      assert.equal(row.one, 1, "and the one that waited is answered once the connection is back");
    } finally {
      await store.closeDatabase();
    }
  });
});

describe("readiness during a shutdown", { skip }, () => {
  test("GET /api/health answers 503 once the instance drains, liveness stays up", async () => {
    const ask = path => fetch(`${app.baseUrl}${path}`);
    assert.equal((await ask("/api/health")).status, 200);
    app.expressApp.locals.draining = true;
    try {
      const draining = await ask("/api/health");
      assert.equal(draining.status, 503);
      assert.deepEqual(await draining.json(), { status: "draining" });
      assert.equal(
        (await ask("/api/health/live")).status,
        200,
        "the process is alive, just leaving"
      );
    } finally {
      app.expressApp.locals.draining = false;
    }
    assert.equal((await ask("/api/health")).status, 200);
  });

  test("the drain time comes from SHUTDOWN_DRAIN_SECONDS (0 by default)", () => {
    const drain = env => loadConfig({ NODE_ENV: "test", DB_PASSWORD: "x", ...env }).shutdownDrainMs;
    assert.equal(drain({}), 0);
    assert.equal(drain({ SHUTDOWN_DRAIN_SECONDS: "8" }), 8000);
    assert.equal(drain({ SHUTDOWN_DRAIN_SECONDS: "" }), 0);
    assert.equal(drain({ SHUTDOWN_DRAIN_SECONDS: "999" }), 0, "out of range: ignored");
  });
});
