// The importer of the data of the game (scripts/catalog/): what it reads in the three saved pages, what it
// plans, and that applying and undoing it on a real database changes what it says and nothing else.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  nameKey,
  parseArcanaPage,
  parseBonuses,
  parseSpellsPage,
  parseWikiItems
} from "./sources.mjs";
import { applyPlan, fetchIcon, planImport, undoManifest } from "./plan-data.mjs";
import { startTestServer } from "../../src/testing/test-app.js";

const table = (title, rows) =>
  `<table><tr><th>${title}</th><th>Effects</th><th>Bonuses</th></tr>${rows
    .map(([name, effect, bonus]) => `<tr><td>${name}</td><td>${effect}</td><td>${bonus}</td></tr>`)
    .join("")}</table>`;
const WIKI = [
  table("Items", [
    [
      "Axe of Torment",
      "Great against squishy targets",
      "80 Physical Attack, 10% Cooldown Reduction, and 500 Max Health"
    ],
    ["Pure Sky and Sky Dome", "Two in one", "80 Physical Attack"],
    ["Old Thing - Removed &amp; Reworked", "Gone", "10 Physical Attack"]
  ]),
  table("Magic Items", [
    [
      "Mask of Agony",
      "More magic",
      "100 Magical Attack, 7.5% Cooldown Reduction, and 900 Max Health"
    ],
    ["Scepter of Reverberation", "Typo on the page", "210% Magical Attack and 7.5% Movement Speed"]
  ]),
  table("Defense Items", [
    ["Sage’s Sanctuary", "Both defenses", "140 Physical and Magical Defense"],
    [
      "Eye of the Phoenix",
      "Regen",
      "240 Magical Defense, 1200 Max Health, 100 Health per 5 seconds"
    ]
  ]),
  table("Movement Items", [["Boots of Fortitude", "Less physical damage", "120 Physical Defense"]]),
  table("Jungling Items", []),
  table("Roaming Items", [["Guardian", "Shields allies", "500 Max Health and 6% Movement Speed"]])
].join("<p>between</p>");

const ARCANA = `<html><body>
<h2>🔴 Red Arcana — Attack</h2>
<img alt="Lvl 5: Calamity"><h3>Calamity</h3><p>Critical Rate +1.6%</p>
<img alt="Lvl 5: Conflict"><h3>Conflict</h3><p>Physical Attack +2.5 Physical Lifesteal +0.5%</p>
<h2>🟢 Green Arcana — Survival</h2>
<img alt="Lvl 5: Longevity"><h3>Longevity</h3><p>Max Health +75</p>
<h2>🔵 Blue Arcana — Utility</h2>
<img alt="Lvl 5: Void"><h3>Void</h3><p>Max Health +37.5 Cooldown Reduction +0.6%</p>
<p>Stat values shown are for Level 5 arcana — the standard tier.</p>
</body></html>`;

const SPELLS = `<html><body>
<div><img src="https://game.gtimg.cn/images/yxzj/img201606/summoner/80115.jpg" alt="Flash battle spell icon"><h3>Flash</h3><p>Cooldown 120 seconds</p><p>Teleports the hero a short distance.</p><h4>Best for</h4><p>Escape.</p></div>
<div><img src="https://game.gtimg.cn/images/yxzj/img201606/summoner/80102.jpg" alt="Heal battle spell icon"><h3>Heal</h3><p>Cooldown 120 seconds</p><p>Restores 15% Health.</p><h4>Best for</h4><p>Sustain.</p></div>
</body></html>`;

describe("reading the pages", () => {
  test("the names of two spellings of one item share a key", () => {
    assert.equal(nameKey("Sage’s Tome"), nameKey("Sage's  Tome"));
    assert.equal(nameKey("Axe of Torment"), nameKey("axe of torment"));
    assert.notEqual(nameKey("Guardian"), nameKey("Guardian - Howl"));
  });

  test("a sentence of bonuses becomes lines, or nothing when one piece cannot be read", () => {
    assert.deepEqual(
      parseBonuses("80 Physical Attack, 10% Cooldown Reduction, and 500 Max Health").lines,
      [
        { stat: "Physical Attack", value: 80, percent: false },
        { stat: "Cooldown Reduction", value: 10, percent: true },
        { stat: "Max Health", value: 500, percent: false }
      ]
    );
    assert.deepEqual(
      parseBonuses("140 Physical and Magical Defense").lines.map(line => line.stat),
      ["Physical Defense", "Magical Defense"]
    );
    assert.deepEqual(parseBonuses("40 Physical Attack and 7.5% Movement Speed").lines.length, 2);
    assert.match(parseBonuses("210% Magical Attack").problem, /percentage|whole/);
    assert.match(parseBonuses("100 Health per 5 seconds").problem, /unknown stat|cannot read/);
    assert.match(parseBonuses("30 Physical Attack, 30 Physical Attack").problem, /twice/);
    assert.ok(parseBonuses("").problem);
  });

  test("the six tables are the six shop categories; unreadable or ambiguous rows are listed, not guessed", () => {
    const { items, skipped } = parseWikiItems(WIKI);
    assert.deepEqual(
      items.map(item => [item.name, item.shopCategory]),
      [
        ["Axe of Torment", "physical"],
        ["Mask of Agony", "magical"],
        ["Sage’s Sanctuary", "defense"],
        ["Boots of Fortitude", "movement"],
        ["Guardian", "roaming"]
      ]
    );
    assert.equal(items[0].effect, "Great against squishy targets");
    const why = Object.fromEntries(skipped.map(row => [row.name, row.reason]));
    assert.match(why["Pure Sky and Sky Dome"], /two items/);
    assert.match(why["Old Thing - Removed & Reworked"], /removed/);
    assert.match(why["Scepter of Reverberation"], /percentage|whole/);
    assert.match(why["Eye of the Phoenix"], /unknown stat|cannot read/);
  });

  test("the arcana of the guide: colour from the section, level-5 stats, the last one is not eaten by the prose", () => {
    const { arcana, skipped } = parseArcanaPage(ARCANA);
    assert.deepEqual(skipped, []);
    assert.deepEqual(
      arcana.map(piece => [
        piece.color,
        piece.name,
        piece.lines.map(line => `${line.stat} ${line.value}${line.percent ? "%" : ""}`)
      ]),
      [
        ["red", "Calamity", ["Critical Rate 1.6%"]],
        ["red", "Conflict", ["Physical Attack 2.5", "Physical Lifesteal 0.5%"]],
        ["green", "Longevity", ["Max Health 75"]],
        ["blue", "Void", ["Max Health 37.5", "Cooldown Reduction 0.6%"]]
      ]
    );
  });

  test("the spells: name, cooldown, what it does, the address of the icon", () => {
    const { spells, skipped } = parseSpellsPage(SPELLS);
    assert.deepEqual(skipped, []);
    assert.deepEqual(spells, [
      {
        name: "Flash",
        cooldownSeconds: 120,
        description: "Teleports the hero a short distance.",
        iconUrl: "https://game.gtimg.cn/images/yxzj/img201606/summoner/80115.jpg"
      },
      {
        name: "Heal",
        cooldownSeconds: 120,
        description: "Restores 15% Health.",
        iconUrl: "https://game.gtimg.cn/images/yxzj/img201606/summoner/80102.jpg"
      }
    ]);
  });
});

const baseCatalog = (extra = {}) => ({
  stats: [],
  tags: [],
  items: [],
  arcana: [],
  spells: [],
  ...extra
});
const item = (id, name, extra = {}) => ({
  id,
  name,
  category: "regular",
  shopCategory: null,
  price: null,
  imageId: null,
  description: "",
  effects: [],
  stats: [],
  tags: [],
  ...extra
});

describe("planning", () => {
  const wiki = parseWikiItems(WIKI);

  test("an item gets the category of its table, its stats and its effect line, only where it has none", () => {
    const plan = planImport({
      catalog: baseCatalog({
        items: [
          item(1, "Axe of Torment"),
          item(2, "Boots of Fortitude", {
            shopCategory: "defense",
            description: "mine",
            stats: [{ statId: 9, value: 1 }]
          })
        ]
      }),
      wiki
    });
    assert.deepEqual(
      plan.items.map(entry => entry.name),
      ["Axe of Torment"]
    );
    assert.equal(plan.items[0].changes.shopCategory, "physical");
    assert.equal(plan.items[0].changes.stats.length, 3);
    assert.equal(plan.items[0].changes.description, "Great against squishy targets");
    const note = plan.notes.items.find(entry => entry.name === "Boots of Fortitude");
    assert.match(note.why, /category: yours is defense, the wiki table is movement/);
    assert.match(note.why, /stats: already written/);
  });

  test("a spelling difference is matched and said; two different items are never merged", () => {
    const plan = planImport({
      catalog: baseCatalog({ items: [item(3, "Mask of Angony"), item(4, "Guardian - Howl")] }),
      wiki
    });
    assert.deepEqual(
      plan.items.map(entry => entry.name),
      ["Mask of Angony"]
    );
    assert.ok(plan.items[0].kept.some(text => /matched by spelling/.test(text)));
    assert.ok(
      plan.notes.items.some(
        entry => entry.name === "Guardian - Howl" && /not on the wiki/.test(entry.why)
      )
    );
    assert.ok(plan.notes.items.some(entry => entry.wiki === "Guardian"));
  });

  test("a stat is created once, with the unit the page gives; an existing one of another unit blocks its lines", () => {
    const plan = planImport({
      catalog: baseCatalog({ items: [item(1, "Axe of Torment")] }),
      wiki
    });
    assert.deepEqual(
      plan.stats.map(stat => [stat.name, stat.unit]),
      [
        ["Physical Attack", "flat"],
        ["Max Health", "flat"],
        ["Cooldown Reduction", "percent"]
      ]
    );
    // the owner's own stats come first: a percentage next to their flat stat is a stat of its own ("… Bonus")
    const own = planImport({
      catalog: baseCatalog({
        items: [item(1, "Axe of Torment")],
        stats: [
          { id: 5, name: "Cooldown Reduction", unit: "flat", sortOrder: 0 },
          { id: 6, name: "Max Health", unit: "flat", sortOrder: 1 },
          { id: 7, name: "Physical Attack", unit: "flat", sortOrder: 2 }
        ]
      }),
      wiki
    });
    assert.deepEqual(
      own.items[0].changes.stats.map(line => line.stat),
      ["Physical Attack", "Cooldown Reduction Bonus", "Max Health"]
    );
    assert.deepEqual(
      own.stats.map(stat => [stat.name, stat.unit]),
      [["Cooldown Reduction Bonus", "percent"]]
    );
    // the owner's "Attack Speed Bonus" is the "Attack Speed" of the pages
    const synonym = planImport({
      catalog: baseCatalog({
        items: [item(2, "Doomsday")],
        stats: [{ id: 9, name: "Attack Speed Bonus", unit: "percent", sortOrder: 0 }]
      }),
      wiki: {
        items: [
          {
            name: "Doomsday",
            shopCategory: "physical",
            effect: "",
            lines: [{ stat: "Attack Speed", value: 20, percent: true }]
          }
        ],
        skipped: []
      }
    });
    assert.equal(synonym.items[0].changes.stats[0].stat, "Attack Speed Bonus");
    assert.deepEqual(synonym.stats, [], "nothing created: theirs is used");
    // a percent stat of theirs cannot take a whole value: the line is not written, the rest still is
    const wrong = planImport({
      catalog: baseCatalog({
        items: [item(3, "Doomsday")],
        stats: [{ id: 9, name: "Critical Rate", unit: "percent", sortOrder: 0 }]
      }),
      wiki: {
        items: [
          {
            name: "Doomsday",
            shopCategory: "physical",
            effect: "",
            lines: [{ stat: "Critical Rate", value: 20, percent: false }]
          }
        ],
        skipped: []
      }
    });
    assert.equal(wrong.items[0].changes.stats, undefined);
    assert.match(wrong.notes.stats[0], /Critical Rate/);
  });

  test("an arcana only gets stats when the colours agree and it has none", () => {
    const guide = parseArcanaPage(ARCANA);
    const plan = planImport({
      catalog: baseCatalog({
        arcana: [
          { id: 1, name: "Calamity", color: "red", stats: [], tags: [] },
          { id: 2, name: "Conflict", color: "blue", stats: [], tags: [] },
          { id: 3, name: "Longevity", color: "green", stats: [{ statId: 1, value: 9 }], tags: [] },
          { id: 4, name: "Unknown", color: "red", stats: [], tags: [] },
          { id: 5, name: "Void", color: "green", stats: [], tags: [] }
        ]
      }),
      arcana: guide
    });
    assert.deepEqual(
      plan.arcana.map(entry => entry.name),
      ["Calamity", "Void"]
    );
    assert.deepEqual(plan.arcana[0].kept, []);
    assert.match(
      plan.arcana[1].kept[0],
      /guide says blue, the picture and the catalogue say green \(kept\)/,
      "blue and green are the two the guide and the pictures name the other way round"
    );
    const why = Object.fromEntries(
      plan.notes.arcana.map(note => [note.name ?? note.guide, note.why])
    );
    assert.match(why.Conflict, /lists it as red/);
    assert.match(why.Longevity, /already written/);
    assert.match(why.Unknown, /not on the guide/);
  });

  test("a spell is created unless one has that name", () => {
    const plan = planImport({
      catalog: baseCatalog({ spells: [{ id: 1, name: "flash" }] }),
      spells: parseSpellsPage(SPELLS)
    });
    assert.deepEqual(
      plan.spells.map(spell => spell.name),
      ["Heal"]
    );
  });
});

describe("downloading an icon", () => {
  test("only from the official image host, over https, only an image, never a redirect", async () => {
    const calls = [];
    const fake = async (address, options) => {
      calls.push([String(address), options.redirect]);
      return new Response(Buffer.from("not an image"), {
        headers: { "content-type": "text/html" }
      });
    };
    assert.equal(await fetchIcon("https://example.test/a.jpg", fake), null);
    assert.equal(await fetchIcon("http://game.gtimg.cn/a.jpg", fake), null);
    assert.equal(await fetchIcon("not an address", fake), null);
    assert.deepEqual(calls, [], "nothing was requested from those");
    assert.equal(
      await fetchIcon("https://game.gtimg.cn/a.jpg", fake),
      null,
      "a page is not an image"
    );
    assert.deepEqual(calls, [["https://game.gtimg.cn/a.jpg", "error"]]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("applying and undoing on a real database", { skip }, () => {
  test("it completes what is empty, keeps what is written, and undo gives everything back", async () => {
    const admin = await app.signIn("Importer", { admin: true });
    const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
    const own = await post("/api/admin/catalog/items", {
      name: "Axe of Torment",
      category: "regular",
      stats: []
    });
    const written = await post("/api/admin/catalog/items", {
      name: "Boots of Fortitude",
      category: "boots",
      shopCategory: "defense",
      description: "my own words",
      stats: []
    });
    const arcana = await post("/api/admin/catalog/arcana", {
      name: "Calamity",
      color: "red",
      stats: []
    });
    const beforeCatalog = (await app.browser().get("/api/catalog")).body;

    const plan = planImport({
      catalog: await app.store.readCatalog(),
      wiki: parseWikiItems(WIKI),
      arcana: parseArcanaPage(ARCANA),
      spells: parseSpellsPage(SPELLS)
    });
    const icon = Buffer.from(
      "UklGRiYAAABXRUJQVlA4IBoAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=",
      "base64"
    ); // a 1x1 WebP
    const manifest = await applyPlan({
      store: app.store,
      plan,
      fetchImage: async url => (/80115/.test(url) ? icon : null)
    });

    const after = (await app.browser().get("/api/catalog")).body;
    const axe = after.items.find(entry => entry.id === own);
    assert.equal(axe.shopCategory, "physical");
    assert.equal(axe.description, "Great against squishy targets");
    const statName = id => after.stats.find(stat => stat.id === id).name;
    assert.deepEqual(
      axe.stats.map(line => [statName(line.statId), line.value]),
      [
        ["Physical Attack", 80],
        ["Cooldown Reduction", 10],
        ["Max Health", 500]
      ]
    );
    assert.equal(after.stats.find(stat => stat.name === "Cooldown Reduction").unit, "percent");
    const mine = after.items.find(entry => entry.id === written);
    assert.equal(mine.shopCategory, "defense", "the owner's category is kept");
    assert.equal(mine.description, "my own words");
    assert.equal(mine.category, "boots", "the slot is never touched");
    assert.deepEqual(
      mine.stats.map(line => statName(line.statId)),
      ["Physical Defense"],
      "empty stats are filled"
    );
    assert.deepEqual(
      after.arcana
        .find(entry => entry.id === arcana)
        .stats.map(line => [statName(line.statId), line.value]),
      [["Critical Rate", 1.6]]
    );
    assert.deepEqual(
      after.spells.map(spell => [spell.name, spell.cooldownSeconds, Boolean(spell.imageId)]).sort(),
      [
        ["Flash", 120, true],
        ["Heal", 120, false]
      ]
    );
    assert.equal(manifest.items.length, 2);
    assert.equal(manifest.spells.length, 2);

    // running it again completes nothing more
    const again = planImport({
      catalog: await app.store.readCatalog(),
      wiki: parseWikiItems(WIKI),
      arcana: parseArcanaPage(ARCANA),
      spells: parseSpellsPage(SPELLS)
    });
    assert.deepEqual(
      [again.items.length, again.arcana.length, again.spells.length, again.stats.length],
      [0, 0, 0, 0]
    );

    const report = await undoManifest({ store: app.store, manifest });
    assert.ok(report.some(line => /removed spell Flash/.test(line)));
    const restored = (await app.browser().get("/api/catalog")).body;
    const strip = items =>
      items.map(({ id, name, shopCategory, description, stats }) => ({
        id,
        name,
        shopCategory,
        description,
        stats
      }));
    assert.deepEqual(
      strip(restored.items.filter(entry => [own, written].includes(entry.id))),
      strip(beforeCatalog.items.filter(entry => [own, written].includes(entry.id)))
    );
    assert.deepEqual(restored.spells, []);
    assert.equal(
      restored.stats.length,
      beforeCatalog.stats.length,
      "the stats it created are gone"
    );
  });
});
