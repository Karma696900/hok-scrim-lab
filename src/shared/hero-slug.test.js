import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { heroIdOf, heroPath, slugOfName } from "./hero-slug.js";

const HEROES = [
  { id: "533", name: "Agudo" },
  { id: "519", name: "Ao'yin" },
  { id: "182", name: "Gan & Mo" },
  { id: "112", name: "Luban No.7" },
  { id: "581", name: "Flowborn (Tank)" },
  { id: "583", name: "Flowborn (Assassin)" },
  { id: "170", name: "Bai Qi" }
];

describe('the address of a hero carries its name (players search "agudo build")', () => {
  test("a name becomes lowercase words joined by dashes, without accents or signs", () => {
    assert.equal(slugOfName("Agudo"), "agudo");
    assert.equal(slugOfName("Ao'yin"), "aoyin");
    assert.equal(slugOfName("Gan & Mo"), "gan-mo");
    assert.equal(slugOfName("Luban No.7"), "luban-no-7");
    assert.equal(slugOfName("Flowborn (Tank)"), "flowborn-tank");
    assert.equal(slugOfName("Hé Lǚ  Bù"), "he-lu-bu");
  });

  test("each hero has its own address; a hero not in the roster keeps its number", () => {
    assert.equal(heroPath(HEROES, "533"), "/heroes/agudo");
    assert.equal(heroPath(HEROES, "581"), "/heroes/flowborn-tank");
    assert.equal(heroPath(HEROES, "583"), "/heroes/flowborn-assassin");
    assert.equal(heroPath(HEROES, "999"), "/heroes/999");
  });

  test("two heroes with the same name get their number added, so that no address is shared", () => {
    const twins = [...HEROES, { id: "900", name: "Agudo" }];
    assert.equal(heroPath(twins, "533"), "/heroes/agudo-533");
    assert.equal(heroPath(twins, "900"), "/heroes/agudo-900");
  });

  test("the address is the same in every language: it comes from the English name", () => {
    const japanese = [
      { id: "533", name: "アグド", englishName: "Agudo" },
      { id: "170", name: "白起", englishName: "Bai Qi" }
    ];
    assert.equal(heroPath(japanese, "533"), "/heroes/agudo");
    assert.equal(heroIdOf(japanese, "bai-qi"), "170");
  });

  test("a name made of digits only cannot be taken for the number of another hero", () => {
    assert.equal(heroPath([{ id: "7", name: "1999" }], "7"), "/heroes/hero-1999");
  });

  test("the address finds the hero back, by its name or by its old number", () => {
    assert.equal(heroIdOf(HEROES, "agudo"), "533");
    assert.equal(heroIdOf(HEROES, "luban-no-7"), "112");
    assert.equal(heroIdOf(HEROES, "533"), "533");
    assert.equal(heroIdOf(HEROES, "nobody"), null);
  });
});
