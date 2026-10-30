// The catalogue is read often and written rarely, so the store keeps what it read for a few seconds
// and forgets it at every write. A read that was already under way when a write happened must not be
// kept: it holds what the catalogue was before the write, and it would be served for the next half
// minute (an administrator saves, the page reads again, and sees nothing changed).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCatalogStore } from "./catalog-store.js";

/** A pool that answers only when it is told to, and that holds the items it was given at each read. */
function fakeDatabase() {
  const state = { reads: 0, items: [], gate: null };
  const pool = {
    async query(sql) {
      if (/FROM catalog_items/.test(sql)) {
        state.reads += 1;
        const snapshot = [...state.items];
        if (state.gate) {
          await state.gate;
        }
        return [snapshot];
      }
      return [[]];
    },
    async execute() {
      return [{ insertId: 1 }];
    }
  };
  const connection = {
    async execute(sql) {
      if (!/INSERT INTO catalog_items/.test(sql)) {
        return [{}];
      }
      state.items.push({
        id: 1,
        name: "New",
        category: "regular",
        shop_category: null,
        price: null,
        image_id: null,
        description: "",
        effects_json: "[]",
        stats_json: "[]"
      });
      return [{ insertId: 1 }];
    },
    async query() {
      return [[]];
    }
  };
  return { state, pool, inTransaction: work => work(connection) };
}

describe("the catalogue cache", () => {
  test("a read answers from memory until something is written", async () => {
    const database = fakeDatabase();
    const store = createCatalogStore(database);
    await store.readCatalog();
    await store.readCatalog();
    assert.equal(database.state.reads, 1);
  });

  test("a write makes the next read look again", async () => {
    const database = fakeDatabase();
    const store = createCatalogStore(database);
    assert.equal((await store.readCatalog()).items.length, 0);
    await store.createItem({
      name: "New",
      category: "regular",
      shopCategory: null,
      price: null,
      imageId: null,
      description: "",
      effects: [],
      stats: [],
      tags: []
    });
    assert.equal((await store.readCatalog()).items.length, 1);
  });

  test("a read that started before a write is not kept: the next read sees the write", async () => {
    const database = fakeDatabase();
    const store = createCatalogStore(database);
    let release;
    database.state.gate = new Promise(resolve => {
      release = resolve;
    });
    const slow = store.readCatalog(); // under way, and it will hold the catalogue as it was
    await new Promise(resolve => setImmediate(resolve));
    database.state.gate = null;
    await store.createItem({
      name: "New",
      category: "regular",
      shopCategory: null,
      price: null,
      imageId: null,
      description: "",
      effects: [],
      stats: [],
      tags: []
    });
    release();
    assert.equal(
      (await slow).items.length,
      0,
      "the read that was under way holds the old catalogue"
    );
    const after = await store.readCatalog();
    assert.equal(after.items.length, 1, "but it was not kept for the next one");
  });
});
