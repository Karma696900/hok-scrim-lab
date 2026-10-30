#!/usr/bin/env node
// An instance of the application as it runs in production (the built bundle, the first screen of the public pages
// drawn by the server) on a throw-away database, with the REAL roster, hero sheets and catalogue copied (read only)
// from the development database, and the demonstration world of scripts/dev/demo-data.mjs on top (people, teams, series,
// tier lists, an agenda, tournaments). It prints `READY <address>`, writes <folder>/world.json (the pages to measure
// and the session each one needs, see scripts/performance/lighthouse-pages.mjs) and stays up until it reads `quit` on
// its input (it then drops its database: killed from outside, it would leave it behind).
//   npm run build
//   HOK_TEST_BUILT=true node scripts/performance/demo-instance.mjs <folder>
// Needs MySQL with the development database (docker compose up -d mysql); the root password is the one of the
// development stack (TEST_DB_ROOT_PASSWORD to change it).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { launchChromium } from "../../src/server/features/heroes/sync/hero-sync.js";
import { createPrerenderer } from "../../src/server/platform/http/prerender.js";
import { startTestServer } from "../../src/testing/test-app.js";
import { demoPages, seedDemoWorld } from "../dev/demo-data.mjs";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: node scripts/performance/demo-instance.mjs <folder>");
  process.exit(2);
}
mkdirSync(folder, { recursive: true });

// The tables that hold what the pages show of the game, in the order their references allow.
const COPIED = [
  "heroes",
  "hero_details",
  "hero_details_i18n",
  "hero_names",
  "hero_lane_additions",
  "hero_lane_removals",
  "hero_profiles",
  "hero_build_sets",
  "hero_combos",
  "catalog_images",
  "game_stats",
  "tags",
  "catalog_items",
  "catalog_arcana",
  "catalog_spells",
  "entity_tags",
  "official_tier_lists",
  "content_texts",
  "content_translations",
  "translation_languages",
  "metadata"
];

let address = "";
const prerender = createPrerenderer({
  launch: launchChromium,
  baseUrl: () => address,
  logger: { info() {}, warn: (...details) => console.warn(...details), error: console.error },
  ttlMs: 6 * 60 * 60 * 1000
});
// DEMO_DISCORD=fake: a Discord that answers as if the application were configured (nothing leaves the machine), so
// that the Discord pages and the team card can be used for real; without it Discord is "not configured" here
const fakeDiscord = {
  enabled: true,
  botEnabled: true,
  serverEnabled: true,
  authorizeUrl: state => `https://discord.test/authorize?state=${state}`,
  botInstallUrl: state => `https://discord.test/install?state=${state}`,
  getGuild: async id => ({ id, name: "Demo HQ" }),
  listChannels: async () => [
    { id: "900000000000000001", name: "general" },
    { id: "900000000000000002", name: "scrims" }
  ],
  postMessage: async () => true,
  sendDirectMessage: async () => true
};
const app = await startTestServer({
  seedHeroes: false,
  prerender,
  discordService: process.env.DEMO_DISCORD === "fake" ? fakeDiscord : null
});
if (!app) {
  throw new Error("MySQL is not reachable");
}
address = app.baseUrl;
app.config.adminEmails.add("demoadmin@demo.test");

// ---- the real roster and catalogue, copied read only from the development database
const source = "hok_scrim";
const root = await mysql.createConnection({
  host: "127.0.0.1",
  port: 8080,
  user: "root",
  password: process.env.TEST_DB_ROOT_PASSWORD || "hok_local_root_password"
});
const target = app.database.config.database;
await root.query("SET FOREIGN_KEY_CHECKS = 0");
for (const table of COPIED) {
  await root.query(`DELETE FROM \`${target}\`.\`${table}\``);
  await root.query(
    `INSERT INTO \`${target}\`.\`${table}\` SELECT * FROM \`${source}\`.\`${table}\``
  );
}
await root.query("SET FOREIGN_KEY_CHECKS = 1");
const [[sheet]] = await root.query(
  `SELECT hero_id FROM ${source}.hero_details WHERE hero_id IN (SELECT id FROM ${source}.heroes WHERE available_global = TRUE) ORDER BY hero_id LIMIT 1`
);
await root.end();
if (!sheet) {
  throw new Error("the development database holds no hero sheet to copy");
}

// ---- the demonstration world, then the pages to measure
const world = await seedDemoWorld({ store: app.store, baseUrl: app.baseUrl });
const pages = demoPages(world, sheet.hero_id).map(({ name, path: route, cookie }) => ({
  name,
  path: route,
  cookie
}));
writeFileSync(path.join(folder, "world.json"), JSON.stringify({ pages }, null, 2));

// the public pages are drawn once now, so that the first measured visit is not the one that pays for the render
for (const { path: where } of pages.filter(item => !item.cookie)) {
  await fetch(`${address}${where}`, { headers: { "accept-language": "en" } }).catch(() => {});
}
console.log(`READY ${address}`);

// ---- stays up until told to stop
process.stdin.setEncoding("utf8");
await new Promise(resolve => {
  process.stdin.on("data", chunk => String(chunk).includes("quit") && resolve());
  process.stdin.on("end", resolve);
});
await app.close();
process.exit(0);
