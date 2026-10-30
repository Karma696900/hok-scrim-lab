#!/usr/bin/env node
// One-shot: attaches the series and tier lists created before ownership existed
// ("orphans") to one Google account. Orphans are invisible to everybody until this runs.
//
//   node --env-file=.env scripts/accounts/claim-legacy.js --email you@gmail.com            (dry run: only counts)
//   node --env-file=.env scripts/accounts/claim-legacy.js --email you@gmail.com --apply    (does it)
//
// The account must have signed in once. Nothing is deleted or rewritten; only owner_user_id is set.
import { assertRuntimeConfig, loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = argument("email");
const apply = process.argv.includes("--apply");
if (!email || email.startsWith("--")) {
  console.error(
    "Usage: node --env-file=.env scripts/accounts/claim-legacy.js --email you@gmail.com [--apply]"
  );
  process.exit(2);
}

const config = loadConfig();
assertRuntimeConfig(config);
const store = createStore(config.db);
try {
  await store.initializeDatabase();
  const users = await store.getUserByEmail(email);
  if (users.length === 0) {
    console.error(
      `No Google account with the email ${email}. Open the app, click "Sign in", then run this script again.`
    );
    process.exitCode = 1;
  } else if (users.length > 1) {
    console.error(`${users.length} accounts share the email ${email}; refusing to guess.`);
    process.exitCode = 1;
  } else {
    const orphans = await store.countOrphans();
    console.log(`Orphans: ${orphans.series} series, ${orphans.tierLists} tier lists.`);
    if (!orphans.series && !orphans.tierLists) {
      console.log("Nothing to claim.");
    } else if (!apply) {
      console.log(
        `Dry run: re-run with --apply to attach them to ${users[0].name} <${users[0].email}>.`
      );
    } else {
      const claimed = await store.claimOrphans(users[0].id);
      console.log(
        `Done: ${claimed.series} series and ${claimed.tierLists} tier lists now belong to ${users[0].email}.`
      );
    }
  }
} finally {
  await store.closeDatabase();
}
