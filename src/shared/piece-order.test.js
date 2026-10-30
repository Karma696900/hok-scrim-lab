// The order the pieces of the catalogue are listed in: arcana by colour (red, blue, green) then by name, the Roaming
// items by type (Guardian, then Crimson Shadow) then by name. The rule is in shared/build-model.js; the server lists
// the arcana in it (the API and every page see the same list), and the pages apply it to the names as they read them.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  ARCANA_COLORS,
  ROAMING_TYPES,
  compareArcana,
  compareItems,
  itemType
} from "./build-model.js";
import { startTestServer } from "../testing/test-app.js";

const names = list => list.map(piece => piece.name);
const arcana = (name, color) => ({ name, color });
const item = name => ({ name });

describe("the order of the arcana (pure)", () => {
  test("the colours are listed red, blue, green", () => {
    assert.deepEqual(ARCANA_COLORS, ["red", "blue", "green"]);
  });

  test("by colour first, then by name, capitals and accents not counting", () => {
    const scrambled = [
      arcana("zeal", "red"),
      arcana("Vigor", "green"),
      arcana("Ardor", "red"),
      arcana("Balance", "blue"),
      arcana("calm", "green"),
      arcana("Écho", "blue"),
      arcana("Insight", "blue")
    ];
    assert.deepEqual(names([...scrambled].sort(compareArcana)), [
      "Ardor",
      "zeal",
      "Balance",
      "Écho",
      "Insight",
      "calm",
      "Vigor"
    ]);
  });

  test("a page orders the names it shows (translated), the colour still comes first", () => {
    const shown = { Ardor: "Zèle", Zeal: "Ardeur", Balance: "Équilibre", Insight: "Clarté" };
    const byShown = (a, b) => shown[a.name].localeCompare(shown[b.name], "fr");
    const list = [
      arcana("Zeal", "red"),
      arcana("Ardor", "red"),
      arcana("Insight", "blue"),
      arcana("Balance", "blue")
    ];
    assert.deepEqual(names([...list].sort((a, b) => compareArcana(a, b, byShown))), [
      "Zeal", // Ardeur
      "Ardor", // Zèle
      "Insight", // Clarté
      "Balance" // Équilibre
    ]);
  });
});

describe("the order of the items (pure)", () => {
  test("the type of an item is what comes before ' - '", () => {
    assert.equal(itemType(item("Guardian - Howl")), "Guardian");
    assert.equal(itemType(item("Crimson Shadow - Starspring")), "Crimson Shadow");
    assert.equal(itemType(item("Boots of Fortitude")), "Boots of Fortitude");
    assert.deepEqual(ROAMING_TYPES, ["Guardian", "Crimson Shadow"]);
  });

  test("Roaming: Guardian, then Crimson Shadow, by name inside a type, any other type after them", () => {
    const scrambled = [
      "Crimson Shadow - Radiance",
      "Guardian - Starspring",
      "Stormchaser - Howl",
      "Crimson Shadow - Howl",
      "Guardian - Howl",
      "Guardian - Redemption",
      "Crimson Shadow - Starspring",
      "Guardian - Radiance",
      "Crimson Shadow - Redemption"
    ].map(item);
    assert.deepEqual(names([...scrambled].sort(compareItems("roaming"))), [
      "Guardian - Howl",
      "Guardian - Radiance",
      "Guardian - Redemption",
      "Guardian - Starspring",
      "Crimson Shadow - Howl",
      "Crimson Shadow - Radiance",
      "Crimson Shadow - Redemption",
      "Crimson Shadow - Starspring",
      "Stormchaser - Howl"
    ]);
  });

  test("any other category, and the list of every item, go by name alone", () => {
    const list = ["Guardian - Howl", "Crimson Shadow - Howl", "Boots of Haste", "Axe"].map(item);
    const alphabetical = ["Axe", "Boots of Haste", "Crimson Shadow - Howl", "Guardian - Howl"];
    for (const category of ["", "physical", "magical", "defense", "movement", "jungling"]) {
      assert.deepEqual(names([...list].sort(compareItems(category))), alphabetical, category);
    }
  });

  test("a page orders the names it shows inside a type", () => {
    const shown = { "Guardian - A": "Z", "Guardian - B": "Y", "Crimson Shadow - A": "X" };
    const byShown = (a, b) => shown[a.name].localeCompare(shown[b.name]);
    const list = ["Crimson Shadow - A", "Guardian - A", "Guardian - B"].map(item);
    assert.deepEqual(names([...list].sort(compareItems("roaming", byShown))), [
      "Guardian - B", // Y
      "Guardian - A", // Z
      "Crimson Shadow - A" // X, but its type comes second
    ]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});

describe("the catalogue the server sends", { skip: app ? false : "MySQL is not reachable" }, () => {
  test("the arcana come by colour then by name, in the API of the pages and in the public one", async () => {
    const admin = await app.signIn("Keeper", { admin: true });
    for (const [name, color] of [
      ["Vigor", "green"],
      ["Zeal", "red"],
      ["Balance", "blue"],
      ["calm", "green"],
      ["Ardor", "red"],
      ["Insight", "blue"]
    ]) {
      assert.equal(
        (await admin.browser.post("/api/admin/catalog/arcana", { name, color, stats: [] })).status,
        200
      );
    }
    const expected = ["Ardor", "Zeal", "Balance", "Insight", "calm", "Vigor"];
    const { body } = await app.browser().get("/api/catalog");
    assert.deepEqual(names(body.arcana), expected);
    assert.deepEqual(
      names(body.arcana),
      names([...body.arcana].sort(compareArcana)),
      "what the server lists is what the shared rule says"
    );
    const { body: family } = await app.browser().get("/api/catalog/arcana");
    assert.deepEqual(names(family.arcana), expected, "one family, the same order");
  });
});
