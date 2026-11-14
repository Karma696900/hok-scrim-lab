import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { state } from "../../app/app-state.js";
import { currentTierList, openTierList, tierUi } from "./tier-list-shared.js";

const list = (id, lane) => ({ id, ...(lane ? { lane } : {}), tiers: [], unranked: [] });

describe("opening a tier list from a link", () => {
  beforeEach(() => {
    state.tierLists = [list("first-all"), list("second-mid", "Mid Lane"), list("third-all")];
    state.tierLaneFilter = "all";
    state.activeTierId = "first-all";
    Object.assign(tierUi, { picked: null, query: "", lane: "all", chosen: false });
  });

  test("a second link to a list of another lane shows that list, not the first one", () => {
    openTierList("second-mid");
    assert.equal(currentTierList().id, "second-mid");
    assert.equal(state.tierLaneFilter, "Mid Lane");
  });

  test("a link to an All Roles list brings the page back to All Roles", () => {
    state.tierLaneFilter = "Mid Lane";
    state.activeTierId = "second-mid";
    openTierList("third-all");
    assert.equal(currentTierList().id, "third-all");
    assert.equal(state.tierLaneFilter, "all");
  });

  test("a hero picked on the previous list is let go", () => {
    tierUi.picked = "hero-1";
    openTierList("second-mid");
    assert.equal(tierUi.picked, null);
  });
});
