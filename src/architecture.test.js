// A ratchet on the size of the code. A file or a function over the limit must be listed in architecture-limits.json at
// exactly its size: it cannot grow, and when it shrinks the number is lowered (node scripts/dev/architecture-limits.mjs),
// so that a big file never grows back to its old size. When one is back under the limit its entry is removed.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { measure, ROOT } from "./testing/code-size.js";

const limits = JSON.parse(readFileSync(join(ROOT, "src/architecture-limits.json"), "utf8"));
const FIX = "node scripts/dev/architecture-limits.mjs";

/** What is wrong with a measured size against its limit and its recorded exception; null when all is well. */
function verdict(label, size, limit, recorded) {
  if (size <= limit) {
    return recorded === undefined
      ? null
      : `${label}: ${size} lines, back under ${limit}: remove its exception`;
  }
  if (recorded === undefined) {
    return `${label}: ${size} lines, over the limit of ${limit}: split it`;
  }
  if (size > recorded) {
    return `${label}: grew from ${recorded} to ${size} lines: split it instead`;
  }
  return size < recorded
    ? `${label}: now ${size} lines, lower its exception from ${recorded} (${FIX})`
    : null;
}

const report = problems =>
  assert.deepEqual(problems.filter(Boolean), [], `\n${FIX} lowers what can be lowered`);

describe("size of the code", () => {
  const js = measure("js");
  const css = measure("css");

  test(`no JavaScript file is over ${limits.maxFileLines} lines, except those listed`, () => {
    report(
      Object.entries(js).map(([path, { lines }]) =>
        verdict(path, lines, limits.maxFileLines, limits.exceptions[path]?.lines)
      )
    );
  });

  test(`no function is over ${limits.maxFunctionLines} lines, except those listed`, () => {
    const problems = [];
    for (const [path, { functions }] of Object.entries(js)) {
      for (const [name, size] of Object.entries(functions)) {
        problems.push(
          verdict(
            `${path} ${name}`,
            size,
            limits.maxFunctionLines,
            limits.exceptions[path]?.functions?.[name]
          )
        );
      }
    }
    report(problems);
  });

  test(`no stylesheet is over ${limits.maxCssLines} lines, except those listed`, () => {
    report(
      Object.entries(css).map(([path, { lines }]) =>
        verdict(path, lines, limits.maxCssLines, limits.exceptions[path]?.lines)
      )
    );
  });

  test("every listed exception still points at a file and a function that exist", () => {
    const stale = [];
    for (const [path, exception] of Object.entries(limits.exceptions)) {
      const measured = js[path] || css[path];
      if (!measured) {
        stale.push(`${path}: the file no longer exists`);
        continue;
      }
      for (const name of Object.keys(exception.functions || {})) {
        if (!(name in (measured.functions || {}))) {
          stale.push(`${path} ${name}: the function no longer exists`);
        }
      }
    }
    report(stale);
  });
});

describe("what a person who opens the project can rely on", () => {
  test("every case that is still over a limit has its reason written in architecture-limits.json", () => {
    const withoutReason = Object.keys(limits.exceptions).filter(
      path => !limits.reasons?.[path]?.trim()
    );
    report(withoutReason.map(path => `${path}: write why it stays this size in "reasons"`));
    const orphans = Object.keys(limits.reasons ?? {}).filter(path => !limits.exceptions[path]);
    report(orphans.map(path => `${path}: a reason for a case that is no longer one: remove it`));
  });

  test("every feature folder has a README that says what is in it", () => {
    const missing = [];
    for (const side of ["client", "server"]) {
      const root = join(ROOT, "src", side, "features");
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && !existsSync(join(root, entry.name, "README.md"))) {
          missing.push(`src/${side}/features/${entry.name}/README.md`);
        }
      }
    }
    report(missing);
  });
});
