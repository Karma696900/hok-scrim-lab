// The guard of the public push: the private bots code (repository hok-bots) never goes to the public repository.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, test } from "node:test";
import { privatePaths, publicMessage } from "./public-tree.js";

describe("public tree guard", () => {
  test("refuses the engine, the bots training and the balance runner", () => {
    const paths = [
      "src/shared/simulation/engine.js",
      "scripts/simulation/train-bots.mjs",
      "src/testing/simulation-map.js",
      "src/testing/run-balance.mjs",
      "docs/superpowers/specs/2026-10-31-bot-training.md"
    ];
    assert.deepEqual(privatePaths(paths), paths);
  });

  test("lets the site through", () => {
    assert.deepEqual(
      privatePaths([
        "src/client/features/simulation/simulation-shared.js",
        "src/server/features/simulation/simulation-routes.js",
        "README.md",
        "docs/superpowers/specs/2026-10-20-legal-pages.md"
      ]),
      []
    );
  });

  test("Windows separators and case do not slip through", () => {
    const windows = String.raw`SRC\Shared\Simulation\x.js`;
    assert.deepEqual(privatePaths([windows]), [windows]);
  });

  test("the tree of the index holds no private path", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/);
    assert.deepEqual(privatePaths(files), []);
  });

  test("a public message names no co-author", () => {
    const message = [
      "feat(x): a change",
      "",
      "Why it matters.",
      "",
      "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
      "co-authored-by: Someone <a@b.c>"
    ].join("\n");
    assert.equal(publicMessage(message), "feat(x): a change\n\nWhy it matters.\n");
  });

  test("a message without co-author is kept as it is", () => {
    assert.equal(publicMessage("fix: one line"), "fix: one line\n");
  });
});
