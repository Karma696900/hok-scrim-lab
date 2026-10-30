// Fills a throw-away database with a lot of made-up data, calls the real API routes as a signed-in viewer
// and reports, for each route: time, number of SQL statements, size on the wire (raw / gzip / brotli) and
// the cache headers. Every SELECT it saw is then passed to EXPLAIN, and the ones that read many rows,
// scan a whole table or sort without an index are listed.
//
// The point is to catch what a nearly empty development database hides: a request whose cost depends on
// the size of the WHOLE table instead of the viewer's own rows, a list that fires one query per row (the
// statement count of the "busy" viewer must stay close to the one of the "quiet" viewer), a payload that
// grows without a limit.
//
//   node scripts/performance/api-probe.mjs [--scale=1] [--only=<regex>] [--json=<file>] [--quiet]
//
// Nothing here touches the development database: the data lives in a `hok_test_<random>` database that is
// dropped at the end, and no request leaves the machine.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { CREATE_BODY, startTestServer } from "../../src/testing/test-app.js";

const argument = name => process.argv.find(item => item.startsWith(`--${name}=`))?.split("=")[1];
const SCALE = Number(argument("scale") ?? 1);
const ONLY = argument("only") ? new RegExp(argument("only"), "i") : null;
const JSON_FILE = argument("json");
const QUIET = process.argv.includes("--quiet");
// --keep leaves the filled database in place to run EXPLAIN by hand; drop it afterwards
// (node scripts/database/drop-test-databases.mjs --apply, once it is older than ten minutes)
const KEEP = process.argv.includes("--keep");
const RUNS = 5;

/** A seeded generator: two runs with the same scale see the same data. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = random(20261010);
const int = (max, min = 0) => min + Math.floor(rand() * (max - min));
const pick = list => list[int(list.length)];
const iso = ms => new Date(ms).toISOString();

async function bulk(pool, table, columns, rows, chunk = 2000) {
  for (let index = 0; index < rows.length; index += chunk) {
    await pool.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ?`, [
      rows.slice(index, index + chunk)
    ]);
  }
}

// ---- SQL statements seen during a request ---------------------------------------------------------------------

function watch(pool) {
  const seen = { current: null };
  const record = (verb, original) =>
    function recorded(sql, ...rest) {
      const started = process.hrtime.bigint();
      const finish = () => {
        if (seen.current && typeof sql === "string") {
          seen.current.push({
            sql,
            params: rest[0],
            ms: Number(process.hrtime.bigint() - started) / 1e6
          });
        }
      };
      const result = original.call(this, sql, ...rest);
      result.then(finish, finish);
      return result;
    };
  pool.query = record("query", pool.query);
  pool.execute = record("execute", pool.execute);
  const getConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => {
    const connection = await getConnection();
    if (!connection.__watched) {
      connection.__watched = true;
      connection.query = record("query", connection.query);
      connection.execute = record("execute", connection.execute);
    }
    return connection;
  };
  return seen;
}

// ---- Size on the wire -------------------------------------------------------------------------------------------

function fetchEncoded(baseUrl, path, cookie, encoding, extra = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      baseUrl + path,
      { headers: { cookie, "accept-encoding": encoding, "accept-language": "en", ...extra } },
      response => {
        let bytes = 0;
        response.on("data", chunk => (bytes += chunk.length));
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, bytes })
        );
      }
    );
    request.on("error", reject);
  });
}

/** The statements that ran three times or more inside ONE request: one query per row of a list. */
function repeatedStatements(statements) {
  const counts = new Map();
  for (const item of statements) {
    const key = item.sql.replace(/\s+/g, " ").trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= 3)
    .map(([sql, count]) => `${count}x ${sql.slice(0, 90)}`);
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const kb = bytes => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

// ---- Main ----------------------------------------------------------------------------------------------------

const app = await startTestServer();
if (!app) {
  console.error("MySQL is not reachable: start it with `docker compose up -d mysql`.");
  process.exit(1);
}

try {
  const pool = app.store.pool;
  const heavy = await app.signIn("Heavy");
  const quiet = await app.signIn("Quiet");
  const heavyCookie = [...heavy.browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const quietCookie = [...quiet.browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");

  // a real series to copy (its JSON has the real shape and size)
  const sample = await heavy.browser.post("/api/series", CREATE_BODY);
  const sampleId = sample.body.id;
  const [[sampleRow]] = await pool.query("SELECT data_json FROM series WHERE id = ?", [sampleId]);
  const sampleJson = sampleRow.data_json;
  await pool.query("DELETE FROM series WHERE id = ?", [sampleId]);

  const sampleTier = await heavy.browser.post("/api/tier-lists", {
    name: "Sample",
    lane: "Jungle",
    tiers: [],
    unranked: []
  });
  const [[tierRow]] = await pool.query("SELECT data_json FROM tier_lists WHERE id = ?", [
    sampleTier.body.id
  ]);
  const tierSampleJson = tierRow.data_json;
  const tierSampleId = sampleTier.body.id;
  await pool.query("DELETE FROM tier_lists WHERE id = ?", [tierSampleId]);

  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  const N = {
    users: Math.round(3000 * SCALE),
    series: Math.round(30000 * SCALE),
    members: Math.round(20000 * SCALE),
    tierLists: Math.round(6000 * SCALE),
    notifications: Math.round(60000 * SCALE),
    authEvents: Math.round(100000 * SCALE),
    reflexRuns: Math.round(60000 * SCALE),
    notes: Math.round(30000 * SCALE),
    teams: Math.round(600 * SCALE),
    events: Math.round(20000 * SCALE),
    posts: Math.round(6000 * SCALE),
    requests: Math.round(8000 * SCALE),
    messages: Math.round(20000 * SCALE),
    spaceBuilds: Math.round(15000 * SCALE),
    tournamentSeries: Math.round(800 * SCALE)
  };

  const seedStart = Date.now();
  // users
  const userIds = [heavy.user.id, quiet.user.id];
  const userRows = [];
  for (let index = 0; index < N.users; index += 1) {
    const id = randomUUID();
    userIds.push(id);
    userRows.push([
      id,
      `sub-${id}`,
      `p${index}@example.test`,
      `Player ${index}`,
      "",
      `P${index.toString(36).toUpperCase().padStart(5, "0")}`.slice(0, 8),
      iso(now - int(YEAR)),
      iso(now - int(YEAR / 2)),
      1
    ]);
  }
  await bulk(
    pool,
    "users",
    [
      "id",
      "google_subject",
      "email",
      "name",
      "picture",
      "tag",
      "created_at",
      "updated_at",
      "profile_complete"
    ],
    userRows
  );
  const someUser = () => pick(userIds);

  // series: the heavy viewer owns 60 and is a member of 15 more, the quiet one owns 2
  const seriesIds = [];
  const seriesRows = [];
  const seriesOwner = new Map();
  const online = [];
  const makeSeries = owner => {
    const id = randomUUID();
    seriesIds.push(id);
    seriesOwner.set(id, owner);
    const updated = now - int(YEAR);
    seriesRows.push([
      id,
      sampleJson.split(sampleId).join(id),
      iso(updated - int(86400000)),
      iso(updated),
      owner,
      1,
      pick(["active", "active", "finished"]),
      `Team ${int(900)}`,
      `Team ${int(900)}`,
      pick([1, 3, 5]),
      "free-for-all",
      "solo",
      int(5)
    ]);
    if (rand() < 0.3) {
      online.push([id, `inv-${id}`, owner, rand() < 0.5 ? someUser() : null]);
    }
    return id;
  };
  for (let index = 0; index < 60; index += 1) {
    makeSeries(heavy.user.id);
  }
  for (let index = 0; index < 2; index += 1) {
    makeSeries(quiet.user.id);
  }
  for (let index = 0; index < N.series; index += 1) {
    makeSeries(someUser());
  }
  await bulk(
    pool,
    "series",
    [
      "id",
      "data_json",
      "created_at",
      "updated_at",
      "owner_user_id",
      "version",
      "status",
      "team_a_name",
      "team_b_name",
      "best_of",
      "game_mode",
      "draft_mode",
      "games_count"
    ],
    seriesRows,
    300
  );
  await bulk(
    pool,
    "online_series",
    ["series_id", "invitation_code", "team_a_user_id", "team_b_user_id"],
    online
  );
  const memberKeys = new Set();
  const memberRows = [];
  const addMember = (seriesId, user) => {
    const key = `${seriesId}|${user}`;
    if (memberKeys.has(key) || seriesOwner.get(seriesId) === user) {
      return;
    }
    memberKeys.add(key);
    memberRows.push([seriesId, user, pick(["viewer", "editor"]), iso(now - int(YEAR))]);
  };
  for (let index = 0; index < 15; index += 1) {
    addMember(pick(seriesIds), heavy.user.id);
  }
  for (let index = 0; index < N.members; index += 1) {
    addMember(pick(seriesIds), someUser());
  }
  await bulk(pool, "series_members", ["series_id", "user_id", "role", "created_at"], memberRows);

  // tier lists
  const tierRows = [];
  const tierIds = [];
  const makeTier = owner => {
    const id = randomUUID();
    tierIds.push(id);
    tierRows.push([
      id,
      tierSampleJson.split(tierSampleId).join(id),
      iso(now - int(YEAR)),
      owner,
      1,
      "Jungle"
    ]);
  };
  for (let index = 0; index < 40; index += 1) {
    makeTier(heavy.user.id);
  }
  for (let index = 0; index < N.tierLists; index += 1) {
    makeTier(someUser());
  }
  await bulk(
    pool,
    "tier_lists",
    ["id", "data_json", "updated_at", "owner_user_id", "version", "lane"],
    tierRows
  );
  const tierMemberKeys = new Set();
  const tierMembers = [];
  for (let index = 0; index < Math.round(N.tierLists * 0.7); index += 1) {
    const tier = pick(tierIds);
    const user = index < 8 ? heavy.user.id : someUser();
    if (!tierMemberKeys.has(`${tier}|${user}`)) {
      tierMemberKeys.add(`${tier}|${user}`);
      tierMembers.push([tier, user, "viewer", iso(now - int(YEAR))]);
    }
  }
  await bulk(
    pool,
    "tier_list_members",
    ["tier_list_id", "user_id", "role", "created_at"],
    tierMembers
  );

  // notifications, security log, reflex runs, notes, builds
  const notificationRows = [];
  const notify = (user, unread) =>
    notificationRows.push([
      randomUUID(),
      user,
      pick(["request", "accepted", "reminder", "message"]),
      "{}",
      now - int(YEAR),
      unread ? null : now - int(86400000)
    ]);
  for (let index = 0; index < 250; index += 1) {
    notify(heavy.user.id, index < 50);
  }
  for (let index = 0; index < 3; index += 1) {
    notify(quiet.user.id, true);
  }
  for (let index = 0; index < N.notifications; index += 1) {
    notify(someUser(), rand() < 0.2);
  }
  await bulk(
    pool,
    "notifications",
    ["id", "user_id", "kind", "payload_json", "created_at", "read_at"],
    notificationRows
  );

  const eventRows = [];
  for (let index = 0; index < N.authEvents; index += 1) {
    eventRows.push([
      someUser(),
      pick(["login", "logout", "login_failed", "password_changed"]),
      "",
      "127.0.0.1",
      now - int(YEAR)
    ]);
  }
  await bulk(
    pool,
    "auth_events",
    ["user_id", "event", "detail", "ip", "created_at"],
    eventRows,
    5000
  );

  const reflexRows = [];
  const run = user =>
    reflexRows.push([
      randomUUID(),
      user,
      pick(["tracking", "flick", "reaction"]),
      int(1000),
      30000,
      now - int(YEAR)
    ]);
  for (let index = 0; index < 400; index += 1) {
    run(heavy.user.id);
  }
  for (let index = 0; index < N.reflexRuns; index += 1) {
    run(someUser());
  }
  await bulk(
    pool,
    "reflex_runs",
    ["id", "user_id", "exercise", "score", "duration_ms", "created_at"],
    reflexRows
  );

  const noteRows = [];
  const note = user =>
    noteRows.push([
      randomUUID(),
      user,
      pick(["goal", "vod", "combo", "note"]),
      null,
      `Note ${int(1000)}`,
      "x".repeat(200),
      pick(["todo", "doing", "done"]),
      null,
      now - int(YEAR),
      now - int(YEAR / 2),
      null,
      null
    ]);
  for (let index = 0; index < 150; index += 1) {
    note(heavy.user.id);
  }
  for (let index = 0; index < N.notes; index += 1) {
    note(someUser());
  }
  await bulk(
    pool,
    "training_notes",
    [
      "id",
      "user_id",
      "kind",
      "hero_id",
      "title",
      "body",
      "status",
      "steps_json",
      "created_at",
      "updated_at",
      "url",
      "marks_json"
    ],
    noteRows
  );

  const buildRows = [];
  const build = user =>
    buildRows.push([
      randomUUID(),
      user,
      "h01",
      `Build ${int(100)}`,
      15,
      JSON.stringify({ items: [], arcana: [] }),
      now - int(YEAR),
      now - int(YEAR / 2)
    ]);
  for (let index = 0; index < 40; index += 1) {
    build(heavy.user.id);
  }
  for (let index = 0; index < N.spaceBuilds; index += 1) {
    build(someUser());
  }
  await bulk(
    pool,
    "space_builds",
    ["id", "user_id", "hero_id", "name", "level", "build_json", "created_at", "updated_at"],
    buildRows
  );

  // teams: the heavy viewer owns one with a long agenda and belongs to another
  const teamIds = [];
  const teamRows = [];
  const teamMembers = [];
  const makeTeam = (owner, index) => {
    const id = randomUUID();
    teamIds.push(id);
    teamRows.push([
      id,
      `Team ${index}`,
      `team ${index}`,
      `T${index.toString(36).toUpperCase()}`.slice(0, 6),
      "",
      "EU",
      "UTC+1",
      "[]",
      "casual",
      owner,
      now - int(YEAR),
      now - int(YEAR / 2),
      20,
      0
    ]);
    teamMembers.push([id, owner, "owner", "Jungle", now - int(YEAR)]);
    const seated = new Set([owner]);
    for (let seat = 0; seat < 5; seat += 1) {
      const member = someUser();
      if (!seated.has(member)) {
        seated.add(member);
        teamMembers.push([
          id,
          member,
          "member",
          pick(["Jungle", "Mid Lane", "Roamer"]),
          now - int(YEAR)
        ]);
      }
    }
    return id;
  };
  const heavyTeam = makeTeam(heavy.user.id, 0);
  const sharedTeam = makeTeam(someUser(), 1);
  teamMembers.push([sharedTeam, heavy.user.id, "member", "Roamer", now]);
  const quietTeam = makeTeam(someUser(), 2);
  teamMembers.push([quietTeam, quiet.user.id, "member", "Mid Lane", now]);
  for (let index = 3; index < N.teams; index += 1) {
    makeTeam(someUser(), index);
  }
  await bulk(
    pool,
    "teams",
    [
      "id",
      "name",
      "name_key",
      "tag",
      "description",
      "region",
      "timezone",
      "languages_json",
      "level",
      "created_by",
      "created_at",
      "updated_at",
      "max_members",
      "logo_version"
    ],
    teamRows
  );
  await bulk(
    pool,
    "team_members",
    ["team_id", "user_id", "role", "lane", "joined_at"],
    teamMembers
  );

  const eventTeamRows = [];
  const teamEvent = (team, creator) => {
    const starts = now - 20 * 86400000 + int(60 * 86400000);
    eventTeamRows.push([
      randomUUID(),
      team,
      pick(["scrim", "training", "review", "tournament"]),
      `Event ${int(1000)}`,
      starts,
      starts + 3600000,
      "",
      creator,
      now - int(YEAR / 4),
      null
    ]);
  };
  for (let index = 0; index < 500; index += 1) {
    teamEvent(heavyTeam, heavy.user.id);
  }
  for (let index = 0; index < 40; index += 1) {
    teamEvent(quietTeam, quiet.user.id);
  }
  for (let index = 0; index < N.events; index += 1) {
    teamEvent(pick(teamIds), someUser());
  }
  await bulk(
    pool,
    "team_events",
    [
      "id",
      "team_id",
      "kind",
      "title",
      "starts_at",
      "ends_at",
      "note",
      "created_by",
      "created_at",
      "reminded_at"
    ],
    eventTeamRows
  );

  const postRows = [];
  const post = (team, creator) => {
    const starts = now - 10 * 86400000 + int(30 * 86400000);
    postRows.push([
      randomUUID(),
      team,
      creator,
      starts,
      starts + 7200000,
      pick([1, 3, 5]),
      "global-ban-pick",
      "mutual",
      "",
      now - int(86400000 * 10),
      rand() < 0.3 ? 1 : 0
    ]);
  };
  for (let index = 0; index < N.posts; index += 1) {
    post(pick(teamIds), someUser());
  }
  await bulk(
    pool,
    "scrim_posts",
    [
      "id",
      "team_id",
      "created_by",
      "starts_at",
      "ends_at",
      "format",
      "hero_rule",
      "control",
      "note",
      "created_at",
      "closed"
    ],
    postRows
  );

  const requestRows = [];
  const requestIds = [];
  const request = (from, to, creator) => {
    const id = randomUUID();
    requestIds.push([id, to, creator]);
    const starts = now - 10 * 86400000 + int(30 * 86400000);
    requestRows.push([
      id,
      from,
      to,
      null,
      creator,
      starts,
      starts + 7200000,
      3,
      "global-ban-pick",
      "mutual",
      "",
      pick(["pending", "accepted", "declined"]),
      to,
      now - int(86400000 * 20),
      now - int(86400000 * 5)
    ]);
  };
  for (let index = 0; index < 120; index += 1) {
    request(heavyTeam, pick(teamIds), heavy.user.id);
  }
  for (let index = 0; index < 80; index += 1) {
    request(pick(teamIds), heavyTeam, someUser());
  }
  for (let index = 0; index < N.requests; index += 1) {
    request(pick(teamIds), pick(teamIds), someUser());
  }
  await bulk(
    pool,
    "scrim_requests",
    [
      "id",
      "from_team_id",
      "to_team_id",
      "post_id",
      "created_by",
      "starts_at",
      "ends_at",
      "format",
      "hero_rule",
      "control",
      "note",
      "status",
      "awaiting_team_id",
      "created_at",
      "updated_at"
    ],
    requestRows
  );
  const messageRows = [];
  for (let index = 0; index < N.messages; index += 1) {
    const [id, team, creator] = pick(requestIds);
    messageRows.push([randomUUID(), id, creator, team, "text", "hello", now - int(86400000 * 20)]);
  }
  await bulk(
    pool,
    "request_messages",
    ["id", "request_id", "user_id", "team_id", "kind", "body", "created_at"],
    messageRows
  );

  // tournament games (the public popularity pages read all of them): about 3.5 games a series
  const tournamentRows = [];
  const tournamentGames = [];
  const heroPool = Array.from(
    { length: 30 },
    (_, index) => `h${String(index + 1).padStart(2, "0")}`
  );
  const five = () => {
    const chosen = new Set();
    while (chosen.size < 5) {
      chosen.add(pick(heroPool));
    }
    return [...chosen];
  };
  for (let index = 0; index < N.tournamentSeries; index += 1) {
    const id = randomUUID();
    const playedOn = new Date(now - int(2 * YEAR)).toISOString().slice(0, 10);
    tournamentRows.push([
      id,
      `Event ${int(40)}`,
      "Group",
      `Team ${int(60)}`,
      `Team ${int(60)}`,
      5,
      pick(["classic", "free-for-all", "global-ban-pick"]),
      playedOn,
      "1.0",
      "",
      "",
      heavy.user.id,
      now,
      now
    ]);
    for (let game = 1; game <= 3 + (index % 2); game += 1) {
      tournamentGames.push([
        randomUUID(),
        id,
        game,
        "Blue",
        "Red",
        pick(["Blue", "Red"]),
        1200,
        JSON.stringify({
          bans: { blue: five().slice(0, 3), red: five().slice(0, 3) },
          picks: { blue: five(), red: five() },
          pickLanes: {
            blue: ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"],
            red: ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"]
          }
        })
      ]);
    }
  }
  await bulk(
    pool,
    "competitive_series",
    [
      "id",
      "event",
      "stage",
      "team_a",
      "team_b",
      "best_of",
      "rule",
      "played_on",
      "patch",
      "source_url",
      "note",
      "created_by",
      "created_at",
      "updated_at"
    ],
    tournamentRows
  );
  await bulk(
    pool,
    "competitive_games",
    [
      "id",
      "series_id",
      "game_number",
      "blue_team",
      "red_team",
      "winner",
      "duration_seconds",
      "draft_json"
    ],
    tournamentGames
  );

  await pool.query(
    "ANALYZE TABLE users, series, series_members, online_series, tier_lists, tier_list_members, notifications, auth_events, reflex_runs, training_notes, space_builds, teams, team_members, team_events, scrim_posts, scrim_requests, request_messages, competitive_series, competitive_games"
  );
  if (!QUIET) {
    console.log(
      `seeded in ${((Date.now() - seedStart) / 1000).toFixed(1)} s: ${Object.entries(N)
        .map(([key, value]) => `${key} ${value}`)
        .join(", ")}`
    );
  }

  // ---- the routes ------------------------------------------------------------------------------------------------
  const [[ownedSeries]] = await pool.query(
    "SELECT id FROM series WHERE owner_user_id = ? LIMIT 1",
    [heavy.user.id]
  );
  const [[ownedTier]] = await pool.query(
    "SELECT id FROM tier_lists WHERE owner_user_id = ? LIMIT 1",
    [heavy.user.id]
  );
  const [[requestOfHeavy]] = await pool.query(
    "SELECT id FROM scrim_requests WHERE from_team_id = ? LIMIT 1",
    [heavyTeam]
  );
  const routes = [
    ["/api/series?pageSize=20", "series list"],
    ["/api/series?pageSize=20&view=summary", "series list (summary)"],
    [`/api/series/${ownedSeries.id}`, "one series"],
    ["/api/tier-lists", "tier lists"],
    [`/api/tier-lists/${ownedTier.id}`, "one tier list"],
    ["/api/overview", "overview"],
    ["/api/stats/overview", "stats overview"],
    ["/api/stats/heroes", "stats heroes"],
    ["/api/notifications", "notifications"],
    ["/api/community/summary", "community summary"],
    ["/api/me/agenda", "my agenda"],
    ["/api/requests", "requests"],
    [`/api/requests/${requestOfHeavy.id}`, "one request"],
    ["/api/scrim-posts", "scrim posts"],
    ["/api/teams", "teams"],
    ["/api/me/teams", "my teams"],
    ["/api/me/invitations", "my invitations"],
    [`/api/teams/${heavyTeam}`, "one team"],
    [`/api/teams/${heavyTeam}/events`, "team events"],
    [`/api/teams/${heavyTeam}/training`, "team training"],
    [`/api/teams/${heavyTeam}/training/ranking`, "team ranking"],
    ["/api/training/notes", "training notes"],
    ["/api/training/reflex", "reflex"],
    ["/api/training/assigned", "assigned training"],
    ["/api/training/focus", "training focus"],
    ["/api/training/combos", "combos (public)"],
    ["/api/training/combos/review", "combos review"],
    ["/api/combos", "my combos"],
    ["/api/training/scenarios", "scenarios"],
    ["/api/training/maps", "training maps"],
    ["/api/space", "personal space"],
    ["/api/popular/drafts", "popular drafts"],
    ["/api/popular/heroes", "popular heroes"],
    ["/api/catalog", "catalog"],
    ["/api/builds", "builds"],
    ["/api/heroes", "heroes"],
    ["/api/heroes/h01", "one hero"],
    ["/api/backgrounds", "backgrounds"],
    ["/api/official-tiers", "official tiers"],
    ["/api/content-translations?lang=fr", "content translations"],
    ["/api/me/preferences", "preferences"],
    ["/api/profile", "profile"]
  ].filter(([path, label]) => !ONLY || ONLY.test(path) || ONLY.test(label));

  const seen = watch(pool);
  const results = [];
  const statements = new Map();
  for (const [path, label] of routes) {
    for (const viewer of [
      ["heavy", heavy, heavyCookie],
      ["quiet", quiet, quietCookie]
    ]) {
      const [name, who, cookie] = viewer;
      seen.current = [];
      const first = await who.browser.get(path);
      const sql = seen.current.slice();
      const times = [];
      for (let index = 0; index < RUNS; index += 1) {
        const started = process.hrtime.bigint();
        await who.browser.get(path);
        times.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      seen.current = null;
      const identity = await fetchEncoded(app.baseUrl, path, cookie, "identity");
      const gzip = await fetchEncoded(app.baseUrl, path, cookie, "gzip");
      const brotli = await fetchEncoded(app.baseUrl, path, cookie, "br");
      const etag = first.headers.get("etag");
      let revalidated = null;
      if (etag) {
        // plain http: fetch() adds `Cache-Control: no-cache` to a conditional request, which asks for a
        // full answer (what a hard reload does) and would hide every 304
        revalidated = (
          await fetchEncoded(app.baseUrl, path, cookie, "identity", { "if-none-match": etag })
        ).status;
      }
      results.push({
        path,
        label,
        viewer: name,
        status: first.status,
        ms: median(times),
        sql: sql.length,
        repeated: repeatedStatements(sql),
        sqlMs: sql.reduce((sum, item) => sum + item.ms, 0),
        raw: identity.bytes,
        gzip: gzip.bytes,
        br: brotli.bytes,
        cacheControl: first.headers.get("cache-control"),
        etag: Boolean(etag),
        revalidated
      });
      for (const item of sql) {
        const key = item.sql.replace(/\s+/g, " ").trim();
        if (!statements.has(key)) {
          statements.set(key, { sql: key, params: item.params, routes: new Set(), ms: 0 });
        }
        const entry = statements.get(key);
        entry.routes.add(`${path} (${name})`);
        entry.ms = Math.max(entry.ms, item.ms);
      }
    }
  }

  console.log(
    "\nroute".padEnd(34) +
      "viewer  status    ms   sql    sql ms      raw     gzip       br  cache-control / etag"
  );
  for (const row of results) {
    console.log(
      `${row.label.padEnd(33)} ${row.viewer.padEnd(6)} ${String(row.status).padStart(5)} ${row.ms.toFixed(1).padStart(7)} ${String(row.sql).padStart(5)} ${row.sqlMs.toFixed(1).padStart(9)} ${kb(row.raw).padStart(8)} ${kb(row.gzip).padStart(8)} ${kb(row.br).padStart(8)}  ${row.cacheControl ?? "-"}${row.etag ? ` etag${row.revalidated ? `→${row.revalidated}` : ""}` : ""}`
    );
  }

  const repeating = results.filter(row => row.repeated.length);
  console.log(
    repeating.length
      ? "\nrepeated statements (possible N+1):"
      : "\nno route repeats a statement 3 times or more (no N+1)."
  );
  for (const row of repeating) {
    console.log(`- ${row.label} (${row.viewer}): ${row.repeated.join(" | ")}`);
  }

  // ---- what the 30 s memory changes: a question asked for the first time, then asked again --------------------------
  // (a different end date is a different question with the same long answer, so always a miss; a miss costs what every request used
  // to cost before the answer was kept)
  if (!ONLY || ONLY.test("cache") || ONLY.test("popular")) {
    console.log("\ncache effect on the popularity pages (2 800 games), median of 5:");
    for (const base of ["/api/popular/drafts", "/api/popular/heroes"]) {
      const miss = [];
      for (let day = 11; day <= 15; day += 1) {
        const started = process.hrtime.bigint();
        await quiet.browser.get(`${base}?to=2090-01-${day}`);
        miss.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      const hit = [];
      for (let run = 0; run < 5; run += 1) {
        const started = process.hrtime.bigint();
        await quiet.browser.get(`${base}?to=2090-01-11`);
        hit.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      console.log(
        `${base.padEnd(24)} miss ${median(miss).toFixed(1).padStart(6)} ms   hit ${median(hit).toFixed(1).padStart(6)} ms`
      );
    }
  }

  // ---- the periodic jobs (they run on a timer, so no route reaches them) -------------------------------------------
  console.log("\nperiodic jobs:");
  const jobs = [
    ["reminders (every minute)", () => app.store.dueReminders(Date.now())],
    ["weekly digest (every minute)", () => app.store.dueDigests(Date.now())],
    ["purge (every hour)", () => app.store.purgeExpired(Date.now())]
  ].filter(([label]) => !ONLY || ONLY.test(label));
  // twice: the first run does the whole backlog (everything made up is due), the second one is what
  // every following minute costs
  for (const [label, job, round] of jobs.flatMap(item => [
    [...item, "first run"],
    [...item, "next run "]
  ])) {
    seen.current = [];
    const started = process.hrtime.bigint();
    await job();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const sql = seen.current;
    seen.current = null;
    console.log(
      `${label.padEnd(30)} ${round} ${ms.toFixed(1).padStart(8)} ms  ${String(sql.length).padStart(3)} statements`
    );
    for (const item of sql) {
      const key = item.sql.replace(/\s+/g, " ").trim();
      if (!statements.has(key)) {
        statements.set(key, { sql: key, params: item.params, routes: new Set(), ms: 0 });
      }
      const entry = statements.get(key);
      entry.routes.add(`job: ${label}`);
      entry.ms = Math.max(entry.ms, item.ms);
    }
  }

  // ---- EXPLAIN of every distinct SELECT -----------------------------------------------------------------------------
  const flagged = [];
  for (const entry of statements.values()) {
    if (!/^SELECT\b/i.test(entry.sql) || /^SELECT 1\b/i.test(entry.sql)) {
      continue;
    }
    let plan;
    try {
      [plan] = await pool.query(`EXPLAIN ${entry.sql}`, entry.params);
    } catch (error) {
      entry.explainError = error.message;
      continue;
    }
    entry.plan = plan.map(row => ({
      table: row.table,
      type: row.type,
      key: row.key,
      rows: Number(row.rows),
      filtered: Number(row.filtered),
      extra: row.Extra
    }));
    const reasons = [];
    for (const step of entry.plan) {
      if (step.type === "ALL" && step.rows > 1000) {
        reasons.push(`full scan of ${step.table} (~${step.rows} rows)`);
      } else if (step.rows > 5000) {
        reasons.push(
          `${step.table} reads ~${step.rows} rows (${step.type}, key ${step.key ?? "none"})`
        );
      }
      if (/Using filesort/.test(step.extra ?? "") && step.rows > 500) {
        reasons.push(`sorts ~${step.rows} rows of ${step.table} without an index`);
      }
      if (/Using temporary/.test(step.extra ?? "") && step.rows > 500) {
        reasons.push(`temporary table for ${step.table} (~${step.rows} rows)`);
      }
    }
    if (reasons.length) {
      flagged.push({ ...entry, reasons, routes: [...entry.routes] });
    }
  }
  console.log(`\n${flagged.length} statement(s) worth a look out of ${statements.size}:`);
  for (const entry of flagged) {
    console.log(`\n- ${entry.reasons.join("; ")}`);
    console.log(`  ${entry.sql.slice(0, 260)}${entry.sql.length > 260 ? "…" : ""}`);
    console.log(
      `  used by ${entry.routes.slice(0, 4).join(", ")}${entry.routes.length > 4 ? `, +${entry.routes.length - 4}` : ""}; slowest run ${entry.ms.toFixed(1)} ms`
    );
  }
  if (JSON_FILE) {
    writeFileSync(
      JSON_FILE,
      JSON.stringify(
        {
          scale: SCALE,
          counts: N,
          results,
          statements: [...statements.values()].map(item => ({ ...item, routes: [...item.routes] }))
        },
        null,
        1
      )
    );
  }
} finally {
  if (KEEP) {
    console.log(`\ndatabase kept: ${app.database.name}`);
    process.exit(0);
  }
  await app.close();
}
