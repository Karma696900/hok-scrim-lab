// The stats a passive or an active of an item gives: written like the lines of the item (temporary or
// not, with conditions), checked by the server, counted in the build lab like the stats of the item but
// only for the heroes the effect is for (a temporary one apart from the total), and counted as uses of
// the stat so that a stat in use cannot be deleted.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeStats, emptyBuild } from "../../../shared/build-model.js";
import { EFFECT_STATS_MAX, parseItem } from "./catalog-domain.js";
import { statUsage } from "./usage.js";

const HP = { id: 1, name: "Max HP", unit: "flat", sortOrder: 1, options: [] };
const SPEED = { id: 2, name: "Movement Speed", unit: "percent", sortOrder: 2, options: [] };
const RANGE = {
  id: 7,
  name: "Attack range",
  unit: "choice",
  sortOrder: 3,
  options: [
    { id: 1, name: "Melee" },
    { id: 2, name: "Ranged" }
  ]
};
const stats = [HP, SPEED, RANGE];
const known = {
  stats: new Map(stats.map(entry => [entry.id, entry])),
  tagIds: new Set(),
  imageIds: new Set(),
  heroIds: new Set(["h01"]),
  roles: new Set(["Fighter"])
};
const melee = { match: "all", of: [{ kind: "stat", statId: 7, options: [1] }] };
const ranged = { match: "all", of: [{ kind: "stat", statId: 7, options: [2] }] };
const refuses = (build, pattern = /./) =>
  assert.throws(build, error => error.status === 400 && pattern.test(error.message));

const boots = {
  name: "Swift Boots",
  category: "boots",
  stats: [{ statId: 1, value: 100 }],
  effects: [
    {
      kind: "passive",
      name: "Swift",
      text: "Moves faster.",
      stats: [
        { statId: 2, value: 5 },
        { statId: 2, value: 20, temporary: true, durationSeconds: 2, note: "after a kill" }
      ]
    },
    {
      kind: "active",
      name: "Guard",
      text: "Melee heroes gain health.",
      cooldownSeconds: 60,
      when: melee,
      stats: [{ statId: 1, value: 300 }]
    },
    { kind: "passive", name: "Plain", text: "No stats." }
  ]
};

describe("the stats of a passive or an active (pure)", () => {
  test("are written like the lines of the item, and an effect without any has none", () => {
    const parsed = parseItem(boots, known);
    assert.deepEqual(parsed.effects[0].stats, [
      { statId: 2, value: 5 },
      { statId: 2, value: 20, temporary: true, durationSeconds: 2, note: "after a kill" }
    ]);
    assert.deepEqual(parsed.effects[1].stats, [{ statId: 1, value: 300 }]);
    assert.equal("stats" in parsed.effects[2], false);
    assert.deepEqual(
      parsed.stats,
      [{ statId: 1, value: 100 }],
      "the item keeps its own lines apart"
    );
  });

  test("an unknown stat, a value of the wrong kind or too many lines are refused", () => {
    const withLines = lines => ({
      ...boots,
      effects: [{ kind: "passive", name: "", text: "x", stats: lines }]
    });
    refuses(() => parseItem(withLines([{ statId: 99, value: 1 }]), known));
    refuses(() => parseItem(withLines([{ statId: 7, value: 3 }]), known));
    refuses(() =>
      parseItem(
        withLines(Array.from({ length: EFFECT_STATS_MAX + 1 }, () => ({ statId: 1, value: 1 }))),
        known
      )
    );
  });
});

describe("what the stats of the effects give to a hero", () => {
  const catalog = {
    stats,
    tags: [],
    items: [{ id: 5, tags: [], ...parseItem(boots, known) }],
    arcana: []
  };
  const build = { ...emptyBuild(), items: [5] };
  const profile = range => ({
    baseStats: [
      { statId: 7, option: range },
      { statId: 1, value: 3000, growth: 0 }
    ],
    tags: [],
    updatedAt: 1
  });
  const hero = { id: "h01", roles: ["Fighter"], lanes: [] };
  const row = (rows, statId) => rows.find(entry => entry.statId === statId);

  test("a permanent one counts in the total, a temporary one apart", () => {
    const { rows, notes } = computeStats(profile(2), build, 1, catalog, hero);
    const speed = row(rows, 2);
    assert.deepEqual([speed.items, speed.total, speed.temporary], [5, 5, 20]);
    assert.equal(notes.temporary.length, 1);
  });

  test("only for the heroes its effect is for", () => {
    const meleeRows = computeStats(profile(1), build, 1, catalog, hero).rows;
    assert.deepEqual([row(meleeRows, 1).items, row(meleeRows, 1).total], [400, 3400]);
    const rangedResult = computeStats(profile(2), build, 1, catalog, hero);
    assert.deepEqual(
      [row(rangedResult.rows, 1).items, row(rangedResult.rows, 1).total],
      [100, 3100]
    );
    assert.equal(
      rangedResult.notes.skipped.length,
      1,
      "the 300 HP of the active, for melee heroes"
    );
  });

  test("a line of an effect has the conditions of its effect and its own", () => {
    const both = {
      ...catalog,
      items: [
        {
          ...catalog.items[0],
          effects: [
            { ...catalog.items[0].effects[1], stats: [{ statId: 1, value: 50, when: ranged }] }
          ]
        }
      ]
    };
    const rows = computeStats(profile(2), build, 1, both, hero).rows;
    assert.equal(
      row(rows, 1).items,
      100,
      "for melee by its effect and for ranged by itself: never"
    );
  });

  test("a stat used only by an effect is in use", () => {
    const data = { catalog, profiles: [] };
    assert.equal(statUsage(data, 2), 1);
    assert.equal(statUsage(data, 1), 1, "the item counts once");
  });
});
