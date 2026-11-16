// The words of the public tier list that search engines read: the season in the heading, the best heroes of each lane
// in a sentence, and the questions players type ("best hero honor of kings", "best jungle hero").
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { onView as markup } from "./tier-list-public-markup.js";
import { bindTo } from "../../../shared/bind-to.js";
import { escapeHtml } from "../../lib/escape.js";

const NAMES = { 1: "Dharma", 2: "Devara", 3: "Fuzi", 4: "Lam", 5: "Agudo" };
const lane = (name, slug, heroes) => ({
  lane: name,
  slug,
  tiers: [
    { label: "SS", heroes: heroes.slice(0, 1) },
    { label: "S", heroes: heroes.slice(1) },
    { label: "D", heroes: [] }
  ],
  unranked: []
});
const DATA = {
  season: 15,
  updatedAt: "2026-11-10",
  totalGames: 120,
  minGames: 10,
  lanes: [
    lane("Clash Lane", "clash", [
      { heroId: "1", source: "tournaments", games: 29, winRate: 0.62 },
      { heroId: "2", source: "tournaments", games: 20, winRate: 0.55 },
      { heroId: "3", source: "editors" }
    ]),
    lane("Jungle", "jungle", [{ heroId: "4", source: "editors" }])
  ]
};
const view = (slug = "") => {
  const it = {
    esc: escapeHtml,
    slug,
    data: DATA,
    nameOf: id => NAMES[id] ?? id,
    heroOf: () => null
  };
  bindTo(it, markup);
  return it;
};
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the public tier list says in words what it shows", () => {
  test("its heading names the season of the game", () => {
    const page = view();
    page.root = { innerHTML: "" };
    page.paint();
    assert.match(page.root.innerHTML, /<h1>Honor of Kings tier list — Season 15<\/h1>/);
    const jungle = view("jungle");
    jungle.root = { innerHTML: "" };
    jungle.paint();
    assert.match(jungle.root.innerHTML, /<h1>Honor of Kings Jungle tier list — Season 15<\/h1>/);
  });

  test("each lane names its best heroes in order, and the record of the first", () => {
    const words = text(view().laneSummary(DATA.lanes[0]));
    assert.match(words, /Best Clash Lane heroes right now: Dharma, Devara(,)? and Fuzi\./);
    assert.match(words, /Dharma has won 62\s?% of 29 tournament games in the last three months\./);
  });

  test("a lane ranked by the editors alone says no tournament record", () => {
    const words = text(view().laneSummary(DATA.lanes[1]));
    assert.match(words, /Best Jungle heroes right now: Lam\./);
    assert.doesNotMatch(words, /has won/);
  });

  test("the questions answer the best hero of each lane, the version of the game and when it changes", () => {
    const words = text(view().questions());
    assert.match(words, /What is the best hero in Honor of Kings right now\?/);
    assert.match(words, /Clash Lane: Dharma/);
    assert.match(words, /Jungle: Lam/);
    assert.match(words, /Is this tier list for Honor of Kings Global\?/);
    assert.match(words, /How often does the tier list change\?/);
    assert.match(words, /November 10, 2026/);
  });

  test("on the page of a lane, the first question is about that lane", () => {
    const words = text(view("jungle").questions());
    assert.match(words, /Who is the best Jungle hero in Honor of Kings right now\?/);
    assert.match(words, /Lam/);
    assert.doesNotMatch(words, /Dharma/);
  });
});
