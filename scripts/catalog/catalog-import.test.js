// The importer of pictures (scripts/catalog/import-images.mjs): what a file name becomes, the slot of an
// item, the colour of an arcana read from its picture, and the whole run against a throw-away
// database: it shows what it would do and writes nothing, creates the entries with their pictures,
// skips what is already there, writes a manifest, and takes it back.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import { arcanaColour, cleanName, slotOfName } from "./naming.mjs";
import { createStore } from "../../src/server/platform/database/store.js";
import { createTestDatabase } from "../../src/testing/test-app.js";

describe("what a file name becomes (pure)", () => {
  test("underscores, the HoK prefix and the level of an arcana go; nothing is added", () => {
    const cases = [
      ["Boots of Deftness.png", "item", "Boots of Deftness"],
      ["Axe_Of_Torment.png", "item", "Axe of Torment"],
      ["Haste_-_Sunpool.png", "item", "Haste - Sunpool"],
      ["HoK_Guardian_-_Howl.png", "item", "Guardian - Howl"],
      ["Immovable_-_Sky_Dome.png", "item", "Immovable - Sky Dome"],
      ["Master_Sword.png", "item", "Master Sword"],
      ["Overlords_Might.png", "item", "Overlords Might"],
      ["Eye of the Phoenix.png", "item", "Eye of the Phoenix"],
      ["Crimson Shadow - Starsping.png", "item", "Crimson Shadow - Starsping"],
      ["Late-game_Blade.png", "item", "Late-game Blade"],
      ["Mind%27s_Eye_Lv_V.webp", "arcana", "Mind's Eye"],
      ["Eagle_Eye_Lv_V.webp", "arcana", "Eagle Eye"],
      ["Red_Moon_Lv_V.webp", "arcana", "Red Moon"],
      ["Hunt_Lv_V.webp", "arcana", "Hunt"],
      ["The_Void_Lv_V.webp", "arcana", "The Void"],
      ["100%_Done.png", "item", "100% Done"]
    ];
    for (const [file, kind, wanted] of cases) {
      assert.equal(cleanName(file, kind), wanted, file);
    }
  });

  test("the level is only dropped for an arcana", () => {
    assert.equal(cleanName("Hunt_Lv_V.webp", "item"), "Hunt Lv V");
  });

  test("boots are boots, everything else is a regular item", () => {
    assert.equal(slotOfName("Boots of Deftness"), "boots");
    assert.equal(slotOfName("Boots of the Arcane"), "boots");
    for (const name of ["Blade of Despair", "Bootstrap Blade", "Guardian - Howl", "Master Sword"]) {
      assert.equal(slotOfName(name), "regular", name);
    }
  });
});

/** A round badge: `field` inside, a gold ring around, transparent outside. RGBA bytes. */
function badge(size, field) {
  const data = Buffer.alloc(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / (size / 2);
      const at = (y * size + x) * 4;
      const colour = distance > 0.86 ? [222, 170, 62] : field;
      data.set(distance > 1 ? [0, 0, 0, 0] : [...colour, 255], at);
    }
  }
  return data;
}
const png = async (size, field) =>
  sharp(badge(size, field), { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
const webp = async (size, field) =>
  sharp(badge(size, field), { raw: { width: size, height: size, channels: 4 } })
    .webp()
    .toBuffer();

describe("the colour of an arcana (pure)", () => {
  test("the field says it, the gold frame does not", () => {
    const raw = field => arcanaColour(badge(64, field));
    assert.equal(raw([40, 100, 210]).colour, "blue");
    assert.equal(raw([200, 50, 40]).colour, "red");
    assert.equal(raw([70, 190, 60]).colour, "green");
    assert.ok(raw([40, 100, 210]).share > 0.99);
  });

  test("when no colour is clear, none is given (a person is asked)", () => {
    assert.equal(arcanaColour(badge(64, [222, 170, 62])).colour, null, "gold only");
    assert.equal(arcanaColour(badge(64, [120, 120, 120])).colour, null, "grey");
    assert.equal(arcanaColour(Buffer.alloc(0)).colour, null, "no pixel");
    assert.equal(arcanaColour(badge(64, [40, 100, 210]), { minimumShare: 1.1 }).colour, null);
  });
});

const database = await createTestDatabase();
after(async () => {
  await database?.drop();
});
const skip = database ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the whole run, against a throw-away database", { skip }, () => {
  // five complete processes in a row (the store, sharp, the migrations): minutes when the machine is busy
  test(
    "it shows, creates, skips what exists, and takes it back",
    { timeout: 600_000 },
    async () => {
      const work = mkdtempSync(path.join(tmpdir(), "hok-import-"));
      let store = null;
      try {
        const items = path.join(work, "items");
        const arcana = path.join(work, "arcana");
        mkdirSync(items);
        mkdirSync(arcana);
        writeFileSync(path.join(items, "Axe_Of_Torment.png"), await png(256, [90, 60, 140]));
        writeFileSync(path.join(items, "Boots_Of_Speed.png"), await png(256, [40, 120, 160]));
        writeFileSync(path.join(items, "notes.txt"), "not a picture");
        writeFileSync(path.join(arcana, "Mind%27s_Eye_Lv_V.webp"), await webp(64, [70, 190, 60]));
        writeFileSync(path.join(arcana, "Murky_Lv_V.webp"), await webp(64, [222, 170, 62]));
        const config = database.config;
        const env = {
          ...process.env,
          NODE_ENV: "test",
          DB_HOST: config.host,
          DB_PORT: String(config.port),
          DB_NAME: config.database,
          DB_USER: config.user,
          DB_PASSWORD: config.password
        };
        const run = (...args) =>
          spawnSync(
            process.execPath,
            [path.resolve("scripts/catalog/import-images.mjs"), ...args],
            {
              cwd: work,
              env,
              encoding: "utf8"
            }
          );
        store = createStore(config);
        await store.initializeDatabase();
        // the importer writes with a store of its own: a store that has read the catalogue lately would
        // answer from memory, so each reading is made by a new one
        const freshCatalog = async () => {
          const reader = createStore(config);
          try {
            return await reader.readCatalog();
          } finally {
            await reader.closeDatabase();
          }
        };

        // 1. no --apply: it shows, and writes nothing
        const shown = run("--items", items, "--arcana", arcana);
        assert.equal(shown.status, 0, shown.stderr);
        assert.match(shown.stdout, /item\s+Axe of Torment\s+regular/);
        assert.match(shown.stdout, /item\s+Boots of Speed\s+boots/);
        assert.match(shown.stdout, /arcana\s+Mind's Eye\s+green/);
        assert.match(shown.stdout, /Murky.*SKIPPED: its colour is not clear/);
        assert.match(shown.stdout, /3 of 4 would be created/);
        assert.equal((await freshCatalog()).items.length, 0);
        assert.equal(readdirSync(work).includes("backups"), false);

        // 2. --apply: the entries, with their pictures and nothing else
        const done = run("--items", items, "--arcana", arcana, "--apply");
        assert.equal(done.status, 0, done.stderr);
        assert.match(done.stdout, /created 2 item\(s\) and 1 arcana; 1 skipped/);
        assert.ok(!done.stdout.includes(config.password), "the password is never printed");
        const catalog = await freshCatalog();
        const byName = Object.fromEntries(catalog.items.map(entry => [entry.name, entry]));
        assert.deepEqual(Object.keys(byName).sort(), ["Axe of Torment", "Boots of Speed"]);
        assert.deepEqual(
          [byName["Axe of Torment"].category, byName["Boots of Speed"].category],
          ["regular", "boots"]
        );
        for (const entry of catalog.items) {
          assert.deepEqual(
            [
              entry.shopCategory,
              entry.price,
              entry.stats,
              entry.effects,
              entry.tags,
              entry.description
            ],
            [null, null, [], [], [], ""],
            "nothing is invented"
          );
          const picture = await store.getImage(entry.imageId);
          const meta = await sharp(picture.data).metadata();
          assert.deepEqual([meta.width, meta.height, meta.format], [256, 256, "webp"]);
        }
        assert.deepEqual(
          catalog.arcana.map(entry => [entry.name, entry.color, entry.stats.length]),
          [["Mind's Eye", "green", 0]]
        );
        const bigger = await sharp(
          (await store.getImage(catalog.arcana[0].imageId)).data
        ).metadata();
        assert.equal(bigger.width, 128, "an arcana drawn at 64 px is made 128 px");

        // 3. again: everything is already there, nothing changes
        const again = run("--items", items, "--arcana", arcana, "--apply");
        assert.match(again.stdout, /created 0 item\(s\) and 0 arcana; 4 skipped/);
        assert.match(again.stdout, /already in the catalogue/);
        assert.equal((await freshCatalog()).items.length, 2);

        // 4. the manifest takes it back; a dry run only says
        const manifest = path.join(work, "backups", readdirSync(path.join(work, "backups"))[0]);
        assert.equal(JSON.parse(readFileSync(manifest, "utf8")).items.length, 2);
        const dry = run("--undo", manifest);
        assert.match(dry.stdout, /would remove item Axe of Torment/);
        assert.equal((await freshCatalog()).items.length, 2);
        const gone = run("--undo", manifest, "--apply");
        assert.match(gone.stdout, /removed 3, kept 0/);
        const empty = await freshCatalog();
        assert.deepEqual([empty.items.length, empty.arcana.length], [0, 0]);
        const [[pictures]] = await store.pool.query("SELECT COUNT(*) AS n FROM catalog_images");
        assert.equal(Number(pictures.n), 0, "their pictures went with them");
      } finally {
        // closed whatever happened: an open pool would keep the test process alive
        await store?.closeDatabase().catch(() => {});
        rmSync(work, { recursive: true, force: true });
      }
    }
  );

  test("it refuses what it does not understand", () => {
    const bad = spawnSync(process.execPath, [path.resolve("scripts/catalog/import-images.mjs")], {
      encoding: "utf8"
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /give --items/);
    const odd = spawnSync(
      process.execPath,
      [path.resolve("scripts/catalog/import-images.mjs"), "--frobnicate"],
      { encoding: "utf8" }
    );
    assert.equal(odd.status, 1);
    assert.match(odd.stderr, /unknown option/);
  });
});
