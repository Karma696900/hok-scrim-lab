import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lastChange, sitemapDates } from "./sitemap-dates.js";

describe("the dates of the sitemap (<lastmod>): only a real change of the page, never the day it was read", () => {
  test("the last change is the latest day already reached", () => {
    assert.equal(
      lastChange(["2026-08-27T01:00:00Z", "2026-10-02", "2026-12-20"], "2026-11-16"),
      "2026-10-02"
    );
    assert.equal(lastChange([], "2026-11-16"), null);
    assert.equal(lastChange(["soon", null, undefined], "2026-11-16"), null);
  });

  test("the tier list pages carry the day of the tier list; a hero page its latest balance change", () => {
    const heroes = [
      { id: "533", name: "Agudo" },
      { id: "112", name: "Luban No.7" }
    ];
    const dates = sitemapDates({
      tierListDay: "2026-11-14T08:00:00Z",
      changes: { 533: ["2026-08-27", "2026-10-02"], 112: [] },
      heroes,
      today: "2026-11-16"
    });
    assert.equal(dates.get("/tier-list"), "2026-11-14");
    assert.equal(dates.get("/tier-list/roam"), "2026-11-14");
    assert.equal(dates.get("/heroes/agudo"), "2026-10-02");
    assert.equal(dates.has("/heroes/luban-no-7"), false, "no change known: no date");
    assert.equal(dates.has("/"), false);
  });

  test("no tier list date: no date on its pages", () => {
    assert.equal(
      sitemapDates({ tierListDay: null, changes: {}, heroes: [], today: "2026-11-16" }).size,
      0
    );
  });
});
