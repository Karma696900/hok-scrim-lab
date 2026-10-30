// Compares a string with the file saved next to a test, so that a refactor of the code that draws a page can be proven
// to draw exactly the same HTML. After a change of the markup that is wanted:
//   UPDATE_SNAPSHOTS=1 node --test <the test file>      and read the diff of the saved files before keeping it.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** `testUrl` is `import.meta.url` of the test; the file is `snapshots/<name>.html` in the folder of the test. */
export function expectSnapshot(testUrl, name, actual) {
  const file = join(dirname(fileURLToPath(testUrl)), "snapshots", `${name}.html`);
  // one tag per line so that a change shows up as a readable diff
  const text = `${String(actual).replaceAll(/></g, ">\n<")}\n`;
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    if (!process.env.UPDATE_SNAPSHOTS) {
      assert.fail(
        `the snapshot ${name} did not exist: it was written, read it and run the test again`
      );
    }
    return;
  }
  assert.equal(
    text,
    readFileSync(file, "utf8").replaceAll("\r\n", "\n"),
    `the HTML of ${name} changed`
  );
}
