// The importer of the levels, prices and recipes of the items (scripts/catalog/import-recipes.mjs): what it plans
// from the data file, that it fills only what is empty, creates the small and intermediate items, writes the
// recipes with where each value was read, and that undoing it gives the catalogue back as it was.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, test } from "node:test";
import { applyRecipes, planRecipes, undoRecipes } from "./plan-recipes.mjs";
import { startTestServer } from "../../src/testing/test-app.js";

const stats = [
  { id: 1, name: "Max Health" },
  { id: 3, name: "Physical Attack" },
  { id: 11, name: "Critical Rate" }
];
const source = {
  price: "https://hub-game.com/hok/en/items",
  components: "https://hokstats.gg/items/"
};
const data = {
  readOn: "2026-11-01",
  items: [
    {
      name: "Iron Sword",
      gameId: 1111,
      tier: "basic",
      price: 275,
      shopCategory: "physical",
      stats: [{ stat: "Physical Attack", value: 20 }],
      components: [],
      sources: source
    },
    {
      name: "Pugilist's Gauntlet",
      gameId: 1113,
      tier: "basic",
      price: 300,
      shopCategory: "physical",
      stats: [{ stat: "Critical Rate", value: 8 }],
      components: [],
      sources: source
    },
    {
      name: "Thunderclap Brand",
      gameId: 1116,
      tier: "intermediate",
      price: 820,
      shopCategory: "physical",
      stats: [
        { stat: "Physical Attack", value: 35 },
        { stat: "Lucky Dice", value: 3 }
      ],
      components: ["Iron Sword", "Pugilist's Gauntlet"],
      sources: source
    },
    {
      name: "Master Sword",
      gameId: 1134,
      tier: "final",
      price: 2100,
      shopCategory: "physical",
      stats: [{ stat: "Max Health", value: 600 }],
      components: ["Thunderclap Brand"],
      sources: source
    },
    {
      name: "Mask of Agony",
      gameId: 1240,
      tier: "final",
      price: 2080,
      shopCategory: "magical",
      stats: [],
      components: [],
      sources: source
    },
    {
      name: "Boots of Dexterity",
      gameId: 1425,
      tier: "final",
      price: 700,
      shopCategory: "movement",
      stats: [],
      components: [],
      sources: source
    }
  ]
};
const catalog = {
  stats,
  items: [
    {
      id: 40,
      name: "Master Sword",
      category: "regular",
      shopCategory: null,
      tier: null,
      price: null,
      stats: [{ statId: 3, value: 55 }],
      components: [],
      imageId: "pic"
    },
    {
      id: 41,
      name: "Mask of Angony",
      category: "regular",
      shopCategory: "defense",
      tier: null,
      price: 1999,
      stats: [],
      components: [],
      imageId: "pic"
    }
  ]
};

describe("the plan (pure)", () => {
  const plan = planRecipes({ catalog, data });

  test("the missing small and intermediate items are created, the boots in the boots slot", () => {
    assert.deepEqual(
      plan.create.map(entry => [entry.name, entry.category, entry.tier, entry.price]),
      [
        ["Iron Sword", "regular", "basic", 275],
        ["Pugilist's Gauntlet", "regular", "basic", 300],
        ["Thunderclap Brand", "regular", "intermediate", 820],
        ["Boots of Dexterity", "boots", "final", 700]
      ]
    );
    const brand = plan.create.find(entry => entry.name === "Thunderclap Brand");
    assert.deepEqual(
      brand.stats,
      [{ statId: 3, value: 35 }],
      "a stat the catalogue does not know is left out"
    );
    assert.deepEqual(brand.sources, source);
  });

  test("an existing item gets only what it has not: its stats and its other choices stay", () => {
    const sword = plan.update.find(entry => entry.id === 40);
    assert.deepEqual(sword.changes, { tier: "final", price: 2100, shopCategory: "physical" });
    const mask = plan.update.find(entry => entry.id === 41);
    assert.deepEqual(mask.changes, { tier: "final" }, "the other spelling is the same item");
    assert.match(mask.kept.join(" "), /price 1999 kept \(the page says 2080\)/);
    assert.match(mask.kept.join(" "), /shop category defense kept \(the page says magical\)/);
  });

  test("the recipes, by name, for the items that have none", () => {
    assert.deepEqual(plan.recipes, [
      {
        name: "Thunderclap Brand",
        components: ["Iron Sword", "Pugilist's Gauntlet"],
        source: source.components
      },
      { name: "Master Sword", components: ["Thunderclap Brand"], source: source.components }
    ]);
    assert.deepEqual(plan.notes.unknownStats, ["Thunderclap Brand: Lucky Dice"]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("applying and undoing on a real database", { skip }, () => {
  test("the shipped data file reads, and every recipe names an item of the file", () => {
    const file = JSON.parse(
      readFileSync(new URL("./data/game-items-2026-11-01.json", import.meta.url), "utf8")
    );
    const names = new Set(file.items.map(entry => entry.name));
    assert.ok(file.items.length >= 100);
    for (const entry of file.items) {
      for (const part of entry.components) {
        assert.ok(names.has(part), `${entry.name}: ${part}`);
      }
      assert.ok(entry.sources.price, entry.name);
    }
  });

  test("the items, levels, prices and recipes are written, then taken back", async () => {
    const store = app.store;
    const before = await store.readCatalog();
    const statId = name => before.stats.find(stat => stat.name === name)?.id;
    const mine = await store.createItem({
      name: "Master Sword",
      category: "regular",
      shopCategory: null,
      price: null,
      imageId: null,
      description: "the owner's words",
      effects: [],
      stats: statId("Physical Attack") ? [{ statId: statId("Physical Attack"), value: 55 }] : [],
      tags: []
    });
    const plan = planRecipes({ catalog: await store.readCatalog(), data });
    const manifest = await applyRecipes({ store, plan });
    const after = await store.readCatalog();
    const byName = name => after.items.find(entry => entry.name === name);
    const sword = byName("Master Sword");
    assert.deepEqual(
      [sword.tier, sword.price, sword.description],
      ["final", 2100, "the owner's words"]
    );
    assert.deepEqual(sword.components, [byName("Thunderclap Brand").id]);
    assert.deepEqual(byName("Thunderclap Brand").components, [
      byName("Iron Sword").id,
      byName("Pugilist's Gauntlet").id
    ]);
    assert.equal(byName("Iron Sword").sources.price, source.price);

    const report = await undoRecipes({ store, manifest });
    assert.ok(report.length);
    const back = await store.readCatalog();
    assert.equal(
      back.items.find(entry => entry.name === "Iron Sword"),
      undefined
    );
    const restored = back.items.find(entry => entry.id === mine);
    assert.deepEqual([restored.tier, restored.price, restored.components], [null, null, []]);
    await store.deleteItem(mine);
  });
});
