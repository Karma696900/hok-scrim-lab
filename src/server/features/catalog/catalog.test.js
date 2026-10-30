// The game catalogue: the build model (slots, arcana quantities, total stats), then the admin API
// (stats, tags, pictures, items, arcana, hero profiles, recommended builds) and the public read.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import {
  ARCANA_COLORS,
  checkBuild,
  emptyBuild,
  sortArcana,
  statAtLevel,
  totalStats
} from "../../../shared/build-model.js";
import { startTestServer } from "../../../testing/test-app.js";

const fixture = {
  stats: [
    { id: 1, name: "Max HP", unit: "flat", sortOrder: 1 },
    { id: 2, name: "Physical Attack", unit: "flat", sortOrder: 2 },
    { id: 3, name: "Crit Rate", unit: "percent", sortOrder: 3 }
  ],
  tags: [
    { id: 1, name: "Physical", color: "red", conflicts: [2] },
    { id: 2, name: "Magic", color: "blue", conflicts: [1] },
    { id: 3, name: "Tank", color: "green", conflicts: [] }
  ],
  items: [
    { id: 10, name: "Boots A", category: "boots", stats: [{ statId: 1, value: 100 }], tags: [] },
    { id: 11, name: "Boots B", category: "boots", stats: [], tags: [] },
    {
      id: 12,
      name: "Sword",
      category: "regular",
      stats: [
        { statId: 2, value: 100 },
        { statId: 3, value: 10 }
      ],
      tags: [1]
    },
    { id: 13, name: "Staff", category: "regular", stats: [], tags: [2] },
    ...[14, 15, 16, 17, 18].map(id => ({
      id,
      name: `Plain ${id}`,
      category: "regular",
      stats: [],
      tags: []
    })),
    { id: 20, name: "Shield", category: "utility", stats: [], tags: [3] },
    { id: 21, name: "Relic", category: "late", stats: [], tags: [] }
  ],
  arcana: [
    { id: 100, name: "Zeal", color: "red", stats: [{ statId: 2, value: 2 }], tags: [1] },
    { id: 101, name: "Alpha", color: "red", stats: [{ statId: 3, value: 1 }], tags: [] },
    { id: 102, name: "Mind", color: "blue", stats: [], tags: [2] },
    { id: 103, name: "Life", color: "green", stats: [{ statId: 1, value: 20 }], tags: [] }
  ]
};
const problemsOf = raw => checkBuild(raw, fixture).problems.map(problem => problem.template);

describe("build model", () => {
  test("a build with 6 items (boots included), 2 utility, 2 late-game and arcana is valid", () => {
    const { build, problems } = checkBuild(
      {
        items: [10, 12, 14, 15, 16, 17],
        utility: [20],
        late: [21],
        arcana: {
          red: [
            { id: 100, count: 7 },
            { id: 101, count: 3 }
          ],
          blue: [],
          green: [{ id: 103, count: 10 }]
        }
      },
      fixture
    );
    assert.deepEqual(problems, []);
    assert.equal(build.items.length, 6);
  });

  test("slot limits, categories, duplicates and one pair of boots", () => {
    assert.equal(problemsOf({ items: [10, 12, 14, 15, 16, 17, 18] }).length, 1);
    assert.equal(problemsOf({ utility: [20, 20] }).length, 1, "the same item twice");
    assert.ok(
      problemsOf({ items: [20] }).some(text => /does not go in this group/.test(text)),
      "a utility item is not a main item"
    );
    assert.ok(problemsOf({ utility: [12] }).length >= 1);
    assert.ok(problemsOf({ items: [10, 11] }).some(text => /only one pair of boots/.test(text)));
    assert.equal(problemsOf({ items: [999] }).length, 1, "unknown item");
    assert.equal(problemsOf({ late: [21, 20, 10] }).length >= 1, true);
  });

  test("core items: up to 3, among the main items, each once", () => {
    assert.deepEqual(
      checkBuild({ items: [10, 12, 14], core: [12, 14] }, fixture).build.core,
      [12, 14]
    );
    assert.deepEqual(
      problemsOf({ items: [10, 12, 14, 15], core: [10, 12, 14, 15] }).length,
      1,
      "4 core items"
    );
    assert.equal(
      problemsOf({ items: [12], utility: [20], core: [20] }).length,
      1,
      "a utility item is not a main item"
    );
    assert.equal(
      problemsOf({ items: [12], core: [14] }).length,
      1,
      "a core item that is not in the build"
    );
    assert.deepEqual(
      checkBuild({ items: [12, 14], core: [12, 12] }, fixture).build.core,
      [12],
      "listed twice, kept once"
    );
    assert.deepEqual(emptyBuild().core, []);
  });

  test("arcana: 10 per colour counted with their quantities, right colour, whole quantities, no duplicate", () => {
    assert.deepEqual(
      problemsOf({
        arcana: {
          red: [
            { id: 100, count: 6 },
            { id: 101, count: 4 }
          ]
        }
      }),
      []
    );
    assert.equal(
      problemsOf({
        arcana: {
          red: [
            { id: 100, count: 6 },
            { id: 101, count: 5 }
          ]
        }
      }).length,
      1,
      "11 red"
    );
    assert.equal(
      problemsOf({ arcana: { blue: [{ id: 100, count: 1 }] } }).length,
      1,
      "a red arcana in blue"
    );
    assert.equal(problemsOf({ arcana: { red: [{ id: 100, count: 0 }] } }).length, 1);
    assert.equal(problemsOf({ arcana: { red: [{ id: 100, count: 1.5 }] } }).length, 1);
    assert.equal(
      problemsOf({
        arcana: {
          red: [
            { id: 100, count: 2 },
            { id: 100, count: 2 }
          ]
        }
      }).length,
      1
    );
    assert.equal(problemsOf({ arcana: { red: [{ id: 555, count: 2 }] } }).length, 1);
  });

  test("arcana are displayed by quantity, the biggest first (×7 before ×3)", () => {
    const { build } = checkBuild(
      {
        arcana: {
          red: [
            { id: 101, count: 3 },
            { id: 100, count: 7 }
          ]
        }
      },
      fixture
    );
    assert.deepEqual(
      build.arcana.red.map(entry => entry.count),
      [7, 3]
    );
    const tie = sortArcana(
      [
        { id: 101, count: 5 },
        { id: 100, count: 5 }
      ],
      new Map(fixture.arcana.map(entry => [entry.id, entry]))
    );
    assert.deepEqual(
      tie.map(entry => entry.id),
      [101, 100],
      "equal quantities by name"
    );
    assert.deepEqual(ARCANA_COLORS, ["red", "blue", "green"]);
  });

  test("total stats: hero base at its level + items + arcana × quantity", () => {
    assert.equal(statAtLevel({ value: 3000, growth: 100 }, 1), 3000);
    assert.equal(statAtLevel({ value: 3000, growth: 100 }, 15), 4400);
    assert.equal(statAtLevel({ value: 3000, growth: 100 }, 99), 4400, "capped at level 15");
    const profile = {
      baseStats: [
        { statId: 1, value: 3000, growth: 100 },
        { statId: 2, value: 150, growth: 10 }
      ]
    };
    const { build } = checkBuild(
      {
        items: [10, 12],
        arcana: { red: [{ id: 100, count: 10 }], green: [{ id: 103, count: 5 }] }
      },
      fixture
    );
    const rows = Object.fromEntries(
      totalStats(profile, build, 5, fixture).map(row => [row.statId, row])
    );
    assert.deepEqual(
      [rows[1].base, rows[1].items, rows[1].arcana, rows[1].total],
      [3400, 100, 100, 3600]
    );
    assert.deepEqual(
      [rows[2].base, rows[2].items, rows[2].arcana, rows[2].total],
      [190, 100, 20, 310]
    );
    assert.deepEqual(
      [rows[3].items, rows[3].total],
      [10, 10],
      "a stat only items give still appears"
    );
    assert.deepEqual(totalStats({ baseStats: [] }, emptyBuild(), 1, fixture), []);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const png = (width = 200, height = 100) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.5 } }
  })
    .png()
    .toBuffer();
const upload = async (browser, body, type = "image/png") => {
  const response = await fetch(`${app.baseUrl}/api/admin/catalog/images`, {
    method: "POST",
    headers: {
      "content-type": type,
      cookie: [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ")
    },
    body
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

describe("catalogue API", { skip }, () => {
  test("everybody reads the catalogue, only an administrator writes it", async () => {
    assert.equal((await app.browser().get("/api/catalog")).status, 200, "no account needed");
    const user = await app.signIn("Plain");
    for (const [method, path] of [
      ["post", "/api/admin/catalog/stats"],
      ["post", "/api/admin/catalog/tags"],
      ["post", "/api/admin/catalog/items"],
      ["post", "/api/admin/catalog/arcana"],
      ["put", "/api/admin/heroes/h01/profile"],
      ["put", "/api/builds/h01/1"]
    ]) {
      assert.equal((await app.browser()[method](path, {})).status, 401, path);
      assert.equal((await user.browser[method](path, {})).status, 403, path);
    }
    assert.equal((await upload(user.browser, await png())).status, 403);
  });

  test("stats, tags (with clashes), a picture, an item with several effects, an arcana with 0 to 4 stats", async () => {
    const admin = await app.signIn("Catalog", { admin: true });
    const post = async (path, body) => {
      const response = await admin.browser.post(path, body);
      assert.equal(response.status, 200, `${path}: ${response.text}`);
      return response.body.id;
    };
    const hp = await post("/api/admin/catalog/stats", {
      name: "Max HP",
      unit: "flat",
      sortOrder: 1
    });
    const crit = await post("/api/admin/catalog/stats", {
      name: "Crit Rate",
      unit: "percent",
      sortOrder: 2
    });
    const pdef = await post("/api/admin/catalog/stats", { name: "Physical Defense", sortOrder: 3 });
    const mdef = await post("/api/admin/catalog/stats", { name: "Magic Defense", sortOrder: 4 });
    const speed = await post("/api/admin/catalog/stats", { name: "Move Speed", sortOrder: 5 });
    assert.equal(
      (await admin.browser.post("/api/admin/catalog/stats", { name: "max hp" })).status,
      409,
      "stat names are unique, whatever the case"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/catalog/stats", { name: "Bad", unit: "weird" })).status,
      400
    );

    const physical = await post("/api/admin/catalog/tags", { name: "Physical", color: "red" });
    const magic = await post("/api/admin/catalog/tags", {
      name: "Magic",
      color: "blue",
      conflicts: [physical]
    });
    assert.equal(
      (
        await admin.browser.put(`/api/admin/catalog/tags/${physical}`, {
          name: "Physical",
          color: "red",
          conflicts: [physical]
        })
      ).status,
      400,
      "not with itself"
    );
    assert.equal(
      (
        await admin.browser.put(`/api/admin/catalog/tags/${physical}`, {
          name: "Physical",
          color: "red",
          conflicts: [magic]
        })
      ).status,
      200
    );
    assert.equal(
      (await admin.browser.post("/api/admin/catalog/tags", { name: "Odd", color: "plaid" })).status,
      400
    );

    const image = await upload(admin.browser, await png());
    assert.equal(image.status, 200, JSON.stringify(image.body));
    const served = await fetch(`${app.baseUrl}${image.body.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/webp");
    assert.match(served.headers.get("cache-control"), /immutable/);
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    assert.deepEqual(
      [meta.width, meta.height, meta.hasAlpha],
      [200, 100, true],
      "kept as it is when it is not bigger than 256 px (it used to be shrunk to 128 px), transparency kept"
    );
    assert.equal((await upload(admin.browser, Buffer.from("nope"))).status, 400);
    assert.equal((await fetch(`${app.baseUrl}/catalog-images/not-an-id`)).status, 404);

    const item = await post("/api/admin/catalog/items", {
      name: "Sunblade",
      category: "regular",
      price: 2100,
      imageId: image.body.id,
      description: "A blade.",
      tags: [physical],
      stats: [
        { statId: hp, value: 400 },
        { statId: crit, value: 15 },
        { statId: pdef, value: 60.5 }
      ],
      effects: [
        { kind: "passive", name: "Edge", text: "Gain attack." },
        { kind: "passive", name: "Blaze", text: "Burn foes." },
        { kind: "active", name: "Flash", text: "Dash.", cooldownSeconds: 60 }
      ]
    });
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/items", {
          name: "SUNBLADE",
          category: "regular",
          stats: []
        })
      ).status,
      409
    );
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/items", {
          name: "X",
          category: "hat",
          stats: []
        })
      ).status,
      400
    );
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/items", {
          name: "Y",
          category: "regular",
          imageId: "00000000-0000-4000-8000-000000000000",
          stats: []
        })
      ).status,
      400,
      "an unknown picture"
    );
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/items", {
          name: "Z",
          category: "regular",
          stats: [{ statId: 9999, value: 1 }]
        })
      ).status,
      400,
      "an unknown stat"
    );
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/items", {
          name: "Z",
          category: "regular",
          stats: [
            { statId: hp, value: 1 },
            { statId: hp, value: 2 }
          ]
        })
      ).status,
      400,
      "the same stat twice"
    );

    const arcana = {
      name: "Zeal",
      color: "red",
      stats: [
        { statId: hp, value: 5 },
        { statId: crit, value: 1 },
        { statId: pdef, value: 2 },
        { statId: mdef, value: 3 }
      ],
      tags: [magic]
    };
    const zeal = await post("/api/admin/catalog/arcana", arcana);
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/arcana", {
          ...arcana,
          name: "Five",
          stats: [...arcana.stats, { statId: speed, value: 1 }]
        })
      ).status,
      400,
      "5 stats"
    );
    assert.equal(
      (
        await admin.browser.post("/api/admin/catalog/arcana", {
          ...arcana,
          name: "None",
          stats: []
        })
      ).status,
      200,
      "0 stats: an arcana can exist before its stats are written"
    );
    const one = await post("/api/admin/catalog/arcana", {
      name: "Single",
      color: "blue",
      stats: [{ statId: speed, value: 2 }]
    });

    const catalog = (await app.browser().get("/api/catalog")).body;
    const read = catalog.items.find(entry => entry.id === item);
    assert.equal(read.effects.length, 3);
    assert.deepEqual(
      read.effects.map(entry => entry.kind),
      ["passive", "passive", "active"]
    );
    assert.equal(read.effects[2].cooldownSeconds, 60);
    assert.equal(read.stats.find(entry => entry.statId === pdef).value, 60.5);
    assert.deepEqual(read.tags, [physical]);
    assert.equal(catalog.arcana.find(entry => entry.id === zeal).stats.length, 4);
    assert.equal(catalog.arcana.find(entry => entry.id === one).stats.length, 1);
    assert.deepEqual(catalog.tags.find(entry => entry.id === physical).conflicts, [magic]);

    // Replacing the picture drops the old one; deleting a tag removes it everywhere.
    const second = await upload(admin.browser, await png(50, 50));
    assert.equal(
      (
        await admin.browser.put(`/api/admin/catalog/items/${item}`, {
          name: "Sunblade",
          category: "regular",
          imageId: second.body.id,
          stats: [],
          tags: [physical]
        })
      ).status,
      200
    );
    assert.equal(
      (await fetch(`${app.baseUrl}${image.body.url}`)).status,
      404,
      "the old picture is gone"
    );
    assert.equal((await fetch(`${app.baseUrl}${second.body.url}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/tags/${physical}`)).status, 200);
    const after = (await app.browser().get("/api/catalog")).body;
    assert.deepEqual(after.items.find(entry => entry.id === item).tags, []);
    assert.deepEqual(
      after.tags.find(entry => entry.id === magic).conflicts,
      [],
      "the clash list of the other tag is cleaned"
    );

    // A stat in use cannot be deleted.
    assert.equal((await admin.browser.delete(`/api/admin/catalog/stats/${speed}`)).status, 409);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/arcana/${one}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/stats/${speed}`)).status, 200);
    assert.equal((await admin.browser.delete("/api/admin/catalog/stats/99999")).status, 404);
  });

  test("a hero profile (base stats with growth, spell details, tags) and recommended builds that use the catalogue", async () => {
    const admin = await app.signIn("Profiler", { admin: true });
    const id = async (path, body) => (await admin.browser.post(path, body)).body.id;
    const hp = await id("/api/admin/catalog/stats", { name: "HP 2" });
    const atk = await id("/api/admin/catalog/stats", { name: "Attack 2" });
    const tag = await id("/api/admin/catalog/tags", { name: "Marksman" });
    const boots = await id("/api/admin/catalog/items", {
      name: "Boots Z",
      category: "boots",
      stats: [{ statId: hp, value: 50 }]
    });
    const boots2 = await id("/api/admin/catalog/items", {
      name: "Boots Y",
      category: "boots",
      stats: []
    });
    const blade = await id("/api/admin/catalog/items", {
      name: "Blade Z",
      category: "regular",
      stats: [{ statId: atk, value: 80 }],
      tags: [tag]
    });
    const relic = await id("/api/admin/catalog/items", {
      name: "Relic Z",
      category: "late",
      stats: []
    });
    const red = await id("/api/admin/catalog/arcana", {
      name: "Red Z",
      color: "red",
      stats: [{ statId: atk, value: 1.5 }]
    });

    const profile = {
      baseStats: [
        { statId: hp, value: 3200, growth: 120 },
        { statId: atk, value: 160, growth: 12.5 }
      ],
      tags: [tag],
      skills: [
        {
          key: "1",
          name: "Shot",
          cooldown: [8, 7.5, 7, 6.5, 6, 5.5],
          cost: [60, 65, 70],
          costLabel: "Mana",
          range: 7.5,
          castTime: 0.2,
          components: [
            {
              label: "Damage",
              kind: "damage",
              unit: "flat",
              values: [100, 150, 200, 250, 300, 350],
              scaling: [{ statId: atk, percent: 90 }],
              text: "On the first target hit."
            }
          ],
          notes: "Cannot crit."
        }
      ]
    };
    const saved = await admin.browser.put("/api/admin/heroes/h03/profile", profile);
    assert.equal(saved.status, 200, saved.text);
    const sheet = (await app.browser().get("/api/heroes/h03")).body;
    assert.deepEqual(sheet.profile.tags, [tag]);
    assert.equal(sheet.profile.baseStats[1].growth, 12.5);
    assert.equal(sheet.profile.skills[0].components[0].scaling[0].percent, 90);
    assert.equal(
      (
        await admin.browser.put("/api/admin/heroes/h03/profile", {
          ...profile,
          baseStats: [{ statId: 9999, value: 1 }]
        })
      ).status,
      400
    );
    assert.equal(
      (
        await admin.browser.put("/api/admin/heroes/h03/profile", {
          ...profile,
          skills: [profile.skills[0], profile.skills[0]]
        })
      ).status,
      400,
      "a spell twice"
    );
    assert.equal((await admin.browser.put("/api/admin/heroes/h77/profile", profile)).status, 404);
    assert.deepEqual(
      (await app.browser().get("/api/heroes/h04")).body.profile,
      { baseStats: [], skills: [], tags: [], updatedAt: null },
      "nothing is invented for a hero without a profile"
    );
    assert.deepEqual((await app.browser().get("/api/catalog")).body.heroTags.h03, [tag]);

    const build = {
      items: [boots, blade],
      utility: [],
      late: [relic],
      core: [boots, blade],
      arcana: { red: [{ id: red, count: 10 }], blue: [], green: [] }
    };
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          name: "Burst",
          build,
          note: "mine",
          sourceUrl: "https://example.test/b"
        })
      ).status,
      200
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/2", {
          name: "Safe",
          build: { ...build, late: [] }
        })
      ).status,
      200
    );
    assert.equal((await admin.browser.put("/api/builds/h03/3", { build })).status, 404);
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build: { ...build, core: [blade] }
        })
      ).status,
      400,
      "a recommended build marks 2 or 3 core items: 1 is not enough"
    );
    assert.equal(
      (await admin.browser.put("/api/builds/h03/1", { build: { ...build, core: [] } })).status,
      400,
      "none either"
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build: { ...build, core: [boots, blade, relic] }
        })
      ).status,
      400,
      "a late-game item is not a main item"
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build: { ...build, items: [boots, boots2] }
        })
      ).status,
      400,
      "two pairs of boots"
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build: { ...build, arcana: { red: [{ id: red, count: 11 }] } }
        })
      ).status,
      400,
      "11 arcana of one colour"
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build: { items: [], utility: [], late: [], arcana: { red: [], blue: [], green: [] } }
        })
      ).status,
      400,
      "an empty build"
    );
    assert.equal(
      (
        await admin.browser.put("/api/builds/h03/1", {
          build,
          sourceUrl: "http://example.test"
        })
      ).status,
      400
    );
    const builds = (await app.browser().get("/api/heroes/h03")).body.builds;
    assert.deepEqual(
      builds.map(entry => [entry.variant, entry.name]),
      [
        [1, "Burst"],
        [2, "Safe"]
      ]
    );
    assert.deepEqual(builds[0].build.arcana.red, [{ id: red, count: 10 }]);
    assert.deepEqual(
      builds[0].build.core,
      [boots, blade],
      "the core items are stored with the build"
    );

    // What a build uses cannot be deleted from under it.
    assert.equal((await admin.browser.delete(`/api/admin/catalog/items/${blade}`)).status, 409);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/arcana/${red}`)).status, 409);
    assert.equal((await admin.browser.delete("/api/builds/h03/1")).status, 200);
    assert.equal((await admin.browser.delete("/api/builds/h03/2")).status, 200);
    assert.equal((await admin.browser.delete("/api/builds/h03/2")).status, 404);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/items/${blade}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/arcana/${red}`)).status, 200);
  });
});
