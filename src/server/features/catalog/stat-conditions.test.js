// What a stat can hold (a whole number, a number, a percentage, a choice such as Melee or Ranged) and
// the lines of the items and arcana that are temporary or depend on conditions about the hero. First
// the pure rules (the conditions, what is added up, what is accepted), then the admin API.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { computeStats, emptyBuild, formatEntry, totalStats } from "../../../shared/build-model.js";
import {
  conditionsOf,
  depthOf,
  evaluate,
  heroFacts,
  keyOf,
  MAX_CONDITIONS,
  MAX_DEPTH
} from "../../../shared/condition-model.js";
import { isChoice, optionOf, statAtLevel } from "../../../shared/stat-values.js";
import { parseWhen } from "./conditions.js";
import { parseArcana, parseHeroProfile, parseItem, parseStat, valueFor } from "./catalog-domain.js";
import { fractionalUsage, optionUsage, statUsage, tagConditionUsage } from "./usage.js";
import { startTestServer } from "../../../testing/test-app.js";

const refuses = (build, pattern = /./) =>
  assert.throws(build, error => error.status === 400 && pattern.test(error.message));

// ---- a small catalogue ----------------------------------------------------------------------------------------------
const HP = { id: 1, name: "Max HP", unit: "flat", sortOrder: 2, options: [] };
const CRIT = { id: 3, name: "Crit Rate", unit: "percent", sortOrder: 4, options: [] };
const ARMOR = { id: 4, name: "Armor", unit: "whole", sortOrder: 5, options: [] };
const RANGE = {
  id: 7,
  name: "Attack range",
  unit: "choice",
  sortOrder: 1,
  options: [
    { id: 1, name: "Melee" },
    { id: 2, name: "Ranged" }
  ]
};
const BONUS = { id: 8, name: "Range bonus", unit: "flat", sortOrder: 3, options: [] };
const stats = [HP, CRIT, ARMOR, RANGE, BONUS];

const is = (statId, ...options) => ({ match: "all", of: [{ kind: "stat", statId, options }] });
const melee = is(7, 1);
const ranged = is(7, 2);

const fixture = {
  stats,
  tags: [
    { id: 1, name: "Marksman", color: "red", conflicts: [] },
    { id: 2, name: "Tank", color: "green", conflicts: [] }
  ],
  items: [
    {
      id: 10,
      name: "Blade",
      category: "regular",
      tags: [],
      stats: [
        { statId: 1, value: 400 },
        { statId: 1, value: 100, when: melee },
        { statId: 1, value: 50, when: ranged },
        {
          statId: 8,
          value: 1.5,
          temporary: true,
          durationSeconds: 3,
          note: "after the active",
          when: ranged
        }
      ],
      effects: [
        { kind: "passive", name: "Edge", text: "For everybody.", cooldownSeconds: null },
        { kind: "passive", name: "Edge", text: "For melee.", cooldownSeconds: null, when: melee }
      ]
    },
    {
      id: 11,
      name: "Charm",
      category: "regular",
      tags: [],
      stats: [
        {
          statId: 7,
          option: 2,
          when: { match: "all", of: [{ kind: "level", op: ">=", value: 10 }] }
        }
      ]
    },
    {
      id: 12,
      name: "Wings",
      category: "boots",
      tags: [],
      stats: [{ statId: 7, option: 2, temporary: true, durationSeconds: 5 }]
    }
  ],
  arcana: [
    { id: 100, name: "Zeal", color: "red", tags: [], stats: [{ statId: 1, value: 5, when: melee }] }
  ]
};
const hero = { id: "h01", roles: ["Fighter"], lanes: ["Clash Lane"] };
const meleeProfile = {
  baseStats: [
    { statId: 7, option: 1 },
    { statId: 1, value: 3000, growth: 100 }
  ],
  tags: [],
  updatedAt: 1
};
const rangedProfile = {
  ...meleeProfile,
  baseStats: [{ statId: 7, option: 2 }, meleeProfile.baseStats[1]]
};
const build = (items = [], arcana = []) => ({
  ...emptyBuild(),
  items,
  arcana: { red: arcana, blue: [], green: [] }
});
const rowOf = (rows, statId) => rows.find(row => row.statId === statId);

describe("the kinds of stat", () => {
  test("four ways to write a value; only a choice has options", () => {
    assert.ok(isChoice(RANGE));
    assert.ok(!isChoice(HP) && !isChoice(CRIT) && !isChoice(ARMOR) && !isChoice(undefined));
    assert.equal(optionOf(RANGE, 2).name, "Ranged");
    assert.equal(optionOf(RANGE, 9), null);
    assert.equal(optionOf(HP, 1), null);
    assert.equal(formatEntry(RANGE, { option: 1 }), "Melee");
    assert.equal(formatEntry(RANGE, { option: 9 }), "");
    assert.equal(formatEntry(CRIT, { value: 15 }), "+15%");
    assert.equal(formatEntry(HP, { value: -50 }), "-50");
    assert.equal(statAtLevel({ value: 3000, growth: 100 }, 5), 3400);
  });
});

describe("the conditions about a hero", () => {
  const facts = heroFacts(hero, meleeProfile, 8);

  test("no condition holds for everybody, a hero or not; with no hero everything else is unknown", () => {
    assert.equal(evaluate(null, null), true);
    assert.equal(evaluate(undefined, facts), true);
    assert.equal(evaluate({ match: "all", of: [] }, null), true);
    assert.equal(evaluate(melee, null), null);
    assert.equal(heroFacts(null, meleeProfile, 8), null);
  });

  test("a choice stat of the hero is one of the options; a stat that was not entered is unknown", () => {
    assert.equal(evaluate(melee, facts), true);
    assert.equal(evaluate(ranged, facts), false);
    assert.equal(evaluate(is(7, 1, 2), facts), true, "one of several");
    assert.equal(evaluate(is(7, 2), heroFacts(hero, { ...meleeProfile, baseStats: [] }, 8)), null);
    assert.equal(
      evaluate(
        is(7, 2),
        heroFacts(hero, { baseStats: [{ statId: 7 }], tags: [], updatedAt: 1 }, 8)
      ),
      null,
      "an entry without an option says nothing"
    );
  });

  test("a number stat is compared at the level of the build, growth included", () => {
    const hp = (op, value) => ({
      match: "all",
      of: [{ kind: "stat", statId: 1, op, value }]
    });
    assert.equal(evaluate(hp(">=", 3400), heroFacts(hero, meleeProfile, 5)), true);
    assert.equal(evaluate(hp(">=", 3400), heroFacts(hero, meleeProfile, 4)), false);
    assert.equal(evaluate(hp(">", 3400), heroFacts(hero, meleeProfile, 5)), false);
    assert.equal(evaluate(hp("<=", 3000), heroFacts(hero, meleeProfile, 1)), true);
    assert.equal(evaluate(hp("<", 3000), heroFacts(hero, meleeProfile, 1)), false);
    assert.equal(evaluate(hp("=", 3100), heroFacts(hero, meleeProfile, 2)), true);
    assert.equal(
      evaluate(hp("~", 3100), facts),
      null,
      "an operator that does not exist says nothing"
    );
    assert.equal(
      evaluate({ match: "all", of: [{ kind: "stat", statId: 7, op: ">=", value: 1 }] }, facts),
      null,
      "a choice has no number to compare"
    );
  });

  test("the class, the lane, the hero and the level", () => {
    const one = condition => ({ match: "all", of: [condition] });
    assert.equal(evaluate(one({ kind: "role", role: "Fighter" }), facts), true);
    assert.equal(evaluate(one({ kind: "role", role: "Mage" }), facts), false);
    assert.equal(evaluate(one({ kind: "lane", lane: "Clash Lane" }), facts), true);
    assert.equal(evaluate(one({ kind: "lane", lane: "Jungle" }), facts), false);
    assert.equal(evaluate(one({ kind: "hero", heroIds: ["h02", "h01"] }), facts), true);
    assert.equal(evaluate(one({ kind: "hero", heroIds: ["h02"] }), facts), false);
    assert.equal(evaluate(one({ kind: "level", op: ">=", value: 8 }), facts), true);
    assert.equal(evaluate(one({ kind: "level", op: ">", value: 8 }), facts), false);
  });

  test("a tag is looked for only on a hero somebody described", () => {
    const tagged = { match: "all", of: [{ kind: "tag", tagId: 1 }] };
    assert.equal(evaluate(tagged, heroFacts(hero, { ...meleeProfile, tags: [1] }, 8)), true);
    assert.equal(evaluate(tagged, facts), false);
    assert.equal(evaluate(tagged, heroFacts(hero, null, 8)), null, "no profile: cannot be said");
    assert.equal(
      evaluate(tagged, heroFacts(hero, { baseStats: [], tags: [], updatedAt: null }, 8)),
      null
    );
  });

  test("all, any, not: false and true win over unknown, and unknown stays unknown when negated", () => {
    const unknown = { kind: "stat", statId: 99, options: [1] };
    const yes = { kind: "role", role: "Fighter" };
    const no = { kind: "role", role: "Mage" };
    assert.equal(evaluate({ match: "all", of: [yes, unknown] }, facts), null);
    assert.equal(evaluate({ match: "all", of: [no, unknown] }, facts), false);
    assert.equal(evaluate({ match: "any", of: [no, unknown] }, facts), null);
    assert.equal(evaluate({ match: "any", of: [yes, unknown] }, facts), true);
    assert.equal(evaluate({ match: "any", of: [no, no] }, facts), false);
    assert.equal(evaluate({ match: "all", of: [{ ...yes, negate: true }] }, facts), false);
    assert.equal(evaluate({ match: "all", of: [{ ...no, negate: true }] }, facts), true);
    assert.equal(evaluate({ match: "all", of: [{ ...unknown, negate: true }] }, facts), null);
  });

  test("a group inside the set, negated or not", () => {
    const group = (match, of, negate = false) => ({
      kind: "group",
      match,
      of,
      ...(negate ? { negate } : {})
    });
    const yes = { kind: "role", role: "Fighter" };
    const no = { kind: "role", role: "Mage" };
    // Fighter and (Mage or Clash Lane)
    const set = {
      match: "all",
      of: [yes, group("any", [no, { kind: "lane", lane: "Clash Lane" }])]
    };
    assert.equal(evaluate(set, facts), true);
    assert.equal(evaluate({ match: "all", of: [yes, group("any", [no, no])] }, facts), false);
    assert.equal(evaluate({ match: "all", of: [group("any", [no, no], true)] }, facts), true);
    assert.equal(depthOf(set), 2);
    assert.equal(depthOf(melee), 1);
    assert.equal(depthOf(null), 0);
    assert.deepEqual(conditionsOf(set), [yes, no, { kind: "lane", lane: "Clash Lane" }]);
    assert.deepEqual(conditionsOf(null), []);
    assert.equal(keyOf(melee), keyOf(is(7, 1)));
    assert.notEqual(keyOf(melee), keyOf(ranged));
    assert.equal(keyOf(undefined), "null");
  });
});

describe("what a build gives to a hero", () => {
  test("a melee hero: the values for melee heroes count, the ones for ranged heroes are left out", () => {
    const { rows, notes } = computeStats(meleeProfile, build([10]), 5, fixture, hero);
    const hp = rowOf(rows, 1);
    assert.deepEqual(
      [hp.base, hp.items, hp.arcana, hp.total, hp.temporary],
      [3400, 500, 0, 3900, 0]
    );
    assert.equal(notes.skipped.length, 2, "the 50 HP and the temporary range, for ranged heroes");
    assert.deepEqual(notes.unknown, []);
    assert.deepEqual(notes.temporary, []);
    assert.equal(rowOf(rows, 8), undefined, "a stat that nothing gives to this hero has no row");
  });

  test("a ranged hero: its own values, and the temporary one apart from the total", () => {
    const { rows, notes } = computeStats(rangedProfile, build([10]), 5, fixture, hero);
    const hp = rowOf(rows, 1);
    assert.deepEqual([hp.items, hp.total], [450, 3850]);
    const bonus = rowOf(rows, 8);
    assert.deepEqual([bonus.items, bonus.total, bonus.temporary], [0, 0, 1.5]);
    assert.equal(notes.temporary.length, 1);
    assert.equal(notes.temporary[0].entry.durationSeconds, 3);
    assert.equal(notes.skipped.length, 1, "the 100 HP for melee heroes");
  });

  test("with no hero only what has no condition counts, and the rest says it cannot be checked", () => {
    const { rows, notes } = computeStats(null, build([10]), 15, fixture, null);
    assert.deepEqual([rowOf(rows, 1).items, rowOf(rows, 1).total], [400, 400]);
    assert.equal(notes.unknown.length, 3);
    assert.deepEqual(notes.skipped, []);
    assert.equal(rowOf(rows, 8), undefined);
  });

  test("a hero whose range was not entered: unknown, never read as false", () => {
    const { notes } = computeStats(
      { baseStats: [meleeProfile.baseStats[1]], tags: [], updatedAt: 1 },
      build([10]),
      5,
      fixture,
      hero
    );
    assert.equal(notes.unknown.length, 3);
    assert.deepEqual(notes.skipped, []);
  });

  test("an arcana counts its quantity, its conditions too", () => {
    const rows = totalStats(meleeProfile, build([], [{ id: 100, count: 3 }]), 1, fixture, hero);
    assert.equal(rowOf(rows, 1).arcana, 15);
    const none = totalStats(rangedProfile, build([], [{ id: 100, count: 3 }]), 1, fixture, hero);
    assert.equal(rowOf(none, 1).arcana, 0);
  });

  test("a choice stat: the hero has an option, a piece can set another, a temporary one is apart", () => {
    const low = computeStats(meleeProfile, build([11, 12]), 5, fixture, hero);
    const range = rowOf(low.rows, 7);
    assert.deepEqual(
      [range.baseOption, range.option, range.temporaryOptions],
      [1, 1, [2]],
      "level 5: the charm needs level 10; the wings are temporary"
    );
    const high = rowOf(computeStats(meleeProfile, build([11]), 10, fixture, hero).rows, 7);
    assert.deepEqual([high.baseOption, high.option], [1, 2], "level 10: the charm sets Ranged");
    const none = rowOf(
      computeStats({ baseStats: [], tags: [], updatedAt: 1 }, build([12]), 5, fixture, hero).rows,
      7
    );
    assert.deepEqual([none.baseOption, none.option], [null, null]);
  });

  test("the rows are the ones of before for a catalogue without any of this", () => {
    const plain = {
      stats: [{ id: 1, name: "Max HP", unit: "flat", sortOrder: 1 }],
      tags: [],
      items: [
        { id: 1, name: "Ring", category: "regular", tags: [], stats: [{ statId: 1, value: 10 }] }
      ],
      arcana: []
    };
    assert.deepEqual(
      totalStats({ baseStats: [{ statId: 1, value: 100, growth: 0 }] }, build([1]), 1, plain),
      [{ statId: 1, choice: false, base: 100, items: 10, arcana: 0, total: 110, temporary: 0 }]
    );
  });
});

// ---- what is accepted ----------------------------------------------------------------------------------------------
const known = {
  stats: new Map(stats.map(entry => [entry.id, entry])),
  tagIds: new Set([1, 2]),
  imageIds: new Set(),
  heroIds: new Set(["h01", "h02", "h03"]),
  roles: new Set(["Fighter", "Mage"])
};

describe("a stat of the catalogue (pure)", () => {
  test("a whole number, a number, a percentage or a choice; only a choice keeps options", () => {
    for (const unit of ["flat", "whole", "percent"]) {
      assert.deepEqual(parseStat({ name: "A", unit, options: [{ name: "x" }] }).options, []);
    }
    assert.equal(parseStat({ name: "A" }).unit, "flat", "a number by default");
    refuses(() => parseStat({ name: "A", unit: "text" }), /one of: flat, whole, percent, choice/);
  });

  test("a choice needs two options at least, with names that differ", () => {
    const choice = options => parseStat({ name: "Attack range", unit: "choice", options });
    assert.deepEqual(choice([{ name: "Melee" }, { name: "Ranged" }]).options, [
      { id: 1, name: "Melee" },
      { id: 2, name: "Ranged" }
    ]);
    refuses(() => choice(undefined), /between 2 and 12 options/);
    refuses(() => choice([{ name: "Melee" }]), /between 2 and 12 options/);
    refuses(
      () => choice(Array.from({ length: 13 }, (_, index) => ({ name: `o${index}` }))),
      /2 and 12/
    );
    refuses(() => choice([{ name: "Melee" }, { name: " melee " }]), /same option twice/);
    refuses(() => choice([{ name: "Melee" }, { name: "" }]), /required/);
    refuses(() => choice([{ name: "Melee" }, "Ranged"]), /JSON object/);
  });

  test("an option keeps its id when it is renamed, and a new one takes the next", () => {
    const next = parseStat({
      name: "Attack range",
      unit: "choice",
      options: [{ id: 2, name: "At a distance" }, { id: 1, name: "Close" }, { name: "Both" }]
    });
    assert.deepEqual(next.options, [
      { id: 2, name: "At a distance" },
      { id: 1, name: "Close" },
      { id: 3, name: "Both" }
    ]);
    refuses(
      () =>
        parseStat({
          name: "A",
          unit: "choice",
          options: [
            { id: 1, name: "a" },
            { id: 1, name: "b" }
          ]
        }),
      /same option twice/
    );
    refuses(
      () =>
        parseStat({ name: "A", unit: "choice", options: [{ id: 0, name: "a" }, { name: "b" }] }),
      /whole number/
    );
  });

  test("the value of a line: a number for a number stat, an option of its own for a choice", () => {
    assert.deepEqual(valueFor({ value: 12.5 }, "x", HP), { value: 12.5 });
    assert.deepEqual(valueFor({ value: 12 }, "x", ARMOR), { value: 12 });
    assert.deepEqual(valueFor({ option: 2 }, "x", RANGE), { option: 2 });
    refuses(() => valueFor({ value: 12.5 }, "x", ARMOR), /whole number/);
    refuses(() => valueFor({ option: 3 }, "x", RANGE), /does not exist/);
    refuses(() => valueFor({ value: 1 }, "x", RANGE), /whole number/);
    refuses(() => valueFor({ option: 1 }, "x", HP), /number/);
    refuses(() => valueFor({ value: "12" }, "x", HP), /number/);
  });
});

describe("the conditions of a line (pure)", () => {
  const when = of => ({ match: "all", of });

  test("what is empty is no condition", () => {
    for (const nothing of [undefined, null, {}, { match: "any" }, { match: "all", of: [] }]) {
      assert.equal(parseWhen(nothing, "when", known), null);
    }
  });

  test("every kind, written back the same way each time", () => {
    const parsed = parseWhen(
      when([
        { kind: "stat", statId: 7, options: [1, 2], extra: "dropped" },
        { kind: "stat", statId: 1, op: ">=", value: 3000.5 },
        { kind: "tag", tagId: 2, negate: true },
        { kind: "role", role: "Mage" },
        { kind: "lane", lane: "Jungle" },
        { kind: "hero", heroIds: ["h01", "h03"] },
        { kind: "level", op: "<", value: 10 }
      ]),
      "when",
      known
    );
    assert.deepEqual(parsed, {
      match: "all",
      of: [
        { kind: "stat", statId: 7, options: [1, 2] },
        { kind: "stat", statId: 1, op: ">=", value: 3000.5 },
        { kind: "tag", tagId: 2, negate: true },
        { kind: "role", role: "Mage" },
        { kind: "lane", lane: "Jungle" },
        { kind: "hero", heroIds: ["h01", "h03"] },
        { kind: "level", op: "<", value: 10 }
      ]
    });
    assert.deepEqual(parseWhen(parsed, "when", known), parsed, "reading it again changes nothing");
    assert.equal(
      parseWhen({ of: [{ kind: "level", op: "=", value: 3 }] }, "w", known).match,
      "all"
    );
  });

  test("a reference to something that does not exist is refused", () => {
    const bad = condition => () => parseWhen(when([condition]), "when", known);
    refuses(bad({ kind: "stat", statId: 99, options: [1] }), /does not exist/);
    refuses(bad({ kind: "stat", statId: 7, options: [3] }), /does not exist/);
    refuses(bad({ kind: "tag", tagId: 9 }), /does not exist/);
    refuses(bad({ kind: "role", role: "Wizard" }), /does not exist/);
    refuses(bad({ kind: "hero", heroIds: ["h99"] }), /does not exist/);
    refuses(bad({ kind: "lane", lane: "Top" }), /must be one of/);
  });

  test("the shape of each kind", () => {
    const bad = (condition, pattern) =>
      refuses(() => parseWhen(when([condition]), "when", known), pattern);
    bad({ kind: "wish" }, /must be one of/);
    bad({ kind: "stat", statId: 7 }, /options of the stat/);
    bad({ kind: "stat", statId: 7, options: [] }, /options of the stat/);
    bad({ kind: "stat", statId: 7, options: [1, 1] }, /same option twice/);
    bad({ kind: "stat", statId: 1, op: "~", value: 3 }, /must be one of/);
    bad({ kind: "stat", statId: 1, op: ">=", value: "3" }, /number/);
    bad({ kind: "hero", heroIds: [] }, /between 1 and 20 heroes/);
    bad({ kind: "hero", heroIds: ["h01", "h01"] }, /same hero twice/);
    bad({ kind: "level", op: ">=", value: 0 }, /whole number/);
    bad({ kind: "level", op: ">=", value: 16 }, /whole number/);
    bad({ kind: "level", op: ">=", value: 7.5 }, /whole number/);
    bad({ kind: "level", op: "%", value: 7 }, /must be one of/);
    bad({ kind: "tag", tagId: 1, negate: "yes" }, /true or false/);
    refuses(() => parseWhen("melee", "when", known), /JSON object/);
    refuses(() => parseWhen({ kind: "tag", tagId: 1 }, "when", known), /set of conditions/);
    refuses(() => parseWhen({ match: "most", of: [] }, "when", known), /must be one of/);
    refuses(() => parseWhen({ of: "all" }, "when", known), /at most 12/);
  });

  test("groups inside groups, up to a depth; not too many conditions", () => {
    const level = { kind: "level", op: ">=", value: 3 };
    const group = of => ({ kind: "group", match: "any", of });
    assert.equal(depthOf(parseWhen(when([group([level])]), "w", known)), 2);
    assert.equal(depthOf(parseWhen(when([group([group([level])])]), "w", known)), MAX_DEPTH);
    refuses(
      () => parseWhen(when([group([group([group([level])])])]), "w", known),
      /3 levels deep at most/
    );
    refuses(() => parseWhen(when([group([])]), "w", known), /cannot be empty/);
    const many = Array.from({ length: MAX_CONDITIONS }, () => level);
    assert.equal(parseWhen(when(many), "w", known).of.length, MAX_CONDITIONS);
    refuses(() => parseWhen(when([...many, level]), "w", known), /at most 12/);
    refuses(
      () => parseWhen(when([group(many), level]), "w", known),
      /at most 12 conditions in all/
    );
  });
});

describe("the lines and the effects of an item (pure)", () => {
  const item = overrides => ({ name: "Blade", category: "regular", ...overrides });
  const line = (overrides = {}) => ({ statId: 1, value: 100, ...overrides });

  test("a temporary value with its duration and its note; a conditional one", () => {
    const parsed = parseItem(
      item({
        stats: [
          line(),
          line({
            statId: 8,
            value: 1.5,
            temporary: true,
            durationSeconds: 3,
            note: "  after the   active ",
            when: ranged
          }),
          line({ statId: 7, value: undefined, option: 2 })
        ]
      }),
      known
    );
    assert.deepEqual(parsed.stats, [
      { statId: 1, value: 100 },
      {
        statId: 8,
        value: 1.5,
        temporary: true,
        durationSeconds: 3,
        note: "after the active",
        when: ranged
      },
      { statId: 7, option: 2 }
    ]);
  });

  test("a line says only what it needs to: nothing for what is the usual", () => {
    const [plain] = parseItem(
      item({ stats: [line({ temporary: false, durationSeconds: null, note: "", when: null })] }),
      known
    ).stats;
    assert.deepEqual(plain, { statId: 1, value: 100 });
    const [empty] = parseItem(
      item({ stats: [line({ when: { match: "all", of: [] } })] }),
      known
    ).stats;
    assert.equal("when" in empty, false, "an empty set is no condition");
  });

  test("the same stat on several lines, but not twice in the same way", () => {
    const lines = [
      line(),
      line({ value: 50, when: melee }),
      line({ value: 20, when: ranged }),
      line({ value: 5, temporary: true }),
      line({ value: 5, temporary: true, when: melee })
    ];
    assert.equal(parseItem(item({ stats: lines }), known).stats.length, 5);
    refuses(
      () => parseItem(item({ stats: [line(), line({ value: 2 })] }), known),
      /same stat twice/
    );
    refuses(
      () =>
        parseItem(
          item({ stats: [line({ when: melee }), line({ value: 2, when: is(7, 1) })] }),
          known
        ),
      /same stat twice/
    );
    refuses(
      () =>
        parseItem(item({ stats: [line({ temporary: true }), line({ temporary: true })] }), known),
      /same stat twice/
    );
  });

  test("what is wrong with a line", () => {
    const bad = (stat, pattern) =>
      refuses(() => parseItem(item({ stats: [stat] }), known), pattern);
    bad(line({ statId: 99 }), /does not exist/);
    bad(line({ value: undefined }), /number/);
    bad(line({ statId: 4, value: 1.5 }), /whole number/);
    bad(line({ statId: 7, value: undefined, option: 3 }), /does not exist/);
    bad(line({ temporary: "yes" }), /true or false/);
    bad(line({ durationSeconds: 3 }), /Only a temporary value has a duration/);
    bad(line({ temporary: true, durationSeconds: 0 }), /between 0.1 and 3600/);
    bad(line({ temporary: true, durationSeconds: 7200 }), /between 0.1 and 3600/);
    bad(line({ note: "x".repeat(201) }), /at most|between/);
    bad(line({ when: { match: "all", of: [{ kind: "tag", tagId: 9 }] } }), /does not exist/);
    refuses(() => parseItem(item({ stats: "none" }), known), /list of at most 20/);
    refuses(
      () =>
        parseItem(
          item({ stats: Array.from({ length: 21 }, (_, index) => line({ value: index })) }),
          known
        ),
      /between 0 and 20/
    );
  });

  test("an effect can be for some heroes only; up to twelve effects", () => {
    const effect = (overrides = {}) => ({
      kind: "passive",
      name: "Edge",
      text: "Does it.",
      ...overrides
    });
    const [everyone, melees] = parseItem(
      item({ effects: [effect(), effect({ text: "Melee only.", when: melee })] }),
      known
    ).effects;
    assert.deepEqual(everyone, {
      kind: "passive",
      name: "Edge",
      text: "Does it.",
      cooldownSeconds: null
    });
    assert.deepEqual(melees.when, melee);
    assert.equal(
      parseItem(item({ effects: Array.from({ length: 12 }, () => effect()) }), known).effects
        .length,
      12
    );
    refuses(
      () => parseItem(item({ effects: Array.from({ length: 13 }, () => effect()) }), known),
      /at most 12/
    );
    refuses(
      () =>
        parseItem(
          item({
            effects: [effect({ when: { match: "all", of: [{ kind: "role", role: "Nobody" }] } })]
          }),
          known
        ),
      /does not exist/
    );
  });

  test("an arcana has the same lines, none to four", () => {
    const arcana = parseArcana(
      {
        name: "Zeal",
        color: "red",
        stats: [line({ when: melee }), line({ value: 3, when: ranged })]
      },
      known
    );
    assert.equal(arcana.stats.length, 2);
    assert.equal(
      parseArcana({ name: "Z", color: "red", stats: [] }, known).stats.length,
      0,
      "an arcana can exist before its stats are written"
    );
    assert.equal(parseArcana({ name: "Z", color: "red" }, known).stats.length, 0);
    refuses(
      () =>
        parseArcana(
          { name: "Z", color: "red", stats: [1, 2, 3, 4, 5].map(value => line({ value })) },
          known
        ),
      /between 0 and 4|at most 4|between 1 and 4/
    );
  });
});

describe("the base stats of a hero (pure)", () => {
  const body = baseStats => ({ baseStats, skills: [], tags: [] });

  test("a number with its growth, or an option that does not grow", () => {
    const profile = parseHeroProfile(
      body([
        { statId: 1, value: 3000, growth: 100 },
        { statId: 7, option: 2, growth: 50 },
        { statId: 4, value: 40 }
      ]),
      known
    );
    assert.deepEqual(profile.baseStats, [
      { statId: 1, value: 3000, growth: 100 },
      { statId: 7, option: 2 },
      { statId: 4, value: 40, growth: 0 }
    ]);
  });

  test("what is wrong with a base stat", () => {
    const bad = (rows, pattern) => refuses(() => parseHeroProfile(body(rows), known), pattern);
    bad([{ statId: 7 }], /whole number/);
    bad([{ statId: 7, option: 5 }], /does not exist/);
    bad([{ statId: 1, option: 1 }], /number/);
    bad([{ statId: 4, value: 40.5 }], /whole number/);
    bad([{ statId: 4, value: 40, growth: 1.5 }], /whole number/);
    bad([{ statId: 99, value: 1 }], /does not exist/);
    bad(
      [
        { statId: 1, value: 1 },
        { statId: 1, value: 2 }
      ],
      /same stat twice/
    );
  });
});

describe("what refers to what (pure)", () => {
  const data = {
    catalog: {
      items: [
        { id: 10, stats: [{ statId: 1, value: 1 }], effects: [{ when: melee }] },
        {
          id: 11,
          stats: [{ statId: 8, value: 1, when: { match: "all", of: [{ kind: "tag", tagId: 2 }] } }]
        },
        { id: 12, stats: [{ statId: 7, option: 2, temporary: true }] }
      ],
      arcana: [{ id: 100, stats: [{ statId: 1, value: 5, when: ranged }] }]
    },
    profiles: [
      { heroId: "h01", baseStats: [{ statId: 7, option: 1 }], skills: [] },
      {
        heroId: "h02",
        baseStats: [{ statId: 4, value: 3.5, growth: 1 }],
        skills: [{ components: [{ scaling: [{ statId: 1, percent: 10 }] }] }]
      }
    ]
  };

  test("a stat is used by the lines that have it, the conditions on it and the profiles", () => {
    assert.equal(statUsage(data, 1), 3, "item 10 (line), arcana 100 (line), hero h02 (scaling)");
    assert.equal(statUsage(data, 7), 4, "items 10 (condition), 12 (line); arcana 100; hero h01");
    assert.equal(statUsage(data, 8), 1);
    assert.equal(statUsage(data, 3), 0);
  });

  test("an option is used as a value and in a condition", () => {
    assert.equal(optionUsage(data, 7, 1), 2, "item 10 and hero h01");
    assert.equal(optionUsage(data, 7, 2), 2, "item 12 and arcana 100");
    assert.equal(optionUsage(data, 7, 3), 0);
    assert.equal(optionUsage(data, 1, 1), 0, "another stat");
  });

  test("a tag is looked at only where a condition names it", () => {
    assert.equal(tagConditionUsage(data, 2), 1);
    assert.equal(tagConditionUsage(data, 1), 0);
  });

  test("the values that are not whole numbers", () => {
    assert.equal(fractionalUsage(data, 4), 1);
    assert.equal(fractionalUsage(data, 1), 0);
  });
});

// ---- the admin API ----------------------------------------------------------------------------------------------
const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("stat kinds and conditional lines through the admin API", { skip }, () => {
  const setup = async name => {
    const admin = await app.signIn(name, { admin: true });
    const send = async (method, path, body, expected = 200) => {
      const response = await admin.browser[method](path, body);
      assert.equal(response.status, expected, `${method} ${path}: ${response.text}`);
      return response;
    };
    return { admin, send };
  };

  test("a choice stat is kept with its options; they keep their ids when renamed", async () => {
    const { send } = await setup("KindsA");
    const { body: created } = await send("post", "/api/admin/catalog/stats", {
      name: "Attack type",
      unit: "choice",
      options: [{ name: "Melee" }, { name: "Ranged" }]
    });
    const read = async () =>
      (await app.browser().get("/api/catalog")).body.stats.find(entry => entry.id === created.id);
    assert.deepEqual(await read(), {
      id: created.id,
      name: "Attack type",
      unit: "choice",
      sortOrder: 0,
      options: [
        { id: 1, name: "Melee" },
        { id: 2, name: "Ranged" }
      ]
    });
    await send("put", `/api/admin/catalog/stats/${created.id}`, {
      name: "Attack type",
      unit: "choice",
      options: [{ id: 1, name: "Close" }, { id: 2, name: "Ranged" }, { name: "Both" }]
    });
    assert.deepEqual(
      (await read()).options,
      [
        { id: 1, name: "Close" },
        { id: 2, name: "Ranged" },
        { id: 3, name: "Both" }
      ],
      "renamed and one more"
    );
    await send(
      "post",
      "/api/admin/catalog/stats",
      { name: "Alone", unit: "choice", options: [] },
      400
    );
    const plain = await send("post", "/api/admin/catalog/stats", { name: "Armor", unit: "whole" });
    assert.deepEqual(
      (await app.browser().get("/api/catalog")).body.stats.find(entry => entry.id === plain.body.id)
        .options,
      [],
      "a number stat has no options"
    );
  });

  test("an item with a temporary value and values and effects for some heroes only", async () => {
    const { send } = await setup("KindsB");
    const range = (
      await send("post", "/api/admin/catalog/stats", {
        name: "Range type",
        unit: "choice",
        options: [{ name: "Melee" }, { name: "Ranged" }]
      })
    ).body.id;
    const bonus = (await send("post", "/api/admin/catalog/stats", { name: "Range bonus" })).body.id;
    const hp = (await send("post", "/api/admin/catalog/stats", { name: "Max HP", unit: "whole" }))
      .body.id;
    const marksman = (await send("post", "/api/admin/catalog/tags", { name: "Marksman" })).body.id;
    const melee = { match: "all", of: [{ kind: "stat", statId: range, options: [1] }] };
    const ranged = { match: "all", of: [{ kind: "stat", statId: range, options: [2] }] };
    const body = {
      name: "Bow of dusk",
      category: "regular",
      stats: [
        { statId: hp, value: 300 },
        { statId: hp, value: 100, when: melee },
        {
          statId: bonus,
          value: 1.5,
          temporary: true,
          durationSeconds: 3,
          note: "after the active",
          when: {
            match: "any",
            of: [
              { kind: "stat", statId: range, options: [2] },
              { kind: "tag", tagId: marksman },
              {
                kind: "group",
                match: "all",
                of: [
                  { kind: "role", role: "Fighter" },
                  { kind: "level", op: ">=", value: 8 }
                ]
              }
            ]
          }
        }
      ],
      effects: [
        { kind: "passive", name: "Pierce", text: "Melee heroes: 5%.", when: melee },
        { kind: "passive", name: "Pierce", text: "Ranged heroes: 3%.", when: ranged }
      ]
    };
    const { body: made } = await send("post", "/api/admin/catalog/items", body);
    const stored = (await app.browser().get("/api/catalog")).body.items.find(
      entry => entry.id === made.id
    );
    assert.deepEqual(stored.stats, body.stats, "each line comes back as it was written");
    assert.deepEqual(
      stored.effects.map(effect => [effect.text, effect.when.of[0].options]),
      [
        ["Melee heroes: 5%.", [1]],
        ["Ranged heroes: 3%.", [2]]
      ]
    );
    // the same item can be saved again as the page sends it back
    await send("put", `/api/admin/catalog/items/${made.id}`, { ...stored });
    const arcana = await send("post", "/api/admin/catalog/arcana", {
      name: "Dawn",
      color: "red",
      stats: [{ statId: hp, value: 8, when: ranged }]
    });
    assert.ok(arcana.body.id);

    for (const [stats, why] of [
      [
        [{ statId: hp, value: 1, when: { match: "all", of: [{ kind: "tag", tagId: 9999 }] } }],
        "a tag that does not exist"
      ],
      [
        [
          {
            statId: hp,
            value: 1,
            when: { match: "all", of: [{ kind: "stat", statId: range, options: [9] }] }
          }
        ],
        "an option that does not exist"
      ],
      [
        [
          {
            statId: hp,
            value: 1,
            when: { match: "all", of: [{ kind: "hero", heroIds: ["nobody"] }] }
          }
        ],
        "a hero that does not exist"
      ],
      [[{ statId: hp, value: 1.5 }], "a decimal for a whole stat"],
      [[{ statId: range, value: 1 }], "a number for a choice"],
      [[{ statId: hp, value: 1, durationSeconds: 3 }], "a duration for a permanent value"]
    ]) {
      await send(
        "post",
        "/api/admin/catalog/items",
        { name: `Bad ${why}`, category: "regular", stats },
        400
      );
    }
  });

  test("a stat, an option or a tag that is still used cannot be removed or turned into something else", async () => {
    const { send } = await setup("KindsC");
    const range = (
      await send("post", "/api/admin/catalog/stats", {
        name: "Reach",
        unit: "choice",
        options: [{ name: "Near" }, { name: "Far" }]
      })
    ).body.id;
    const power = (await send("post", "/api/admin/catalog/stats", { name: "Power" })).body.id;
    const tag = (await send("post", "/api/admin/catalog/tags", { name: "Heavy" })).body.id;
    const near = { match: "all", of: [{ kind: "stat", statId: range, options: [1] }] };
    const tagged = { match: "all", of: [{ kind: "tag", tagId: tag }] };
    const item = (
      await send("post", "/api/admin/catalog/items", {
        name: "Guard",
        category: "regular",
        stats: [
          { statId: power, value: 10.5, when: near },
          { statId: power, value: 2, when: tagged }
        ]
      })
    ).body.id;
    await send("put", "/api/admin/heroes/h01/profile", {
      baseStats: [{ statId: range, option: 2 }],
      skills: [],
      tags: []
    });

    const options = [
      { id: 1, name: "Near" },
      { id: 2, name: "Far" }
    ];
    await send(
      "put",
      `/api/admin/catalog/stats/${range}`,
      { name: "Reach", unit: "choice", options: [options[0]] },
      400
    );
    const blocked = await send(
      "put",
      `/api/admin/catalog/stats/${range}`,
      { name: "Reach", unit: "choice", options: [{ id: 2, name: "Far" }, { name: "Else" }] },
      409
    );
    assert.match(blocked.text, /Near/, "the condition on Near keeps it");
    await send(
      "put",
      `/api/admin/catalog/stats/${range}`,
      { name: "Reach", unit: "choice", options: [{ id: 1, name: "Near" }, { name: "Else" }] },
      409
    );
    await send("put", `/api/admin/catalog/stats/${range}`, { name: "Reach", unit: "flat" }, 409);
    await send(
      "put",
      `/api/admin/catalog/stats/${power}`,
      { name: "Power", unit: "choice", options: [{ name: "a" }, { name: "b" }] },
      409
    );
    await send("put", `/api/admin/catalog/stats/${power}`, { name: "Power", unit: "whole" }, 409);
    await send("put", `/api/admin/catalog/stats/${power}`, { name: "Power", unit: "percent" });

    await send("delete", `/api/admin/catalog/stats/${range}`, undefined, 409);
    await send("delete", `/api/admin/catalog/tags/${tag}`, undefined, 409);
    // the item gives up its conditions, the hero its range: everything can go
    await send("put", `/api/admin/catalog/items/${item}`, {
      name: "Guard",
      category: "regular",
      stats: [{ statId: power, value: 10 }]
    });
    await send("put", "/api/admin/heroes/h01/profile", { baseStats: [], skills: [], tags: [] });
    await send("put", `/api/admin/catalog/stats/${range}`, { name: "Reach", unit: "flat" });
    await send("delete", `/api/admin/catalog/tags/${tag}`);
    await send("delete", `/api/admin/catalog/stats/${range}`);
    await send("put", `/api/admin/catalog/stats/${power}`, { name: "Power", unit: "whole" });
  });

  test("the range of a hero is entered as an option and read back with its sheet", async () => {
    const { send } = await setup("KindsD");
    const range = (
      await send("post", "/api/admin/catalog/stats", {
        name: "Attack",
        unit: "choice",
        options: [{ name: "Melee" }, { name: "Ranged" }]
      })
    ).body.id;
    const hp = (await send("post", "/api/admin/catalog/stats", { name: "HP", unit: "whole" })).body
      .id;
    const profile = {
      baseStats: [
        { statId: range, option: 1 },
        { statId: hp, value: 3000, growth: 100 }
      ],
      skills: [],
      tags: []
    };
    const saved = (await send("put", "/api/admin/heroes/h02/profile", profile)).body;
    assert.deepEqual(saved.baseStats, profile.baseStats);
    const sheet = (await app.browser().get("/api/heroes/h02")).body;
    assert.deepEqual(sheet.profile.baseStats, profile.baseStats);
    await send(
      "put",
      "/api/admin/heroes/h02/profile",
      { ...profile, baseStats: [{ statId: range }] },
      400
    );
    await send(
      "put",
      "/api/admin/heroes/h02/profile",
      { ...profile, baseStats: [{ statId: range, option: 9 }] },
      400
    );
    await send(
      "put",
      "/api/admin/heroes/h02/profile",
      { ...profile, baseStats: [{ statId: hp, value: 10.5 }] },
      400
    );
  });

  test("the conditions can name a class that exists in the roster, a lane, a level and a hero", async () => {
    const { send } = await setup("KindsE");
    const power = (await send("post", "/api/admin/catalog/stats", { name: "Strength" })).body.id;
    let count = 0;
    const one = when => ({
      name: `Blade ${(count += 1)}`,
      category: "regular",
      stats: [{ statId: power, value: 1, when: { match: "all", of: [when] } }]
    });
    for (const when of [
      { kind: "role", role: "Fighter" },
      { kind: "lane", lane: "Jungle" },
      { kind: "level", op: ">=", value: 15 },
      { kind: "hero", heroIds: ["h01", "h02"], negate: true }
    ]) {
      await send("post", "/api/admin/catalog/items", one(when));
    }
    await send("post", "/api/admin/catalog/items", one({ kind: "role", role: "Wizard" }), 400);
    await send("post", "/api/admin/catalog/items", one({ kind: "lane", lane: "Middle" }), 400);
    await send(
      "post",
      "/api/admin/catalog/items",
      one({ kind: "level", op: ">=", value: 16 }),
      400
    );
  });
});
