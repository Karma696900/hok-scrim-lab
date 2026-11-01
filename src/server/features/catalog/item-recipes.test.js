// The recipe of an item, as in the shop of the game: its LEVEL (`tier`: a small basic item, an intermediate
// one, a final one, an enchanted one of the Roaming family) and the items it is built FROM (`components`, up to
// three, the same one possibly twice: Grand Staff = Spell Tome + Spell Tome). The small and intermediate items
// are catalogue items like the big ones (shop category, tags, price). The rules of a recipe, and that a
// component cannot vanish while a recipe holds it.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { ITEM_TIERS, inBuilds } from "../../../shared/build-model.js";
import { parseItem } from "./catalog-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const known = {
  stats: new Map(),
  tagIds: new Set(),
  imageIds: new Set(),
  heroIds: new Set(),
  roles: new Set(),
  itemIds: new Set([3, 4, 5])
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

describe("recipes (pure)", () => {
  test("four levels, from the smallest to the enchanted ones", () => {
    assert.deepEqual(ITEM_TIERS, ["basic", "intermediate", "final", "enchanted"]);
  });

  test("a build takes the final and enchanted items, and those whose level nobody said yet; never a part", () => {
    assert.deepEqual(
      [...ITEM_TIERS, null, undefined].map(tier => inBuilds({ tier })),
      [false, false, true, true, true, true]
    );
  });

  test("the level: not said keeps it, none clears it, one of the four, nothing else", () => {
    assert.equal(item().tier, undefined, "not said (an older page): an update keeps it");
    for (const none of [null, ""]) {
      assert.equal(item({ tier: none }).tier, null);
    }
    for (const tier of ITEM_TIERS) {
      assert.equal(item({ tier }).tier, tier);
    }
    for (const bad of ["Final", "big", 2, [], {}]) {
      assert.equal(
        statusOf(() => item({ tier: bad })),
        400,
        JSON.stringify(bad)
      );
    }
  });

  test("the components: up to three known items, the same one possibly twice", () => {
    assert.equal(item().components, undefined, "not said: an update keeps the recipe");
    assert.deepEqual(item({ components: [] }).components, []);
    assert.deepEqual(item({ components: [3, 3] }).components, [3, 3]);
    assert.deepEqual(item({ components: [4, 5, 3] }).components, [4, 5, 3]);
    for (const bad of [[3, 4, 5, 3], [99], [0], ["4"], "3", {}]) {
      assert.equal(
        statusOf(() => item({ components: bad })),
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

describe("recipes through the admin API", { skip }, () => {
  const setup = async () => {
    const admin = await app.signIn("Smith", { admin: true });
    const post = async body => {
      const response = await admin.browser.post("/api/admin/catalog/items", {
        category: "regular",
        stats: [],
        ...body
      });
      assert.equal(response.status, 200, response.text);
      return response.body.id;
    };
    const put = (id, body) =>
      admin.browser.put(`/api/admin/catalog/items/${id}`, {
        category: "regular",
        stats: [],
        ...body
      });
    const byName = async name =>
      (await app.browser().get("/api/catalog")).body.items.find(entry => entry.name === name);
    return { admin, post, put, byName };
  };

  test("a small item, then an intermediate one built from it twice, read back in order", async () => {
    const { post, byName } = await setup();
    const tome = await post({ name: "Tome R", tier: "basic", price: 275, shopCategory: "magical" });
    const crystal = await post({ name: "Crystal R", tier: "basic", price: 300 });
    await post({ name: "Staff R", tier: "intermediate", price: 820, components: [tome, tome] });
    await post({ name: "Codex R", tier: "intermediate", price: 800, components: [tome, crystal] });
    const staff = await byName("Staff R");
    assert.equal(staff.tier, "intermediate");
    assert.deepEqual(staff.components, [tome, tome]);
    assert.deepEqual((await byName("Codex R")).components, [tome, crystal]);
    const small = await byName("Tome R");
    assert.deepEqual([small.tier, small.price, small.shopCategory], ["basic", 275, "magical"]);
    assert.deepEqual(small.components, []);
  });

  test("an update that does not mention the recipe keeps it; an item is never its own component", async () => {
    const { post, put, byName } = await setup();
    const blade = await post({ name: "Blade K", tier: "basic" });
    const sword = await post({ name: "Sword K", tier: "final", components: [blade] });
    assert.equal((await put(sword, { name: "Sword K", price: 2100 })).status, 200);
    const kept = await byName("Sword K");
    assert.deepEqual([kept.tier, kept.components, kept.price], ["final", [blade], 2100]);
    const self = await put(sword, { name: "Sword K", components: [blade, sword] });
    assert.equal(self.status, 400, self.text);
    assert.equal((await put(sword, { name: "Sword K", components: [] })).status, 200);
    assert.deepEqual((await byName("Sword K")).components, []);
  });

  test("a component held by a recipe cannot be deleted; the recipe goes with its item", async () => {
    const { admin, post, byName } = await setup();
    const agate = await post({ name: "Agate D", tier: "basic" });
    const belt = await post({ name: "Belt D", tier: "intermediate", components: [agate, agate] });
    const refused = await admin.browser.delete(`/api/admin/catalog/items/${agate}`);
    assert.equal(refused.status, 409, refused.text);
    assert.equal(refused.body.code, "in_recipe");
    assert.equal((await admin.browser.delete(`/api/admin/catalog/items/${belt}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/items/${agate}`)).status, 200);
    assert.equal(await byName("Agate D"), undefined);
  });
});
