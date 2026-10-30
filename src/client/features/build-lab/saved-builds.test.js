// The builds kept in the browser by the build lab (no account): what is stored is checked on the way
// back, the limits are stated and never make a build vanish silently.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MAX_IN_ALL,
  MAX_PER_HERO,
  NAME_MAX,
  STORAGE_KEY,
  addSaved,
  cleanEntry,
  nextName,
  readSaved,
  removeSaved,
  savedOf,
  shapeBuild,
  updateSaved,
  writeSaved
} from "./saved.js";

const build = {
  items: [1, 2, 3],
  utility: [4],
  late: [5],
  core: [1, 2],
  arcana: { red: [{ id: 10, count: 7 }], blue: [], green: [{ id: 12, count: 3 }] }
};
const storageOf = (initial = null) => {
  const data = new Map(initial === null ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    data
  };
};
const entry = (id, extra = {}) => ({
  id: `entry-${String(id).padStart(4, "0")}`,
  heroId: "533",
  name: `Build ${id}`,
  level: 15,
  build,
  savedAt: id,
  ...extra
});

describe("a build kept in the browser", () => {
  test("only whole ids, and no more than a build can hold", () => {
    assert.deepEqual(
      shapeBuild(build),
      { ...build, spells: [] },
      "a build without spells gets none"
    );
    const wild = shapeBuild({
      items: [1, "2", 3.5, -4, null, 5, 6, 7, 8, 9, 10],
      spells: [1, 2, 3, "x", 2.5],
      utility: "x",
      late: [1, 2, 3],
      core: [1, 2, 3, 4, 5],
      arcana: {
        red: [{ id: 1, count: 2 }, { id: "a", count: 1 }, null, { id: 3, count: 0 }],
        gold: []
      }
    });
    assert.deepEqual(wild.items, [1, 5, 6, 7, 8, 9], "six items at most, whole numbers only");
    assert.deepEqual(wild.spells, [1, 2], "two spells at most, whole numbers only");
    assert.deepEqual(wild.utility, []);
    assert.deepEqual(wild.late, [1, 2], "two late-game items at most");
    assert.deepEqual(wild.core, [1, 2, 3, 4, 5].slice(0, 3), "three core items at most");
    assert.deepEqual(wild.arcana, { red: [{ id: 1, count: 2 }], blue: [], green: [] });
    assert.deepEqual(shapeBuild(undefined), shapeBuild({}), "nothing at all is an empty build");
  });

  test("an entry that is not one is refused, the others are cleaned", () => {
    assert.equal(cleanEntry(null), null);
    assert.equal(cleanEntry({ ...entry(1), id: "x" }), null, "an id that is too short");
    assert.equal(cleanEntry({ ...entry(1), id: "<script>alert(1)</script>" }), null);
    assert.equal(cleanEntry({ ...entry(1), heroId: "../etc" }), null);
    const clean = cleanEntry({
      ...entry(1),
      name: `  ${"é".repeat(NAME_MAX + 20)}  `,
      level: 99,
      savedAt: "yesterday"
    });
    assert.equal(clean.name.length, NAME_MAX, "the name is trimmed and cut");
    assert.equal(clean.level, 15, "a level outside 1 to 15 is brought back into it");
    assert.equal(clean.savedAt, 0);
    assert.equal(cleanEntry({ ...entry(1), level: "high" }).level, 15);
    assert.equal(cleanEntry({ ...entry(1), level: 0 }).level, 1);
    assert.equal(
      cleanEntry({ ...entry(1), heroId: undefined }).heroId,
      "",
      "a build without a hero"
    );
  });

  test("what the browser holds is read back safely", () => {
    assert.deepEqual(readSaved(storageOf()), [], "nothing kept yet");
    assert.deepEqual(readSaved(storageOf("{not json")), []);
    assert.deepEqual(readSaved(storageOf('{"a":1}')), [], "not a list");
    const broken = {
      getItem() {
        throw new Error("storage is disabled");
      }
    };
    assert.deepEqual(readSaved(broken), []);
    const list = readSaved(
      storageOf(
        JSON.stringify([entry(1), entry(3), { nonsense: true }, entry(2), entry(3), "text"])
      )
    );
    assert.deepEqual(
      list.map(item => item.savedAt),
      [3, 2, 1],
      "the most recent first, the junk and the repeated id dropped"
    );
  });

  test("keeping and reading again gives the same builds; a refusing browser is reported", () => {
    const storage = storageOf();
    const first = addSaved([], {
      id: "aaaaaaaa-1",
      heroId: "533",
      name: "One",
      level: 12,
      build,
      now: 10
    });
    assert.equal(writeSaved(storage, first.entries), true);
    assert.deepEqual(readSaved(storage), first.entries);
    const full = {
      getItem: () => null,
      setItem() {
        throw new DOMException("full", "QuotaExceededError");
      }
    };
    assert.equal(writeSaved(full, first.entries), false);
  });

  test("several builds per hero, with a limit that is said and never drops one silently", () => {
    let entries = [];
    for (let number = 1; number <= MAX_PER_HERO; number += 1) {
      const result = addSaved(entries, {
        id: `hero-a-${number}-build`,
        heroId: "533",
        name: "",
        level: 15,
        build,
        now: number
      });
      assert.ok(result.entries, `build ${number} is kept`);
      entries = result.entries;
    }
    assert.equal(savedOf(entries, "533").length, MAX_PER_HERO);
    const refused = addSaved(entries, {
      id: "hero-a-extra-1",
      heroId: "533",
      name: "x",
      level: 1,
      build,
      now: 99
    });
    assert.deepEqual(refused, { error: "per-hero" });
    assert.equal(entries.length, MAX_PER_HERO, "nothing was dropped to make room");
    const another = addSaved(entries, {
      id: "hero-b-1-build",
      heroId: "534",
      name: "x",
      level: 1,
      build,
      now: 100
    });
    assert.ok(another.entries, "another hero has its own room");

    const many = Array.from({ length: MAX_IN_ALL }, (_, number) =>
      entry(number + 1, { heroId: `h${number % 20}` })
    );
    assert.deepEqual(
      addSaved(many, { id: "one-too-many-1", heroId: "h99", name: "x", level: 1, build, now: 1 }),
      { error: "in-all" }
    );
  });

  test("a name is proposed, a build is updated in place or removed", () => {
    const entries = [entry(2, { name: "Build 2" }), entry(1, { name: "Burst" })];
    assert.equal(nextName(entries, "533", "Build"), "Build 3", "the next free number of this hero");
    assert.equal(nextName(entries, "999", "Build"), "Build 1");
    assert.equal(nextName([entry(1, { name: "Build 2" })], "533", "Build"), "Build 3");

    const updated = updateSaved(entries, entries[1].id, {
      name: "",
      level: 9,
      build: { ...build, items: [7] },
      now: 50
    });
    assert.equal(updated.length, 2);
    assert.equal(updated[0].id, entries[1].id, "an updated build is the most recent again");
    assert.deepEqual(
      [updated[0].name, updated[0].level, updated[0].build.items, updated[0].savedAt],
      ["Burst", 9, [7], 50],
      "an empty name keeps the one it had"
    );
    assert.equal(
      updateSaved(entries, entries[1].id, { name: "Poke", level: 9, build, now: 60 })[0].name,
      "Poke"
    );
    assert.deepEqual(
      removeSaved(entries, entries[0].id).map(item => item.id),
      [entries[1].id]
    );
    assert.equal(removeSaved(entries, "unknown-id-1").length, 2);
  });
});
