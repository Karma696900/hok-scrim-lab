#!/usr/bin/env node
// Who can reach which route: calls EVERY route declared under server/features as a visitor, an ordinary
// person, a contributor and an administrator, on a throw-away database, and prints the access class of each
// with what each actor was answered. Used to review the table that src/server/route-access.test.js freezes.
//
//   node scripts/dev/route-matrix.mjs            by class
//   node scripts/dev/route-matrix.mjs --table    the lines to paste in the test
import { accessMatrix } from "../../src/testing/route-access.js";
import { startTestServer } from "../../src/testing/test-app.js";

const app = await startTestServer();
if (!app) {
  console.error("MySQL is not reachable (docker compose up -d mysql)");
  process.exit(2);
}
try {
  const rows = await accessMatrix(app);
  if (process.argv.includes("--table")) {
    for (const row of rows) {
      console.log(
        `  ${JSON.stringify(`${row.method} ${row.path}`)}: ${JSON.stringify(row.access)},`
      );
    }
  } else {
    const classes = Map.groupBy(rows, row => row.access);
    for (const [access, list] of [...classes].sort()) {
      console.log(`\n== ${access} (${list.length})`);
      for (const row of list) {
        const { visitor, person, contributor, admin } = row.statuses;
        console.log(
          `   ${`${row.method} ${row.path}`.padEnd(52)} visitor ${visitor} · person ${person} · contributor ${contributor} · admin ${admin}`
        );
      }
    }
  }
} finally {
  await app.close();
}
