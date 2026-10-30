// Writes the other names of the heroes (typed by an administrator on the hero sheets) where the automatic import reads them:
//
//   node scripts/data/export-hero-aliases.mjs [file]      default: scripts/vod-drafts/config/hero-aliases.db.json
//
// The file maps a key (lower case letters and digits, see shared/vod-model.js) to the id of the hero. lp_parse.py reads it
// before its own tables, so a name added on a hero sheet wins. The database is the dev one (DB_HOST, DB_PORT, DB_NAME, DB_USER,
// DB_PASSWORD); nothing is written to it.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";

const target = path.resolve(process.argv[2] ?? "scripts/vod-drafts/config/hero-aliases.db.json");
const store = createStore(loadConfig().db);
try {
  await store.initializeDatabase();
  const aliases = await store.listHeroAliases();
  const map = Object.fromEntries(aliases.map(({ key, heroId }) => [key, heroId]));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(map, null, 1)}\n`);
  console.log(`${aliases.length} other names written to ${target}`);
} finally {
  await store.closeDatabase();
}
process.exit(0);
