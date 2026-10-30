#!/usr/bin/env node
// Puts a picture on a battle spell of the catalogue (the one spell the official image host did not have,
// Teleport, for instance). The picture goes through the same processing as an upload, and is first made
// like the official icons of the other spells: a full square, 85 x 85 px.
//
//   node scripts/catalog/set-icon.mjs --spell Teleport --file <picture> [--round] [--size 85]
//
// --round   the picture is a disc on a transparent ground: the square inside the disc is kept (the
//           corners and the bright rim of the disc are dropped), as the other icons have no corners.
// The database is the one of the environment (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { parseSpell } from "../../src/server/features/catalog/catalog-domain.js";
import { processCatalogImage } from "../../src/server/platform/images/catalog-image.js";
import sharp from "../../src/server/platform/images/sharp-safe.js";

/** The inside square of a disc drawn in a `side` px picture, bright rim excluded (62.5 %: about 0.88 of the inscribed square). */
const insideSquare = side => Math.floor(side * 0.625);

function options(argv) {
  const result = { size: 85, round: false };
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at];
    if (word === "--round") {
      result.round = true;
    } else if (word === "--size") {
      result.size = Number(argv[(at += 1)]);
    } else if (word === "--spell" || word === "--file") {
      result[word.slice(2)] = argv[(at += 1)];
    } else {
      throw new Error(`unknown option ${word}`);
    }
  }
  if (!result.spell || !result.file || !(result.size >= 32 && result.size <= 256)) {
    throw new Error("give --spell <name> --file <picture> (--size between 32 and 256)");
  }
  return result;
}

/** The picture as the other icons are: opaque, square, `size` px. */
export async function shapeIcon(bytes, { round, size }) {
  let picture = sharp(bytes, { pages: 1 }).rotate();
  if (round) {
    const { width, height } = await sharp(bytes, { pages: 1 }).metadata();
    const side = insideSquare(Math.min(width, height));
    picture = picture.extract({
      left: Math.floor((width - side) / 2),
      top: Math.floor((height - side) / 2),
      width: side,
      height: side
    });
  }
  return picture
    .resize({ width: size, height: size, fit: "cover", kernel: "lanczos3" })
    .flatten({ background: "#000000" })
    .png()
    .toBuffer();
}

async function main() {
  const wanted = options(process.argv.slice(2));
  const config = loadConfig();
  if (!config.db.password) {
    throw new Error("DB_PASSWORD is not set");
  }
  const store = createStore(config.db);
  try {
    await store.initializeDatabase();
    const catalog = await store.readCatalog();
    const spell = catalog.spells.find(
      entry => entry.name.toLowerCase() === wanted.spell.toLowerCase()
    );
    if (!spell) {
      throw new Error(`no spell named ${wanted.spell}`);
    }
    const png = await shapeIcon(readFileSync(wanted.file), wanted);
    const picture = await processCatalogImage(png, "image/png", { kind: "item" });
    const imageId = await store.saveImage(picture);
    const known = { imageIds: new Set([...(await store.imageIds()), imageId]) };
    const parsed = parseSpell({ ...spell, imageId }, known);
    await store.updateSpell(spell.id, parsed);
    console.log(
      `${spell.name}: picture ${imageId} (${wanted.size}x${wanted.size}, ${picture.length} bytes)`
    );
  } finally {
    await store.closeDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
