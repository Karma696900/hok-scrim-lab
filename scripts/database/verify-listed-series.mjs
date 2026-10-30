#!/usr/bin/env node
// Checks the tournament series that are still a plain list of heroes (`listed`, taken from a results page) and marks the
// ones that hang together as `verified`, with the order of their picks still unknown (`pick_order_known` = 0), so that they
// stay out of the statistics of that order. A series hangs together when the app's own validation accepts it as it is
// stored (known heroes, lanes, bans, winner of every game) and when it is finished: a team reached the wins it needs and no
// game came after (src/server/features/tournaments/tournament-coherence.js). The others stay `listed`, with the reason.
// This reads no video: it says the page is consistent, not that it is right.
//
//   node scripts/database/verify-listed-series.mjs            says what it would change
//   node scripts/database/verify-listed-series.mjs --apply    writes (back the database up first: scripts/database/backup-mysql.ps1)
//
// The database is the dev one (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD). Like the server, it applies the pending
// migrations first. It can be run again: it only looks at the series that are still `listed`.
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { parseTournamentSeries } from "../../src/server/features/tournaments/tournament-domain.js";
import { seriesProblems } from "../../src/server/features/tournaments/tournament-coherence.js";

const apply = process.argv.includes("--apply");
const BATCH = 200;
const store = createStore(loadConfig().db);
await store.initializeDatabase();

const heroes = (await store.readHeroes()).filter(hero => hero.availableGlobal);
const known = new Set(heroes.map(hero => hero.id));
const flowbornIds = heroes.filter(hero => /^flowborn/i.test(hero.name ?? "")).map(hero => hero.id);
const [listed] = await store.pool.query(
  "SELECT id FROM competitive_series WHERE verification = 'listed' ORDER BY played_on, created_at"
);

const coherent = [];
const left = [];
for (const { id } of listed) {
  const series = await store.getTournament(id);
  let problems;
  try {
    problems = seriesProblems(parseTournamentSeries(series, known, { flowbornIds }));
  } catch (error) {
    problems = [`${error.template ?? error.message} ${JSON.stringify(error.params ?? {})}`];
  }
  if (problems.length) {
    left.push(
      `${series.event} ${series.teamA} - ${series.teamB} ${series.playedOn}: ${problems.join("; ")}`
    );
  } else {
    coherent.push(id);
  }
}

if (apply) {
  for (let from = 0; from < coherent.length; from += BATCH) {
    await store.pool.query(
      "UPDATE competitive_series SET verification = 'verified', pick_order_known = 0, updated_at = ? WHERE verification = 'listed' AND id IN (?)",
      [Date.now(), coherent.slice(from, from + BATCH)]
    );
  }
}
console.log(
  `${listed.length} lists of heroes: ${coherent.length} ${apply ? "are now verified" : "would be verified"} (pick order unknown), ${left.length} left as a list`
);
// what the series left as a list have in common (numbers and names set aside)
const kinds = new Map();
for (const line of left) {
  const kind = line.slice(line.lastIndexOf(": ") + 2).replace(/\d+/g, "N");
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
}
for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count} x ${kind}`);
}
for (const line of left.slice(0, 10)) {
  console.log("  left:", line);
}
await store.pool.end?.();
