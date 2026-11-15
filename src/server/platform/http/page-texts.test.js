// What a search engine reads on the pages that used to share one description: each item, each arcana and each
// lane of the public tier list says what is on it (owner, 2026-11-15: "premier partout sur hok").
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describePiece } from "./page-handler-pieces.js";
import { describeTierList } from "./page-handler-tier-list.js";
import { describeHero } from "./page-handler-hero.js";
import { localized, say } from "./page-handler-parts.js";
import { matchRoute } from "../../../shared/routes.js";

const CATALOG = {
  stats: [
    { id: 1, name: "Max Health", unit: "flat" },
    { id: 3, name: "Physical Attack", unit: "flat" },
    { id: 15, name: "Cooldown Reduction", unit: "percent" },
    { id: 16, name: "Attack Range", unit: "choice" }
  ],
  items: [
    {
      id: 5,
      name: "Axe of Torment",
      price: 2090,
      description: "Great against squishy targets",
      components: [93],
      stats: [
        { statId: 3, value: 80 },
        { statId: 15, value: 10 },
        { statId: 16, value: 1 }
      ]
    },
    {
      id: 93,
      name: "Iron Sword",
      price: 250,
      description: "",
      components: [],
      stats: [{ statId: 3, value: 20 }]
    },
    { id: 7, name: "Silent Boots", price: 700, description: "", components: [], stats: [] },
    {
      id: 8,
      name: "Amble - Winter",
      price: 3190,
      description:
        "Creates a frost field around the hero for 2 seconds after using a skill, slowing every enemy inside it by 30 percent and reducing their attack speed.",
      components: [],
      stats: [{ statId: 1, value: 900 }]
    }
  ],
  arcana: [
    {
      id: 18,
      name: "Nightmare",
      color: "red",
      description: "",
      stats: [
        { statId: 3, value: 4.2 },
        { statId: 15, value: 2.4 }
      ]
    },
    { id: 19, name: "Hunt", color: "green", description: "", stats: [{ statId: 1, value: 75 }] }
  ],
  spells: []
};
const ctx = { store: { readCatalog: async () => CATALOG } };
const piece = address => describePiece(ctx, matchRoute(address), "en", localized);

describe("the description of an item page", () => {
  test("names the item, its price, its stats and what it is built from", async () => {
    const { description } = await piece("/items/5");
    assert.match(description, /^Axe of Torment/);
    assert.match(description, /2090 gold/);
    assert.match(description, /\+80 Physical Attack/);
    assert.match(description, /\+10% Cooldown Reduction/);
    assert.match(description, /Iron Sword/);
    assert.match(description, /Great against squishy targets/);
    assert.doesNotMatch(description, /Attack Range/, "a choice is not a number to add");
  });

  test("an item nobody wrote a description for still has its own one", async () => {
    const [sword, boots] = await Promise.all([piece("/items/93"), piece("/items/7")]);
    assert.match(sword.description, /Iron Sword.*250 gold.*\+20 Physical Attack/);
    assert.match(boots.description, /Silent Boots.*700 gold/);
    assert.notEqual(sword.description, boots.description);
  });

  test("a long passive is kept, cut at a word, rather than left out", async () => {
    const { description } = await piece("/items/8");
    assert.match(
      description,
      /^Amble - Winter, Honor of Kings item for 3190 gold\. Creates a frost field/
    );
    assert.match(description, /\w…$/);
    assert.ok(description.length <= 160);
  });

  test("a search result shows it whole", async () => {
    for (const address of ["/items/5", "/items/93", "/arcana/18"]) {
      assert.ok((await piece(address)).description.length <= 160, address);
    }
  });
});

describe("the description of an arcana page", () => {
  test("names the arcana, its colour and its stats", async () => {
    const { description } = await piece("/arcana/18");
    assert.match(description, /Nightmare/);
    assert.match(description, /red arcana/i);
    assert.match(description, /\+4\.2 Physical Attack, \+2\.4% Cooldown Reduction/);
  });

  test("two arcana never share it", async () => {
    const [red, green] = await Promise.all([piece("/arcana/18"), piece("/arcana/19")]);
    assert.notEqual(red.description, green.description);
    assert.match(green.description, /green arcana/i);
  });
});

const HEROES = [
  { id: 1, name: "Agudo", lanes: ["Mid Lane"] },
  { id: 2, name: "Angela", lanes: ["Mid Lane"] },
  { id: 3, name: "Kongming", lanes: ["Mid Lane"] },
  { id: 4, name: "Lam", lanes: ["Jungle"] }
];
const LIST = {
  updatedAt: "2026-11-10",
  lanes: [
    {
      lane: "Mid Lane",
      tiers: [
        { label: "SS", heroes: [{ heroId: 1 }, { heroId: 2 }] },
        { label: "S", heroes: [{ heroId: 3 }] }
      ]
    },
    { lane: "Jungle", tiers: [{ label: "SS", heroes: [{ heroId: 4 }] }] }
  ]
};
const tierStore = {
  competitiveSummary: async () => ({ first: "2026-08-01", last: "2026-11-10" }),
  listOfficialTierLists: async () => new Map(),
  readHeroes: async () => HEROES,
  rememberCompetitive: async () => LIST
};
const tierPage = address =>
  describeTierList({ store: tierStore }, matchRoute(address), "en", say, localized);

describe("the description of the public tier list", () => {
  test("a lane names its best heroes", async () => {
    const { description } = await tierPage("/tier-list/mid");
    assert.match(description, /Mid Lane/);
    assert.match(description, /Agudo, Angela and Kongming/);
    assert.doesNotMatch(description, /Lam/);
  });

  test("each lane and the whole list have their own one", async () => {
    const all = await tierPage("/tier-list");
    const jungle = await tierPage("/tier-list/jungle");
    const mid = await tierPage("/tier-list/mid");
    assert.equal(new Set([all.description, jungle.description, mid.description]).size, 3);
    assert.match(jungle.description, /Lam/);
  });
});

describe("the title of a Flowborn page", () => {
  test("keeps the form, so that the five forms have five titles", async () => {
    const store = {
      listBuildSets: async () => [],
      competitiveGames: async () => [],
      readHeroes: async () => []
    };
    const hero = { id: 581, name: "Flowborn (Tank)", lanes: ["Clash Lane"], roles: ["Tank"] };
    const info = await describeHero({ store, bannerSrcset: async () => "" }, hero, "en", say);
    assert.match(info.title, /^Flowborn \(Tank\)/);
  });
});
