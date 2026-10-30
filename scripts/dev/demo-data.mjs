#!/usr/bin/env node
// Fills the DEVELOPMENT database with a believable world, so that every page can be looked at with data
// in it: people (every one of them <name>@demo.test), two teams, series (finished, in progress, local),
// tier lists, an agenda, scrim announcements, tournaments, combos. Everything is made through the running
// server's own API where there is one (so it follows the real rules), and removable.
//
//   node scripts/dev/demo-data.mjs seed   [--url http://localhost:3000] [--out sessions.json]
//   node scripts/dev/demo-data.mjs remove
//
// The database is the one of the environment (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD). For the
// administrator pages, start the server with ADMIN_EMAILS containing demoadmin@demo.test. `seed` writes
// the session cookies of the demo people to --out (default: demo-sessions.json in the temporary folder),
// so that a browser can open the site as any of them.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { hashToken } from "../../src/server/platform/http/identity.js";
import { DAY } from "./demo-data-shared.js";
import { seedAgenda, seedSeries, seedTierLists, seedTournaments } from "./demo-data-seed.js";
export { demoPages } from "./demo-data-pages.js";

const DOMAIN = "demo.test";
const PEOPLE = [
  { key: "admin", name: "DemoAdmin" },
  { key: "captain", name: "Captain Fox" },
  { key: "coach", name: "Coach Owl" },
  { key: "analyst", name: "Analyst Pine" },
  { key: "mid", name: "Mia Mid" },
  { key: "jungle", name: "Jun Jungle" },
  { key: "clash", name: "Kai Clash" },
  { key: "farm", name: "Faye Farm" },
  { key: "roam", name: "Ro Roam" },
  { key: "rival", name: "Rival Captain" }
];

const argument = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const command = process.argv[2];

function client(baseUrl, token) {
  const call = async (method, url, body) => {
    const response = await fetch(baseUrl + url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { cookie: `hok_session=${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!response.ok) {
      throw new Error(`${method} ${url} -> ${response.status} ${text.slice(0, 200)}`);
    }
    return json;
  };
  return {
    get: url => call("GET", url),
    post: (url, body = {}) => call("POST", url, body),
    put: (url, body = {}) => call("PUT", url, body),
    patch: (url, body = {}) => call("PATCH", url, body)
  };
}

async function openStore() {
  const config = loadConfig();
  if (!config.db.password) {
    throw new Error("DB_PASSWORD is not set");
  }
  const store = createStore(config.db);
  await store.initializeDatabase();
  return store;
}

// ---- remove ------------------------------------------------------------------------------------------
async function remove(store) {
  const [users] = await store.pool.query("SELECT id FROM users WHERE email LIKE ?", [
    `%@${DOMAIN}`
  ]);
  const ids = users.map(user => user.id);
  if (!ids.length) {
    console.log("no demo person found");
    return;
  }
  // what a person owns is not deleted with them (the owner column becomes NULL): delete it first
  await store.pool.query("DELETE FROM series WHERE owner_user_id IN (?)", [ids]);
  await store.pool.query("DELETE FROM tier_lists WHERE owner_user_id IN (?)", [ids]);
  await store.pool.query(
    "DELETE FROM teams WHERE id IN (SELECT team_id FROM (SELECT team_id FROM team_members WHERE user_id IN (?) AND role = 'owner') x)",
    [ids]
  );
  await store.pool.query("DELETE FROM competitive_series WHERE created_by IN (?)", [ids]);
  await store.pool.query("DELETE FROM users WHERE id IN (?)", [ids]);
  console.log(`removed ${ids.length} demo people with what they made`);
}

// ---- seed --------------------------------------------------------------------------------------------
async function makePerson(store, person) {
  const email = `${person.name.replace(/\s+/g, "").toLowerCase()}@${DOMAIN}`;
  const created = await store.upsertGoogleUser({
    googleSubject: `demo-${person.key}`,
    email,
    picture: ""
  });
  await store.completeProfile(created.id, {
    name: person.name,
    passwordHash: null,
    loginEmail: null
  });
  await store.savePreferences(created.id, {
    modules: ["scrims", "tier-lists", "heroes", "training"]
  });
  const token = randomBytes(32).toString("base64url");
  await store.createSession(hashToken(token), created.id, Date.now() + 30 * DAY);
  return { ...person, id: created.id, email, tag: created.tag, token };
}

/**
 * Makes the demonstration world through the server at `baseUrl` (whose database is `store`'s): the people, two
 * teams, series, tier lists, an agenda, announcements, tournaments. Returns what a caller needs to open pages as
 * those people: { people (each with its session token), teams, series }.
 */
export async function seedDemoWorld({ store, baseUrl }) {
  const [[already]] = await store.pool.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE ?", [
    `%@${DOMAIN}`
  ]);
  if (Number(already.n)) {
    throw new Error("the demo people already exist: run `remove` first");
  }
  const roster = (await store.readHeroes())
    .filter(hero => hero.availableGlobal && hero.lanes?.length)
    .sort((left, right) => left.id.localeCompare(right.id));
  const people = {};
  for (const person of PEOPLE) {
    people[person.key] = await makePerson(store, person);
  }
  const as = key => client(baseUrl, people[key].token);

  // ---- teams -----------------------------------------------------------------------------------------
  const team = async (who, name, tag, members) => {
    const made = await as(who).post("/api/teams", {
      name,
      tag,
      level: "semi-pro",
      region: "EU",
      timezone: "UTC+1"
    });
    for (const [key, role, lane] of members) {
      await store.pool.execute(
        "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, ?, ?)",
        [made.id, people[key].id, role, lane ?? "", Date.now() - 20 * DAY]
      );
    }
    return made.id;
  };
  const fox = await team("captain", "Crimson Fox", "CFX", [
    ["coach", "coach"],
    ["analyst", "analyst"],
    ["clash", "player", "Clash Lane"],
    ["jungle", "player", "Jungle"],
    ["mid", "player", "Mid Lane"],
    ["farm", "player", "Farm Lane"],
    ["roam", "player", "Roamer"]
  ]);
  const owls = await team("rival", "Dawn Owls", "OWL", []);

  const captain = as("captain");
  const { finished, live } = await seedSeries({ store, captain, roster, fox });
  await seedTierLists({ captain, roster });
  await seedAgenda({ captain, as, fox, owls });
  await seedTournaments({ store, roster, people });

  return { people, teams: { fox, owls }, series: { live, finished } };
}

/** Writes the session cookies of the demonstration people, so that a browser can open the site as any of them. */
function writeSessions(people, out) {
  writeFileSync(
    out,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(people).map(([key, person]) => [
          key,
          { name: person.name, email: person.email, tag: person.tag, cookie: person.token }
        ])
      ),
      null,
      2
    )
  );
}

async function main() {
  const store = await openStore();
  try {
    if (command === "seed") {
      const world = await seedDemoWorld({
        store,
        baseUrl: argument("url") ?? "http://localhost:3000"
      });
      const out = argument("out") ?? path.join(tmpdir(), "hok-demo-sessions.json");
      writeSessions(world.people, out);
      console.log(
        `${PEOPLE.length} people, 2 teams, 4 series, 3 tier lists, an agenda, 2 announcements, 4 tournaments`
      );
      console.log(`sessions (cookie name hok_session): ${out}`);
      console.log("administrator pages need ADMIN_EMAILS to include demoadmin@demo.test");
    } else if (command === "remove") {
      await remove(store);
    } else {
      console.error("usage: node scripts/dev/demo-data.mjs seed|remove [--url …] [--out …]");
      process.exitCode = 2;
    }
  } finally {
    await store.closeDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
