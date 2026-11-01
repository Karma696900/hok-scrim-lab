// deploy/install-auto-update.sh puts the update line in the crontab, also on a server that has no crontab yet.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, describe, test } from "node:test";

const fake = mkdtempSync(join(tmpdir(), "fake-crontab-"));
const store = join(fake, "crontab.txt");
writeFileSync(
  join(fake, "crontab"),
  [
    "#!/bin/sh",
    'if [ "$1" = "-l" ]; then [ -f "$FAKE_CRONTAB" ] || { echo "no crontab" >&2; exit 1; }; cat "$FAKE_CRONTAB"; exit 0; fi',
    '[ "$1" = "-" ] && cat > "$FAKE_CRONTAB.new" && mv "$FAKE_CRONTAB.new" "$FAKE_CRONTAB"'
  ].join("\n"),
  { mode: 0o755 }
);
const install = () =>
  execFileSync("sh", ["deploy/install-auto-update.sh"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${fake}${delimiter}${process.env.PATH}`, FAKE_CRONTAB: store }
  });

after(() => rmSync(fake, { recursive: true, force: true }));

describe("install-auto-update.sh", () => {
  test("a server without a crontab gets the update line", () => {
    rmSync(store, { force: true });
    install();
    assert.match(
      readFileSync(store, "utf8"),
      /\*\/2 \* \* \* \* sh .*auto-update\.sh >> .*auto-update\.log 2>&1/
    );
  });

  test("the lines already there are kept, and a second run adds nothing", () => {
    writeFileSync(store, "30 3 * * * sh backup.sh\n");
    install();
    assert.match(install(), /already on/);
    const lines = readFileSync(store, "utf8").trim().split("\n");
    assert.equal(lines[0], "30 3 * * * sh backup.sh");
    assert.equal(lines.filter(line => line.includes("auto-update.sh")).length, 1);
  });
});
