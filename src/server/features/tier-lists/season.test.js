import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { latestSeason } from "./season.js";

describe("the season of the game, read from the balance changes of the heroes", () => {
  test("is the highest season already published", () => {
    const changes = [
      { seasonName: "S13", publishedAt: "2025-12-16T01:00:00Z" },
      { seasonName: "S15", publishedAt: "2026-08-27T01:00:00Z" },
      { seasonName: "S12", publishedAt: "2025-09-24T01:00:00Z" }
    ];
    assert.equal(latestSeason(changes, "2026-11-16"), 15);
  });

  test("a season announced for later does not count yet", () => {
    const changes = [
      { seasonName: "S15", publishedAt: "2026-08-27T01:00:00Z" },
      { seasonName: "S16", publishedAt: "2026-12-20T01:00:00Z" }
    ];
    assert.equal(latestSeason(changes, "2026-11-16"), 15);
  });

  test("a name that is not a season, or nothing, gives no season", () => {
    assert.equal(
      latestSeason([{ seasonName: "Beta", publishedAt: "2026-01-01" }], "2026-11-16"),
      null
    );
    assert.equal(latestSeason([], "2026-11-16"), null);
    assert.equal(latestSeason([{ seasonName: "S9", publishedAt: null }], "2026-11-16"), null);
  });
});
