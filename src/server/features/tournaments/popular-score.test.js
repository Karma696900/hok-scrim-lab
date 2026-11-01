// The score shared by the popular pages and the public tier list: recent games first, a game played
// before the last balance change of a hero counts less, and a win rate pulled toward the average.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bayesian, heroWeight, lastChanges, recencyWeight } from "./popular-score.js";

describe("popular score", () => {
  test("a game of today weighs 1, half after the half-life, a quarter after two", () => {
    assert.equal(recencyWeight("2026-10-31", "2026-10-31"), 1);
    assert.equal(recencyWeight("2026-10-01", "2026-10-31"), 0.5);
    assert.equal(recencyWeight("2026-09-01", "2026-10-31"), 0.25);
    assert.equal(recencyWeight("2026-11-05", "2026-10-31"), 1);
  });

  test("a game before the hero's last balance change counts half again", () => {
    assert.equal(heroWeight("2026-10-31", "2026-10-31", "2026-10-21"), 1);
    assert.equal(heroWeight("2026-10-20", "2026-10-20", "2026-10-21"), 0.5);
    assert.equal(heroWeight("2026-10-20", "2026-10-20", null), 1);
  });

  test("the win rate is pulled toward the average, less as games add up", () => {
    assert.equal(bayesian(0, 0, 0.5), 0.5);
    assert.equal(bayesian(10, 10, 0.5), 0.75);
    assert.ok(bayesian(1, 1, 0.5) < bayesian(18, 25, 0.5));
    assert.ok(bayesian(20, 20, 0.5) > bayesian(10, 10, 0.5));
  });

  test("the last change of a hero is its latest published adjustment that is not in the future", () => {
    const details = {
      105: {
        adjustments: [
          { publishedAt: "2026-09-02T02:00:00Z" },
          { publishedAt: "2026-10-21T02:00:00Z" },
          { publishedAt: "2027-01-01T02:00:00Z" }
        ]
      },
      106: { adjustments: [] },
      107: {}
    };
    assert.deepEqual(lastChanges(details, "2026-10-31"), { 105: "2026-10-21" });
  });
});
