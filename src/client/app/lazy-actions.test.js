// The buttons of the pages that are downloaded on demand are listened for from the start (lazy-actions.js): the table must
// name exactly what those pages register, or a button would do nothing (a name missing) or load a page that never answers it
// (a name too many). It also keeps one feature from taking a name of another: the last registration wins, and the order is
// the order the pages happen to load in.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { LAZY_ACTIONS } from "./lazy-actions.js";
import { WEB } from "../../server/platform/http/web-root.js";

const client = file => readFileSync(path.join(WEB.root, "src", "client", file), "utf8");

const registered = files =>
  files.flatMap(file =>
    [...client(file).matchAll(/onAction\(\s*(\[[^\]]*\]|"[^"]+")/g)].flatMap(match =>
      [...match[1].matchAll(/"([^"]+)"/g)].map(name => name[1])
    )
  );

describe("lazy actions", () => {
  for (const [feature, { files, names }] of Object.entries(LAZY_ACTIONS)) {
    test(`${feature}: the table names the buttons its files register, no more, no less`, () => {
      const found = registered(files);
      assert.ok(found.length > 0, "the files were read");
      assert.deepEqual([...names].sort(), [...found].sort());
    });
  }

  test("no button is claimed by two features", () => {
    const seen = new Map();
    for (const [feature, { names }] of Object.entries(LAZY_ACTIONS)) {
      for (const name of names) {
        assert.equal(
          seen.get(name),
          undefined,
          `${name} is claimed by ${seen.get(name)} and ${feature}`
        );
        seen.set(name, feature);
      }
    }
  });

  test("no button of the pages that are always there takes the name of a lazy one", () => {
    const lazy = new Set(Object.values(LAZY_ACTIONS).flatMap(feature => feature.names));
    const always = [
      "app/event-actions.js",
      "features/auth/auth-actions.js",
      "features/sharing/sharing-actions.js"
    ];
    assert.deepEqual(
      registered(always).filter(name => lazy.has(name)),
      []
    );
  });
});
