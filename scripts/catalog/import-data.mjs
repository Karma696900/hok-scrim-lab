#!/usr/bin/env node
// Fills the catalogue from the three pages the owner saved (items.html, arcana.html, spells.html): the
// category and the stats of the items, the stats of the arcana, the spells. Nothing the owner wrote is
// replaced (see plan-data.mjs); what cannot be read with certainty is listed, not guessed.
//
//   node scripts/catalog/import-data.mjs --items items.html --arcana arcana.html --spells spells.html
//        what it would do (nothing is written)
//   … --apply [--fetch-spell-icons]     does it (back the database up first); the icons of the spells are
//        downloaded, one request each, ONLY from the official image host of the game (game.gtimg.cn),
//        over https, 2 MB at most each; without the option the spells have no picture
//   node scripts/catalog/import-data.mjs --undo backups/<manifest>.json [--apply]      takes it back
//
// The database is the one of the environment (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD; the
// password is never printed). A manifest of what was done, with what each updated entry held before, is
// written to backups/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { manifestFile } from "./manifest-name.mjs";
import { applyPlan, fetchIcon, planImport, undoManifest } from "./plan-data.mjs";
import { parseArcanaPage, parseSpellsPage, parseWikiItems } from "./sources.mjs";

function options(argv) {
  const result = { apply: false, fetchIcons: false };
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at];
    if (word === "--apply") {
      result.apply = true;
    } else if (word === "--fetch-spell-icons") {
      result.fetchIcons = true;
    } else if (["--items", "--arcana", "--spells", "--undo"].includes(word)) {
      result[word.slice(2)] = argv[(at += 1)];
    } else {
      throw new Error(`unknown option ${word}`);
    }
  }
  if (!result.items && !result.arcana && !result.spells && !result.undo) {
    throw new Error(
      "give --items, --arcana, --spells (a saved page each) or --undo <manifest.json>"
    );
  }
  return result;
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

const read = file => readFileSync(file, "utf8");

function show(plan) {
  const say = (title, list) => {
    console.log(`\n${title} (${list.length})`);
    for (const line of list) {
      console.log(`  ${line}`);
    }
  };
  say(
    "stats of the game to create",
    plan.stats.map(stat => `${stat.name}  (${stat.unit})`)
  );
  say(
    "items to complete",
    plan.items.map(
      item =>
        `${item.name}: ${Object.keys(item.changes).join(", ")}${item.kept.length ? `  [${item.kept.join("; ")}]` : ""}`
    )
  );
  say(
    "arcana to complete",
    plan.arcana.map(
      piece =>
        `${piece.name}: ${piece.changes.stats.length} stat(s)${piece.kept.length ? `  [${piece.kept.join("; ")}]` : ""}`
    )
  );
  say(
    "spells to create",
    plan.spells.map(spell => `${spell.name}  (${spell.cooldownSeconds} s)`)
  );
  for (const [kind, list] of Object.entries(plan.notes)) {
    if (list.length) {
      say(
        `left as it is — ${kind}`,
        list.map(note => `${note.name ?? note.wiki ?? note.guide ?? ""}: ${note.why ?? note}`)
      );
    }
  }
}

try {
  const choice = options(process.argv.slice(2));
  const store = await openStore();
  try {
    if (choice.undo) {
      const manifest = JSON.parse(read(choice.undo));
      if (!choice.apply) {
        console.log(
          `would restore ${manifest.items?.length ?? 0} item(s) and ${manifest.arcana?.length ?? 0} arcana, delete ${manifest.spells?.length ?? 0} spell(s) and ${manifest.stats?.length ?? 0} stat(s). Add --apply.`
        );
      } else {
        for (const line of await undoManifest({ store, manifest })) {
          console.log(line);
        }
      }
    } else {
      const plan = planImport({
        catalog: await store.readCatalog(),
        wiki: choice.items ? parseWikiItems(read(choice.items)) : null,
        arcana: choice.arcana ? parseArcanaPage(read(choice.arcana)) : null,
        spells: choice.spells ? parseSpellsPage(read(choice.spells)) : null
      });
      show(plan);
      if (!choice.apply) {
        console.log("\nNothing was written: add --apply (back the database up first).");
      } else {
        const manifest = await applyPlan({
          store,
          plan,
          fetchImage: choice.fetchIcons ? url => fetchIcon(url) : async () => null
        });
        mkdirSync("backups", { recursive: true });
        const file = manifestFile("catalog-data");
        writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(
          `\ncreated ${manifest.stats.length} stat(s) and ${manifest.spells.length} spell(s); completed ${manifest.items.length} item(s) and ${manifest.arcana.length} arcana. Manifest: ${file}`
        );
      }
    }
  } finally {
    await store.closeDatabase();
  }
} catch (error) {
  console.error(`import-data: ${error.message}`);
  process.exit(1);
}
