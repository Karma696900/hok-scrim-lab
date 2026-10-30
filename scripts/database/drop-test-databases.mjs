#!/usr/bin/env node
// Drops the throw-away databases that tests and tools leave behind when they are killed before they
// can clean up (hok_test_<12 hex digits>). Each run of the tests creates one and drops it when it
// ends normally; a crash, a timeout or a kill leaves it. The development database is never touched:
// only names of exactly that shape are looked at, and one is kept when somebody is connected to it
// or when it is younger than a few minutes (a run may be starting).
//   node scripts/database/drop-test-databases.mjs                 # says what it would drop
//   node scripts/database/drop-test-databases.mjs --apply         # drops them
//   node scripts/database/drop-test-databases.mjs --apply --younger-than=0   # no age protection
// Same environment as the tests: TEST_DB_HOST, TEST_DB_PORT, TEST_DB_ROOT_PASSWORD (the defaults
// match docker-compose.yml). Nothing secret is printed.
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

export const TEST_DATABASE = /^hok_test_[0-9a-f]{12}$/;
export const DEFAULT_YOUNGER_THAN_MINUTES = 10;

/**
 * Which databases may go: the ones that have the shape of a test database, nobody is connected to,
 * and that are not young. `databases` is `[{ name, createdAt (ms, or null when it has no table yet),
 * connections }]`. Each answer says why a database is kept.
 */
export function judge(databases, { now, youngerThanMinutes = DEFAULT_YOUNGER_THAN_MINUTES }) {
  const limit = now - youngerThanMinutes * 60_000;
  return databases.map(database => {
    if (!TEST_DATABASE.test(database.name)) {
      return { name: database.name, drop: false, why: "not a test database" };
    }
    if (database.connections > 0) {
      return { name: database.name, drop: false, why: "in use" };
    }
    if (youngerThanMinutes > 0 && (database.createdAt === null || database.createdAt > limit)) {
      return { name: database.name, drop: false, why: "too young to be sure" };
    }
    return { name: database.name, drop: true, why: "left behind" };
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const option = process.argv.find(item => item.startsWith("--younger-than="));
  const youngerThanMinutes = option ? Number(option.split("=")[1]) : DEFAULT_YOUNGER_THAN_MINUTES;
  if (!Number.isFinite(youngerThanMinutes) || youngerThanMinutes < 0) {
    console.error("--younger-than takes a number of minutes (0 or more).");
    process.exit(2);
  }
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.TEST_DB_HOST || "127.0.0.1",
      port: Number(process.env.TEST_DB_PORT || 8080),
      user: "root",
      password: process.env.TEST_DB_ROOT_PASSWORD || "hok_local_root_password"
    });
  } catch (error) {
    console.error(`MySQL is not reachable (${error.code ?? error.message}). Start it first.`);
    process.exit(1);
  }
  try {
    const [names] = await connection.query(
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name LIKE 'hok\\_test\\_%'"
    );
    const [created] = await connection.query(
      "SELECT table_schema AS name, UNIX_TIMESTAMP(MIN(create_time)) * 1000 AS createdAt FROM information_schema.tables WHERE table_schema LIKE 'hok\\_test\\_%' GROUP BY table_schema"
    );
    const [used] = await connection.query(
      "SELECT db AS name, COUNT(*) AS total FROM information_schema.processlist WHERE db LIKE 'hok\\_test\\_%' GROUP BY db"
    );
    const createdAt = new Map(created.map(row => [row.name, Number(row.createdAt)]));
    const connections = new Map(used.map(row => [row.name, Number(row.total)]));
    const [[{ now }]] = await connection.query("SELECT UNIX_TIMESTAMP() * 1000 AS now");
    const verdicts = judge(
      names.map(row => ({
        name: row.name,
        createdAt: createdAt.get(row.name) ?? null,
        connections: connections.get(row.name) ?? 0
      })),
      { now: Number(now), youngerThanMinutes }
    );
    const going = verdicts.filter(verdict => verdict.drop);
    for (const verdict of verdicts.filter(item => !item.drop)) {
      console.log(`keeps  ${verdict.name}  (${verdict.why})`);
    }
    for (const verdict of going) {
      if (apply) {
        // the name was checked against the exact shape above: nothing else can reach this line
        await connection.query(`DROP DATABASE \`${verdict.name}\``);
      }
      console.log(`${apply ? "dropped" : "would drop"}  ${verdict.name}`);
    }
    console.log(
      `${going.length} ${apply ? "dropped" : "to drop"}, ${verdicts.length - going.length} kept${apply || !going.length ? "" : ". Add --apply to drop them."}`
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
