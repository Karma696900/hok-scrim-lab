#!/usr/bin/env node
// Fills the levels, prices and recipes of the items from a data file (scripts/catalog/data/game-items-*.json:
// facts read on fan sites, each value with its page), and creates the small and intermediate items the catalogue
// does not have yet. Nothing the owner wrote is replaced (see plan-recipes.mjs).
//
//   node scripts/catalog/import-recipes.mjs [--data <file.json>]          what it would do (nothing is written)
//   … --apply [--fetch-icons]       does it (back the database up first); with --fetch-icons the new items get
//        their icon from the official image host of the game (game.gtimg.cn, one request each, 2 MB at most)
//   node scripts/catalog/import-recipes.mjs --undo backups/<manifest>.json [--apply]      takes it back
//
// The database is the one of the environment (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD; the password is
// never printed). A manifest of what was done is written to backups/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { manifestFile } from "./manifest-name.mjs";
import { fetchIcon } from "./plan-data.mjs";
import { applyRecipes, planRecipes, undoRecipes } from "./plan-recipes.mjs";

const DEFAULT_DATA = new URL("./data/game-items-2026-11-01.json", import.meta.url);

function options(argv) {
  const result = { apply: false, fetchIcons: false, data: DEFAULT_DATA };
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at];
    if (word === "--apply") {
      result.apply = true;
    } else if (word === "--fetch-icons") {
      result.fetchIcons = true;
    } else if (word === "--data" || word === "--undo") {
      result[word.slice(2)] = argv[(at += 1)];
    } else {
      throw new Error(`unknown option ${word}`);
    }
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

function show(plan) {
  const say = (title, list) => {
    console.log(`\n${title} (${list.length})`);
    for (const line of list) {
      console.log(`  ${line}`);
    }
  };
  say(
    "items to create",
    plan.create.map(item => `${item.name}  (${item.tier}, ${item.price} gold, ${item.category})`)
  );
  say(
    "items to complete",
    plan.update.map(
      item =>
        `${item.name}: ${Object.keys(item.changes).join(", ") || "nothing"}${item.kept.length ? `  [${item.kept.join("; ")}]` : ""}`
    )
  );
  say(
    "recipes to write",
    plan.recipes.map(recipe => `${recipe.name} = ${recipe.components.join(" + ")}`)
  );
  say("stats the catalogue does not know (left out)", plan.notes.unknownStats);
}

try {
  const choice = options(process.argv.slice(2));
  const store = await openStore();
  try {
    if (choice.undo) {
      const manifest = JSON.parse(readFileSync(choice.undo, "utf8"));
      if (!choice.apply) {
        console.log(
          `would restore ${manifest.updated?.length ?? 0} item(s) and delete ${manifest.created?.length ?? 0}. Add --apply.`
        );
      } else {
        for (const line of await undoRecipes({ store, manifest })) {
          console.log(line);
        }
      }
    } else {
      const data = JSON.parse(readFileSync(choice.data, "utf8"));
      const plan = planRecipes({ catalog: await store.readCatalog(), data });
      show(plan);
      if (!choice.apply) {
        console.log("\nNothing was written: add --apply (back the database up first).");
      } else {
        const manifest = await applyRecipes({
          store,
          plan,
          fetchImage: choice.fetchIcons ? url => fetchIcon(url) : async () => null
        });
        mkdirSync("backups", { recursive: true });
        const file = manifestFile("catalog-recipes");
        writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(
          `\ncreated ${manifest.created.length} item(s) (${manifest.created.filter(entry => entry.picture).length} with their icon), changed ${manifest.updated.length}. Manifest: ${file}`
        );
      }
    }
  } finally {
    await store.closeDatabase();
  }
} catch (error) {
  console.error(`import-recipes: ${error.message}`);
  process.exit(1);
}
