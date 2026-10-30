// The name of the file that takes an import back (scripts/catalog/manifest-name.mjs): two runs that end
// in the same second must not write the same file, or the second one (which created nothing) would
// replace the manifest of the first and the import could no longer be undone.
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { manifestFile } from "./manifest-name.mjs";

describe("the manifest of an import", () => {
  test("it is in backups/, named after the import and the moment, to the millisecond", () => {
    const file = manifestFile("catalog-import", new Date("2026-10-24T14:25:31.120Z"));
    assert.equal(file, path.join("backups", "catalog-import-20261024-142531.120.json"));
  });

  test("two runs in the same second get two different files", () => {
    const first = manifestFile("catalog-import", new Date("2026-10-24T14:25:31.120Z"));
    const second = manifestFile("catalog-import", new Date("2026-10-24T14:25:31.870Z"));
    assert.notEqual(first, second);
  });

  test("the names sort in the order the runs were made", () => {
    const moments = [
      "2026-10-24T14:25:31.870Z",
      "2026-10-24T14:25:31.120Z",
      "2026-10-24T14:25:32.005Z",
      "2026-10-25T00:00:00.000Z"
    ];
    const names = moments.map(moment => manifestFile("catalog-data", new Date(moment)));
    const sorted = [...moments]
      .sort()
      .map(moment => manifestFile("catalog-data", new Date(moment)));
    assert.deepEqual([...names].sort(), sorted);
  });
});
