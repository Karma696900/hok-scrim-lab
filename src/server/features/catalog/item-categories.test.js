// The two ways to sort an item: the SLOT it goes in (boots, item, utility, late-game: `category`, what
// a build has room for) and the SHOP CATEGORY it is found under (Physical, Magical, Defense, Movement,
// Jungling, Roaming: `shopCategory`, one at most, like the shop of the game). The rules of the second
// one, its bulk assignment (an administrator sorts a list of items in a few clicks) and the rule that
// keeps recommended builds valid when the slot of an item changes.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { GROUP_OF, ITEM_CATEGORIES, SHOP_CATEGORIES } from "../../../shared/build-model.js";
import { parseItem } from "./catalog-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const known = {
  stats: new Map(),
  tagIds: new Set(),
  imageIds: new Set(),
  heroIds: new Set(),
  roles: new Set()
};
const item = (extra = {}) => parseItem({ name: "Sword", category: "regular", ...extra }, known);
const statusOf = fn => {
  try {
    fn();
  } catch (error) {
    return error.status;
  }
  return null;
};

describe("shop categories (pure)", () => {
  test("six categories, and they are not the slots", () => {
    assert.deepEqual(SHOP_CATEGORIES, [
      "physical",
      "magical",
      "defense",
      "movement",
      "jungling",
      "roaming"
    ]);
    assert.deepEqual(ITEM_CATEGORIES, ["boots", "regular", "utility", "late"]);
    assert.deepEqual(
      SHOP_CATEGORIES.filter(name => ITEM_CATEGORIES.includes(name)),
      [],
      "no word is both"
    );
    assert.deepEqual(GROUP_OF, {
      boots: "items",
      regular: "items",
      utility: "utility",
      late: "late"
    });
  });

  test("none, or one of the six; the slot is read as before", () => {
    for (const none of [null, ""]) {
      assert.equal(item({ shopCategory: none }).shopCategory, null, "said: none");
    }
    assert.equal(
      item().shopCategory,
      undefined,
      "not said (an older page): an update keeps what is there, a new item has none"
    );
    for (const name of SHOP_CATEGORIES) {
      assert.equal(item({ shopCategory: name }).shopCategory, name);
    }
    const boots = item({ category: "boots", shopCategory: "movement" });
    assert.deepEqual([boots.category, boots.shopCategory], ["boots", "movement"]);
    const late = item({ category: "late", shopCategory: "physical" });
    assert.deepEqual([late.category, late.shopCategory], ["late", "physical"]);
  });

  test("anything else is refused: a slot is not a category, nor is a made-up word or another case", () => {
    for (const bad of [
      "boots",
      "regular",
      "utility",
      "late",
      "Physical",
      "attack",
      " physical",
      3,
      [],
      {}
    ]) {
      assert.equal(
        statusOf(() => item({ shopCategory: bad })),
        400,
        JSON.stringify(bad)
      );
    }
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("shop categories through the admin API", { skip }, () => {
  const setup = async () => {
    const admin = await app.signIn("Sorter", { admin: true });
    const post = async (path, body) => {
      const response = await admin.browser.post(path, body);
      assert.equal(response.status, 200, `${path}: ${response.text}`);
      return response.body.id;
    };
    const catalog = async () => (await app.browser().get("/api/catalog")).body;
    const byName = async name => (await catalog()).items.find(entry => entry.name === name);
    return { admin, post, catalog, byName };
  };

  test("an item is saved with its category, read back, changed, and cleared", async () => {
    const { admin, post, byName } = await setup();
    const id = await post("/api/admin/catalog/items", {
      name: "Hunter's Knife",
      category: "regular",
      shopCategory: "jungling",
      stats: []
    });
    assert.equal((await byName("Hunter's Knife")).shopCategory, "jungling");
    const plain = await post("/api/admin/catalog/items", {
      name: "Plain",
      category: "regular",
      stats: []
    });
    assert.equal((await byName("Plain")).shopCategory, null, "none until somebody chooses");

    const put = body => admin.browser.put(`/api/admin/catalog/items/${id}`, body);
    assert.equal(
      (
        await put({
          name: "Hunter's Knife",
          category: "regular",
          shopCategory: "roaming",
          stats: []
        })
      ).status,
      200
    );
    assert.equal((await byName("Hunter's Knife")).shopCategory, "roaming");
    assert.equal(
      (await put({ name: "Hunter's Knife", category: "regular", shopCategory: null, stats: [] }))
        .status,
      200
    );
    assert.equal((await byName("Hunter's Knife")).shopCategory, null, "null clears it");

    const refused = await admin.browser.post("/api/admin/catalog/items", {
      name: "Wrong",
      category: "regular",
      shopCategory: "boots",
      stats: []
    });
    assert.equal(refused.status, 400);
    assert.ok(plain);
  });

  test("a form that does not know the categories (an older page) does not erase them", async () => {
    const { admin, post, byName } = await setup();
    const id = await post("/api/admin/catalog/items", {
      name: "Kept category",
      category: "regular",
      shopCategory: "defense",
      stats: []
    });
    const old = await admin.browser.put(`/api/admin/catalog/items/${id}`, {
      name: "Kept category",
      category: "regular",
      price: 900,
      stats: []
    });
    assert.equal(old.status, 200);
    const read = await byName("Kept category");
    assert.deepEqual([read.shopCategory, read.price], ["defense", 900]);
  });

  test("bulk: sort many items at once; nothing changes unless everything is valid", async () => {
    const { admin, post, byName } = await setup();
    const ids = [];
    for (const name of ["Bulk A", "Bulk B", "Bulk C"]) {
      ids.push(await post("/api/admin/catalog/items", { name, category: "regular", stats: [] }));
    }
    const bulk = body => admin.browser.post("/api/admin/catalog/items/bulk", body);

    const done = await bulk({ ids: [ids[0], ids[1]], shopCategory: "magical" });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.updated, 2);
    assert.equal((await byName("Bulk A")).shopCategory, "magical");
    assert.equal((await byName("Bulk B")).shopCategory, "magical");
    assert.equal((await byName("Bulk C")).shopCategory, null);

    // slot and category together; everything else about the items stays
    const both = await bulk({ ids: [ids[2]], category: "utility", shopCategory: "roaming" });
    assert.equal(both.status, 200, both.text);
    const c = await byName("Bulk C");
    assert.deepEqual([c.category, c.shopCategory], ["utility", "roaming"]);

    // clearing
    assert.equal((await bulk({ ids: [ids[0]], shopCategory: null })).status, 200);
    assert.equal((await byName("Bulk A")).shopCategory, null);

    // refused as a whole: an unknown item, an unknown category, nothing to change, a bad list
    const before = JSON.stringify((await byName("Bulk B")).shopCategory);
    for (const [body, status, why] of [
      [{ ids: [ids[1], 99999999], shopCategory: "physical" }, 404, "an item that does not exist"],
      [{ ids: [ids[1]], shopCategory: "boots" }, 400, "a slot is not a category"],
      [{ ids: [ids[1]], category: "shoes" }, 400, "an unknown slot"],
      [{ ids: [ids[1]] }, 400, "nothing to change"],
      [{ ids: [], shopCategory: "physical" }, 400, "no item"],
      [{ ids: [ids[1], ids[1]], shopCategory: "physical" }, 400, "twice the same"],
      [{ ids: "1", shopCategory: "physical" }, 400, "not a list"],
      [
        { ids: Array.from({ length: 301 }, (_, index) => index + 1), shopCategory: "physical" },
        400,
        "too many"
      ]
    ]) {
      assert.equal((await bulk(body)).status, status, why);
    }
    assert.equal(JSON.stringify((await byName("Bulk B")).shopCategory), before, "unchanged");
  });

  test("only an administrator sorts items", async () => {
    const { post } = await setup();
    const id = await post("/api/admin/catalog/items", {
      name: "Guarded",
      category: "regular",
      stats: []
    });
    const user = await app.signIn("Plain");
    const body = { ids: [id], shopCategory: "physical" };
    assert.equal((await app.browser().post("/api/admin/catalog/items/bulk", body)).status, 401);
    assert.equal((await user.browser.post("/api/admin/catalog/items/bulk", body)).status, 403);
  });

  test("the slot of an item that recommended builds use cannot change (the builds would break)", async () => {
    const { admin, post, byName } = await setup();
    const used = await post("/api/admin/catalog/items", {
      name: "In a build",
      category: "regular",
      stats: []
    });
    const other = await post("/api/admin/catalog/items", {
      name: "Other in a build",
      category: "regular",
      stats: []
    });
    const saved = await admin.browser.put("/api/builds/h01/1", {
      name: "Test",
      build: { items: [used, other], utility: [], late: [], core: [used, other], arcana: {} }
    });
    assert.equal(saved.status, 200, saved.text);

    const bulk = body => admin.browser.post("/api/admin/catalog/items/bulk", body);
    const refused = await bulk({ ids: [used], category: "late" });
    assert.equal(refused.status, 409, refused.text);
    assert.equal((await byName("In a build")).category, "regular", "unchanged");
    const single = await admin.browser.put(`/api/admin/catalog/items/${used}`, {
      name: "In a build",
      category: "utility",
      stats: []
    });
    assert.equal(single.status, 409, "the same rule when the item is edited");

    // its shop category is not a slot: free to change
    assert.equal((await bulk({ ids: [used], shopCategory: "physical" })).status, 200);
    assert.equal((await byName("In a build")).shopCategory, "physical");
    // the same slot again is not a change
    assert.equal((await bulk({ ids: [used], category: "regular" })).status, 200);
    // and an item no build uses can move
    const free = await post("/api/admin/catalog/items", {
      name: "Free item",
      category: "regular",
      stats: []
    });
    assert.equal((await bulk({ ids: [free], category: "late" })).status, 200);
  });
});
