import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { VIEW_MODULES, DATA_CALLS, needsOf } from "./view-registry.js";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "client");

function sources(folder) {
  return readdirSync(folder).flatMap(name => {
    const file = path.join(folder, name);
    return statSync(file).isDirectory() ? sources(file) : file.endsWith(".js") ? [file] : [];
  });
}

describe("what a page needs loaded (shared/view-registry.js)", () => {
  test("every page needs the roster; the series and the tier lists only the pages that read them", () => {
    assert.deepEqual(needsOf("settings"), ["heroes"]);
    assert.deepEqual(needsOf("training"), ["heroes"]);
    assert.deepEqual(needsOf("home"), ["heroes"]);
    assert.deepEqual(needsOf("scrims"), ["heroes", "series"]);
    assert.deepEqual(needsOf("live"), ["heroes", "series"]);
    assert.deepEqual(needsOf("tier-lists"), ["heroes", "tierLists"]);
    for (const name of ["heroes", "series", "tierLists"]) {
      assert.match(DATA_CALLS[name], /^\/api\//);
    }
  });

  test("the files that read the series or the tier lists are the ones the table knows about", () => {
    // A file that starts reading `state.series` or `state.tierLists` must be reachable only through a page that
    // loads them: add its page to shared/view-registry.js, then to this list.
    const READS_SERIES = [
      "app/roster-data.js",
      "app/router.js",
      "features/community/player-pieces-page.js",
      "features/history/history-actions.js",
      "features/scrims/scrim-actions.js",
      "features/scrims/board.js",
      "features/scrims/scrim-draft.js",
      "features/scrims/import.js",
      "features/scrims/scrim-list.js",
      "main.js"
    ].sort();
    const READS_TIER_LISTS = [
      "app/roster-data.js",
      "features/tier-lists/tier-list-markup.js",
      "features/tier-lists/tier-list-shared.js",
      "features/tier-lists/tier-list-view.js",
      "main.js"
    ];
    const found = { series: [], tierLists: [] };
    for (const file of sources(CLIENT)) {
      const text = readFileSync(file, "utf8");
      const relative = path.relative(CLIENT, file).replaceAll("\\", "/");
      if (/state\.series\b/.test(text)) {
        found.series.push(relative);
      }
      if (/state\.tierLists\b/.test(text)) {
        found.tierLists.push(relative);
      }
    }
    assert.deepEqual(found.series.sort(), READS_SERIES, "state.series");
    assert.deepEqual(found.tierLists.sort(), READS_TIER_LISTS, "state.tierLists");
  });

  test("a page that is downloaded when it is opened is a view that exists", () => {
    for (const view of Object.keys(VIEW_MODULES)) {
      assert.ok(needsOf(view).includes("heroes"), view);
    }
  });
});
