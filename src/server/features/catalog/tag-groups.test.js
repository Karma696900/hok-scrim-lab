// The tags sorted by colour: the names of the colour groups, and merging a tag into another one (two
// tags that say the same thing). The merge moves everything that used the tag (labels of items, arcana
// and heroes, conditions, clashes) to the tag that stays, then deletes the tag.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { mergedClashes, retag } from "./tag-merge.js";
import { startTestServer } from "../../../testing/test-app.js";

const onTag = tagId => ({ match: "all", of: [{ kind: "tag", tagId }] });

describe("merging a tag (pure)", () => {
  test("every condition on the tag names the one that stays, at any depth", () => {
    const effects = [
      {
        kind: "passive",
        when: {
          match: "any",
          of: [
            { kind: "tag", tagId: 4 },
            { kind: "group", match: "all", of: [{ kind: "tag", tagId: 4, negate: true }] }
          ]
        },
        stats: [{ statId: 1, value: 5, when: onTag(4) }]
      }
    ];
    assert.deepEqual(retag(effects, 4, 9), [
      {
        kind: "passive",
        when: {
          match: "any",
          of: [
            { kind: "tag", tagId: 9 },
            { kind: "group", match: "all", of: [{ kind: "tag", tagId: 9, negate: true }] }
          ]
        },
        stats: [{ statId: 1, value: 5, when: onTag(9) }]
      }
    ]);
    assert.deepEqual(retag([{ kind: "stat", statId: 4, tagId: 4 }], 4, 9), [
      { kind: "stat", statId: 4, tagId: 4 }
    ]);
  });

  test("the clashes: the merged tag becomes the one that stays, once, never itself", () => {
    assert.deepEqual(mergedClashes(5, [4, 9], 4, 9), [9]);
    assert.deepEqual(mergedClashes(9, [5], 4, 9, [6, 9]), [5, 6]);
    assert.deepEqual(mergedClashes(9, [4], 4, 9), []);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("tag groups and merging (API)", { skip }, () => {
  test("only an administrator names the groups or merges tags", async () => {
    const user = await app.signIn("Plain");
    for (const [method, path] of [
      ["put", "/api/admin/catalog/tag-groups"],
      ["post", "/api/admin/catalog/tags/1/merge"]
    ]) {
      assert.equal((await app.browser()[method](path, {})).status, 401, path);
      assert.equal((await user.browser[method](path, {})).status, 403, path);
    }
  });

  test("the groups are named, renamed and unnamed", async () => {
    const admin = await app.signIn("Groups", { admin: true });
    const put = groups => admin.browser.put("/api/admin/catalog/tag-groups", { groups });
    assert.equal((await put({ red: "Dégâts", orange: "Contrôles" })).status, 200);
    let groups = (await app.browser().get("/api/catalog")).body.tagGroups;
    assert.equal(groups.red, "Dégâts");
    assert.equal(groups.orange, "Contrôles");
    assert.equal(groups.blue, "", "a colour nobody named has no name");
    assert.equal((await put({ red: "", orange: "Crowd control" })).status, 200);
    groups = (await app.browser().get("/api/catalog")).body.tagGroups;
    assert.deepEqual([groups.red, groups.orange], ["", "Crowd control"]);
    assert.equal((await put({ plaid: "x" })).status, 400, "not a colour of tags");
    assert.equal((await put({ red: "x".repeat(41) })).status, 400, "40 letters at most");
  });

  test("a merged tag leaves everything to the tag that stays, then goes", async () => {
    const admin = await app.signIn("Merge", { admin: true });
    const post = async (path, body) => {
      const response = await admin.browser.post(path, body);
      assert.equal(response.status, 200, `${path}: ${response.text}`);
      return response.body.id;
    };
    const stat = await post("/api/admin/catalog/stats", { name: "Merge HP", sortOrder: 1 });
    const keep = await post("/api/admin/catalog/tags", { name: "Attack Speed", color: "pink" });
    const twin = await post("/api/admin/catalog/tags", { name: "Atk Speed", color: "pink" });
    const other = await post("/api/admin/catalog/tags", {
      name: "Slow",
      color: "orange",
      conflicts: [twin]
    });
    const both = await post("/api/admin/catalog/items", {
      name: "Both tags",
      category: "regular",
      stats: [],
      effects: [],
      tags: [keep, twin]
    });
    const item = await post("/api/admin/catalog/items", {
      name: "Twin only",
      category: "regular",
      stats: [{ statId: stat, value: 10, when: onTag(twin) }],
      effects: [
        {
          kind: "passive",
          name: "",
          text: "Faster.",
          when: onTag(twin),
          stats: [{ statId: stat, value: 5, when: onTag(twin) }]
        }
      ],
      tags: [twin]
    });
    const arcana = await post("/api/admin/catalog/arcana", {
      name: "Twin arcana",
      color: "red",
      stats: [{ statId: stat, value: 1, when: onTag(twin) }],
      tags: [twin]
    });
    const hero = await admin.browser.put("/api/admin/heroes/h02/profile", {
      baseStats: [],
      skills: [],
      tags: [twin]
    });
    assert.equal(hero.status, 200, hero.text);

    const merge = (from, into) =>
      admin.browser.post(`/api/admin/catalog/tags/${from}/merge`, { into });
    assert.equal((await merge(twin, twin)).status, 400, "not into itself");
    assert.equal((await merge(twin, 999_999)).status, 404, "into a tag that does not exist");
    assert.equal((await merge(twin, keep)).status, 200);

    const catalog = (await app.browser().get("/api/catalog")).body;
    assert.equal(
      catalog.tags.some(tag => tag.id === twin),
      false,
      "the merged tag is gone"
    );
    const byId = (list, id) => list.find(entry => entry.id === id);
    assert.deepEqual(byId(catalog.items, both).tags, [keep], "carried once");
    const merged = byId(catalog.items, item);
    assert.deepEqual(merged.tags, [keep]);
    assert.deepEqual(merged.stats[0].when, onTag(keep));
    assert.deepEqual(merged.effects[0].when, onTag(keep));
    assert.deepEqual(merged.effects[0].stats[0].when, onTag(keep));
    const merged2 = byId(catalog.arcana, arcana);
    assert.deepEqual([merged2.tags, merged2.stats[0].when], [[keep], onTag(keep)]);
    assert.deepEqual(byId(catalog.tags, other).conflicts, [keep], "the clash follows");
    const sheet = (await app.browser().get("/api/heroes/h02")).body;
    assert.deepEqual(sheet.profile.tags, [keep]);
    assert.equal((await merge(twin, keep)).status, 404, "already merged");
  });
});
