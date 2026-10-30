#!/usr/bin/env node
// Puts the pictures of folders into the catalogue: one item per picture of the items folder, one arcana
// per picture of the arcana folder, each with its picture (made the way an upload is: kept up to
// 256 px, an arcana drawn small is made 128 px). It creates the entries and their pictures and
// nothing else: no stat, no price, no category, no description: those are written by an administrator
// in the Catalog page (nothing is invented).
//
//   node --env-file=.env scripts/catalog/import-images.mjs --items <folder> --arcana <folder>            what it would do
//   node --env-file=.env scripts/catalog/import-images.mjs --items <folder> --arcana <folder> --apply    does it
//   node --env-file=.env scripts/catalog/import-images.mjs --undo <manifest.json> [--apply]              takes it back
//
// What a name is, the slot of an item (boots when its name says so, else "regular") and the colour of
// an arcana (read from its picture, and left out when the picture is not clear) are in naming.mjs. A
// name that is already in the catalogue is skipped, never changed. With --apply the database is
// migrated first if the application has not done it yet (what the application does at start-up), and a
// manifest of what was created is written to backups/ so that --undo can take it back (an entry that a
// recommended build uses is kept, and said). The password of the database is read from the
// environment and never printed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "../../src/server/config.js";
import { parseArcana, parseItem } from "../../src/server/features/catalog/catalog-domain.js";
import { processCatalogImage } from "../../src/server/platform/images/catalog-image.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { manifestFile } from "./manifest-name.mjs";
import { arcanaColour, cleanName, slotOfName } from "./naming.mjs";

const MIME = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif"
};

function options(argv) {
  const result = { apply: false };
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at];
    if (word === "--apply") {
      result.apply = true;
    } else if (["--items", "--arcana", "--undo"].includes(word)) {
      result[word.slice(2)] = argv[(at += 1)];
    } else {
      throw new Error(`unknown option ${word}`);
    }
  }
  if (!result.items && !result.arcana && !result.undo) {
    throw new Error("give --items <folder>, --arcana <folder> or --undo <manifest.json>");
  }
  return result;
}

const kb = bytes => `${Math.round(bytes / 1024)} KB`;
const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });

/** What each picture of a folder becomes (nothing is written). */
async function planFolder(folder, kind) {
  const entries = [];
  const names = new Set();
  for (const file of readdirSync(folder).sort(natural)) {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) {
      continue;
    }
    const bytes = readFileSync(path.join(folder, file));
    const name = cleanName(file, kind);
    const entry = { kind, file, name, mime, bytes: bytes.length, skipped: null };
    try {
      entry.picture = await processCatalogImage(bytes, mime, { kind });
      const meta = await sharp(entry.picture).metadata();
      entry.size = `${meta.width}x${meta.height}`;
    } catch (error) {
      entry.skipped = `the picture cannot be used (${error.message})`;
    }
    if (kind === "item") {
      entry.slot = slotOfName(name);
    } else {
      const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();
      const { colour, share } = arcanaColour(raw);
      entry.colour = colour;
      if (!colour && !entry.skipped) {
        entry.skipped = `its colour is not clear (${Math.round(share * 100)}% agree): add it in the catalogue`;
      }
    }
    if (names.has(name.toLowerCase()) && !entry.skipped) {
      entry.skipped = "another file gives the same name";
    }
    names.add(name.toLowerCase());
    entries.push(entry);
  }
  return entries;
}

function show(entries) {
  for (const entry of entries) {
    const what = entry.kind === "item" ? (entry.slot ?? "") : (entry.colour ?? "?");
    console.log(
      `${entry.kind.padEnd(7)} ${entry.name.padEnd(34)} ${String(what).padEnd(8)} ` +
        `${kb(entry.bytes).padStart(7)} -> ${entry.picture ? kb(entry.picture.length).padStart(6) : "      "} ${(entry.size ?? "").padEnd(8)}` +
        `${entry.skipped ? `  SKIPPED: ${entry.skipped}` : ""}`
    );
  }
}

const emptyKnown = imageId => ({
  stats: new Map(),
  tagIds: new Set(),
  imageIds: new Set([imageId]),
  heroIds: new Set(),
  roles: new Set()
});

async function openStore() {
  const config = loadConfig();
  if (!config.db.password) {
    throw new Error("DB_PASSWORD is not set (run with: node --env-file=.env …)");
  }
  const store = createStore(config.db, { log: message => console.log(`  database: ${message}`) });
  await store.initializeDatabase();
  return store;
}

async function apply(entries) {
  const store = await openStore();
  try {
    const catalog = await store.readCatalog();
    const have = {
      item: new Set(catalog.items.map(entry => entry.name.toLowerCase())),
      arcana: new Set(catalog.arcana.map(entry => entry.name.toLowerCase()))
    };
    const manifest = { createdAt: new Date().toISOString(), items: [], arcana: [] };
    for (const entry of entries) {
      if (entry.skipped) {
        continue;
      }
      if (have[entry.kind].has(entry.name.toLowerCase())) {
        entry.skipped = "already in the catalogue";
        continue;
      }
      const imageId = await store.saveImage(entry.picture);
      try {
        if (entry.kind === "item") {
          const item = parseItem(
            { name: entry.name, category: entry.slot, imageId, stats: [], effects: [], tags: [] },
            emptyKnown(imageId)
          );
          manifest.items.push({ id: await store.createItem(item), name: entry.name });
        } else {
          const arcana = parseArcana(
            { name: entry.name, color: entry.colour, imageId, stats: [], tags: [] },
            emptyKnown(imageId)
          );
          manifest.arcana.push({ id: await store.createArcana(arcana), name: entry.name });
        }
      } catch (error) {
        await store.pool.execute("DELETE FROM catalog_images WHERE id = ?", [imageId]);
        entry.skipped = `not created (${error.message})`;
      }
    }
    mkdirSync("backups", { recursive: true });
    const file = manifestFile("catalog-import");
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    show(entries);
    console.log(
      `\ncreated ${manifest.items.length} item(s) and ${manifest.arcana.length} arcana; ` +
        `${entries.filter(entry => entry.skipped).length} skipped. Manifest: ${file}`
    );
  } finally {
    await store.closeDatabase();
  }
}

async function undo(manifestFile, doIt) {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const store = doIt ? await openStore() : null;
  let removed = 0;
  let kept = 0;
  try {
    for (const [kind, list] of [
      ["item", manifest.items ?? []],
      ["arcana", manifest.arcana ?? []]
    ]) {
      for (const { id, name } of list) {
        if (!store) {
          console.log(`would remove ${kind} ${name}`);
          continue;
        }
        try {
          const done = kind === "item" ? await store.deleteItem(id) : await store.deleteArcana(id);
          console.log(done ? `removed ${kind} ${name}` : `${kind} ${name}: already gone`);
          removed += done ? 1 : 0;
        } catch (error) {
          console.log(`kept ${kind} ${name}: ${error.message}`);
          kept += 1;
        }
      }
    }
    if (store) {
      console.log(`\nremoved ${removed}, kept ${kept}`);
    } else {
      console.log("\nnothing was removed (add --apply)");
    }
  } finally {
    await store?.closeDatabase();
  }
}

try {
  const choice = options(process.argv.slice(2));
  if (choice.undo) {
    await undo(choice.undo, choice.apply);
  } else {
    const entries = [
      ...(choice.items ? await planFolder(choice.items, "item") : []),
      ...(choice.arcana ? await planFolder(choice.arcana, "arcana") : [])
    ];
    if (!choice.apply) {
      show(entries);
      const usable = entries.filter(entry => !entry.skipped);
      const before = usable.reduce((sum, entry) => sum + entry.bytes, 0);
      const after = usable.reduce((sum, entry) => sum + entry.picture.length, 0);
      console.log(
        `\n${usable.length} of ${entries.length} would be created, ${kb(before)} of pictures become ` +
          `${kb(after)}. Nothing was written: add --apply (back the database up first).`
      );
    } else {
      await apply(entries);
    }
  }
} catch (error) {
  console.error(`import-images: ${error.message}`);
  process.exit(1);
}
