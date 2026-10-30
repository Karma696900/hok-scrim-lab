// Rewrites src/architecture-limits.json from the code as it is now: a file or a function that is over the limit is listed
// at its current size, one that is back under the limit is dropped. It never lets an exception go up without --allow-growth.
//   node scripts/dev/architecture-limits.mjs            lower the exceptions to what the code measures now
//   node scripts/dev/architecture-limits.mjs --check    only say what would change
import { readFileSync, writeFileSync } from "node:fs";
import { measure, ROOT } from "../../src/testing/code-size.js";

const FILE = `${ROOT}src/architecture-limits.json`;
const previous = JSON.parse(readFileSync(FILE, "utf8"));
const { maxFileLines, maxFunctionLines, maxCssLines } = previous;
const growth = process.argv.includes("--allow-growth");
const checkOnly = process.argv.includes("--check");

const exceptions = {};
const problems = [];
const record = (path, key, value, name) => {
  const entry = (exceptions[path] ??= {});
  const was = name
    ? previous.exceptions[path]?.functions?.[name]
    : previous.exceptions[path]?.[key];
  if (was !== undefined && value > was && !growth) {
    problems.push(`${path}${name ? ` ${name}` : ""}: ${was} → ${value} lines (grew)`);
  }
  if (name) {
    (entry.functions ??= {})[name] = value;
  } else {
    entry[key] = value;
  }
};

for (const [path, { lines, functions }] of Object.entries(measure("js"))) {
  if (lines > maxFileLines) {
    record(path, "lines", lines);
  }
  for (const [name, size] of Object.entries(functions)) {
    if (size > maxFunctionLines) {
      record(path, "functions", size, name);
    }
  }
}
for (const [path, { lines }] of Object.entries(measure("css"))) {
  if (lines > maxCssLines) {
    record(path, "lines", lines);
  }
}

// the reasons are written by hand (see the test); a reason follows its case, and goes with it
const reasons = Object.fromEntries(
  Object.entries(previous.reasons ?? {}).filter(([path]) => path in exceptions)
);
const next = { maxFileLines, maxFunctionLines, maxCssLines, exceptions, reasons };
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(
    JSON.stringify(next) === JSON.stringify(previous) ? "limits up to date" : "limits would change"
  );
} else {
  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`limits written: ${Object.keys(exceptions).length} files with an exception`);
}
