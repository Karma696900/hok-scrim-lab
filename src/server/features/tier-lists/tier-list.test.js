// Tier list domain rules (pure) and the HTTP behaviour built on them.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { displayName, isFlowborn } from "../heroes/hero-domain.js";
import { lanePool, normalizeTierList, parseLane } from "./tier-list-domain.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const FLOWBORN = [
  ["581", "Flowborn (Tank)", "Clash Lane"],
  ["582", "Flowborn (Mage)", "Mid Lane"],
  ["584", "Flowborn (Marksman)", "Farm Lane"],
  ["583", "Flowborn (Assassin)", "Jungle"],
  ["585", "Flowborn (Roamer)", "Roamer"]
].map(([id, name, lane]) => ({
  id,
  name,
  image: `https://camp.honorofkings.com/${id}.png`,
  roles: ["Flowborn"],
  lanes: [lane],
  sourceIds: [id],
  availableGlobal: true
}));
const RETIRED = {
  id: "retired",
  name: "Retired hero",
  image: "x",
  roles: [],
  lanes: ["Jungle", "Roamer", "Farm Lane", "Clash Lane", "Mid Lane"],
  sourceIds: [],
  availableGlobal: false
};
const ROSTER = [
  ...sampleHeroes(10).map(hero => ({ ...hero, availableGlobal: true })),
  ...FLOWBORN,
  RETIRED
];
const base = overrides => ({
  id: "t",
  name: "T",
  tiers: [{ id: "s", label: "S", heroes: [] }],
  unranked: [],
  ...overrides
});
const everywhere = list => [...list.tiers.flatMap(tier => tier.heroes), ...list.unranked];

describe("hero naming", () => {
  test("every Flowborn form reads Flowborn, other heroes keep their name", () => {
    for (const form of FLOWBORN) {
      assert.equal(isFlowborn(form), true);
      assert.equal(displayName(form), "Flowborn");
    }
    assert.equal(displayName({ name: "Lu Bu" }), "Lu Bu");
    assert.equal(isFlowborn({ name: "Flowbornish" }), false);
  });
});

describe("tier list normalisation", () => {
  test("All Roles keeps the five Flowborn forms as distinct entries", () => {
    const list = normalizeTierList(base({}), ROSTER);
    assert.equal(list.lane, null);
    const forms = everywhere(list).filter(id => FLOWBORN.some(form => form.id === id));
    assert.deepEqual(forms.sort(), ["581", "582", "583", "584", "585"]);
  });

  test("a lane list holds one Flowborn: the form of that lane", () => {
    for (const form of FLOWBORN) {
      const list = normalizeTierList(base({ lane: form.lanes[0] }), ROSTER);
      assert.deepEqual(
        everywhere(list).filter(id => FLOWBORN.some(item => item.id === id)),
        [form.id],
        form.lanes[0]
      );
    }
  });

  test("a lane list drops heroes of other lanes, including other Flowborn forms", () => {
    const list = normalizeTierList(
      base({
        lane: "Mid Lane",
        tiers: [{ id: "s", label: "S", heroes: ["581", "582", "h01", "h03"] }]
      }),
      ROSTER
    );
    assert.deepEqual(list.tiers[0].heroes, ["582", "h03"]); // h03 is the sample Mid Lane hero; h01 is Clash
    assert.ok(
      everywhere(list).every(id => ROSTER.find(hero => hero.id === id).lanes.includes("Mid Lane"))
    );
  });

  test("heroes unknown to the roster are dropped; with no roster at all nothing is lost", () => {
    const withRoster = normalizeTierList(base({ unranked: ["ghost", "h01"] }), ROSTER);
    assert.ok(!everywhere(withRoster).includes("ghost"));
    const withoutRoster = normalizeTierList(
      base({
        tiers: [{ id: "s", label: "S", heroes: ["h01", "h01"] }],
        unranked: ["h02", "ghost"]
      }),
      []
    );
    assert.deepEqual(withoutRoster.tiers[0].heroes, ["h01"]);
    assert.deepEqual(withoutRoster.unranked, ["h02", "ghost"]);
  });

  test("a hero appears once (first placement wins) and new available heroes arrive in Unranked", () => {
    const list = normalizeTierList(
      base({
        tiers: [
          { id: "s", label: "S", heroes: ["h01"] },
          { id: "a", label: "A", heroes: ["h01", "h02"] }
        ],
        unranked: ["h02"]
      }),
      ROSTER
    );
    assert.deepEqual(
      list.tiers.map(tier => tier.heroes),
      [["h01"], ["h02"]]
    );
    const available = ROSTER.filter(hero => hero.availableGlobal)
      .map(hero => hero.id)
      .sort();
    assert.deepEqual(everywhere(list).sort(), available);
    assert.ok(!everywhere(list).includes("retired"), "unavailable heroes are not added");
  });

  test("a hero marked unavailable that is already ranked stays; it is just not offered again", () => {
    const roster = ROSTER.map(hero =>
      hero.id === "h01" ? { ...hero, availableGlobal: false } : hero
    );
    const kept = normalizeTierList(
      base({ tiers: [{ id: "s", label: "S", heroes: ["h01"] }] }),
      roster
    );
    assert.deepEqual(kept.tiers[0].heroes, ["h01"]);
    assert.ok(!normalizeTierList(base({}), roster).unranked.includes("h01"));
  });

  test("lane parsing", () => {
    assert.equal(parseLane(undefined), null);
    assert.equal(parseLane(null), null);
    assert.equal(parseLane("all"), null);
    assert.equal(parseLane("Jungle"), "Jungle");
    assert.throws(() => parseLane("Mid"), /valid lane/);
    assert.equal(lanePool(ROSTER, "Roamer").filter(isFlowborn).length, 1);
  });

  test("normalising twice changes nothing (idempotent)", () => {
    const once = normalizeTierList(base({ lane: "Jungle", unranked: ["retired", "h02"] }), ROSTER);
    assert.deepEqual(normalizeTierList(once, ROSTER), once);
  });
});

const app = await startTestServer({ seedHeroes: false });
if (app) {
  await app.store.saveHeroes([...sampleHeroes(30), ...FLOWBORN], "20260925");
}
after(async () => {
  await app?.close();
});

describe(
  "tier lists over HTTP",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("a lane list starts with exactly that lane's heroes in Unranked", async () => {
      const me = app.browser();
      const created = await me.post("/api/tier-lists", {
        name: "Mid",
        lane: "Mid Lane",
        tiers: [{ id: "s", label: "S", heroes: [] }],
        unranked: []
      });
      assert.equal(created.status, 200, created.text);
      assert.equal(created.body.lane, "Mid Lane");
      assert.ok(created.body.unranked.includes("582"));
      assert.ok(!created.body.unranked.includes("581"));
      assert.equal(
        created.body.unranked.filter(id => FLOWBORN.some(form => form.id === id)).length,
        1
      );
      assert.ok(
        created.body.unranked.every(id =>
          id.startsWith("5") ? id === "582" : Number(id.slice(1)) % 5 === 3
        )
      );
    });

    test("All Roles is the default and holds every available hero", async () => {
      const me = app.browser();
      const created = await me.post("/api/tier-lists", {
        name: "Everyone",
        tiers: [],
        unranked: []
      });
      assert.equal(created.body.lane, null);
      assert.equal(created.body.unranked.length, 35);
    });

    test("an invalid lane is refused", async () => {
      assert.equal(
        (
          await app
            .browser()
            .post("/api/tier-lists", { name: "x", lane: "Top", tiers: [], unranked: [] })
        ).status,
        400
      );
    });

    test("the lane cannot be changed by an update", async () => {
      const me = app.browser();
      const { body: list } = await me.post("/api/tier-lists", {
        name: "Jungle",
        lane: "Jungle",
        tiers: [],
        unranked: []
      });
      const updated = await me.put(`/api/tier-lists/${list.id}`, {
        ...list,
        lane: "Roamer",
        expectedVersion: 0
      });
      assert.equal(updated.body.lane, "Jungle");
    });

    test("lists can be filtered by lane and name", async () => {
      const me = app.browser();
      for (const [name, lane] of [
        ["Clash A", "Clash Lane"],
        ["Clash B", "Clash Lane"],
        ["Roam", "Roamer"],
        ["Anything", undefined]
      ]) {
        await me.post("/api/tier-lists", { name, lane, tiers: [], unranked: [] });
      }
      const names = async query =>
        (await me.get(`/api/tier-lists?${query}`)).body.items.map(item => item.name).sort();
      assert.deepEqual(await names("lane=Clash%20Lane"), ["Clash A", "Clash B"]);
      assert.deepEqual(await names("lane=all"), ["Anything"]);
      assert.deepEqual(await names("q=roam"), ["Roam"]);
      assert.deepEqual(await names("q=Clash&lane=Clash%20Lane"), ["Clash A", "Clash B"]);
      assert.equal((await me.get("/api/tier-lists?lane=Bogus")).status, 400);
      assert.equal(
        (await me.get("/api/tier-lists?q=%25")).body.items.length,
        0,
        "LIKE wildcards are escaped"
      );
    });

    test("a legacy list (no lane, legacy flowborn id, stale ids) is served normalised and cleaned on the next save", async () => {
      const me = app.browser();
      const { body: list } = await me.post("/api/tier-lists", {
        name: "Legacy",
        tiers: [{ id: "s", label: "S", heroes: [] }],
        unranked: []
      });
      const [[row]] = await app.store.pool.query("SELECT data_json FROM tier_lists WHERE id = ?", [
        list.id
      ]);
      const stored = JSON.parse(row.data_json);
      delete stored.lane;
      stored.tiers[0].heroes = ["flowborn", "ghost", "h01"];
      stored.unranked = ["h02"];
      await app.store.pool.query("UPDATE tier_lists SET data_json = ?, lane = NULL WHERE id = ?", [
        JSON.stringify(stored),
        list.id
      ]);

      const served = (await me.get(`/api/tier-lists/${list.id}`)).body;
      assert.equal(served.lane, null);
      assert.deepEqual(served.tiers[0].heroes, ["h01"], "legacy and stale ids are not served");
      assert.ok(
        served.unranked.includes("581") && served.unranked.includes("585"),
        "all five Flowborn forms are present"
      );
      const [[untouched]] = await app.store.pool.query(
        "SELECT data_json FROM tier_lists WHERE id = ?",
        [list.id]
      );
      assert.match(untouched.data_json, /flowborn/, "reading never rewrites the stored blob");

      await me.put(`/api/tier-lists/${list.id}`, { ...served, expectedVersion: served.version });
      const [[saved]] = await app.store.pool.query(
        "SELECT data_json FROM tier_lists WHERE id = ?",
        [list.id]
      );
      assert.doesNotMatch(saved.data_json, /"flowborn"/);
      assert.doesNotMatch(saved.data_json, /ghost/);
    });

    test("the hero API names every Flowborn form Flowborn and keeps the official name", async () => {
      const { heroes } = (await app.browser().get("/api/heroes")).body;
      const forms = heroes.filter(hero => hero.isFlowborn);
      assert.equal(forms.length, 5);
      assert.ok(
        forms.every(hero => hero.displayName === "Flowborn" && /^Flowborn \(/.test(hero.name))
      );
      assert.deepEqual(forms.map(hero => hero.id).sort(), ["581", "582", "583", "584", "585"]);
      assert.equal(heroes.find(hero => hero.id === "h01").displayName, "Hero h01");
    });
  }
);
