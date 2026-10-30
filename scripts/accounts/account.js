#!/usr/bin/env node
// Server-side account administration (run on the server; it talks to the database directly).
//
//   node --env-file=.env scripts/accounts/account.js create --email admin@example.com --name "Admin"   (password read from stdin or $HOK_PASSWORD)
//   node --env-file=.env scripts/accounts/account.js reset-mfa --email someone@example.com               (lost phone AND recovery codes)
//   node --env-file=.env scripts/accounts/account.js unlock --email someone@example.com
//   node --env-file=.env scripts/accounts/account.js sign-out --email someone@example.com
//
// `create` makes a VERIFIED local account (you vouch for the address): the only way a password
// account can be an
// administrator (ADMIN_EMAILS). The person still enrols their authenticator at first sign-in.
// `reset-mfa` removes the authenticator and recovery codes and closes every session: the next
// sign-in (password) goes
// through enrolment again. It does NOT reveal or change the password.
import { assertRuntimeConfig, loadConfig } from "../../src/server/config.js";
import { createStore } from "../../src/server/platform/database/store.js";
import { normalizeEmail } from "../../src/server/features/auth/auth-service.js";
import { hashPassword, passwordProblems } from "../../src/server/platform/security/password.js";

const [command, ...rest] = process.argv.slice(2);
const option = name => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
};
const email = normalizeEmail(option("email"));
if (!["create", "reset-mfa", "unlock", "sign-out"].includes(command) || !email) {
  console.error(
    'Usage: node --env-file=.env scripts/accounts/account.js <create|reset-mfa|unlock|sign-out> --email you@example.com [--name "Display name"]'
  );
  process.exit(2);
}

async function readPassword() {
  if (process.env.HOK_PASSWORD) {
    return process.env.HOK_PASSWORD;
  }
  if (process.stdin.isTTY) {
    console.error(
      "Pipe the password on stdin or set HOK_PASSWORD (it must not appear on the command line)."
    );
    process.exit(2);
  }
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data.replace(/\r?\n$/, "");
}

const config = loadConfig();
assertRuntimeConfig(config);
const store = createStore(config.db);
try {
  await store.initializeDatabase();
  const existing = await store.getLoginUser(email);
  if (command === "create") {
    if (existing) {
      console.error("An account with this email already exists.");
      process.exitCode = 1;
    } else {
      const name = (option("name") || email.split("@")[0]).slice(0, 60);
      const password = await readPassword();
      const problems = passwordProblems(password, { email, name });
      if (problems.length) {
        console.error(problems.join(" "));
        process.exitCode = 1;
      } else {
        await store.createLocalUser({
          email,
          loginEmail: email,
          name,
          passwordHash: await hashPassword(password, {
            log2N: config.scryptLog2N,
            pepper: config.passwordPepper
          }),
          verified: true
        });
        console.log(
          `Account created for ${email}. Sign in at /login: the authenticator is set up on first sign-in.${config.adminEmails.has(email) ? " (administrator: address is in ADMIN_EMAILS)" : ""}`
        );
      }
    }
  } else if (!existing) {
    console.error("No password account with this email.");
    process.exitCode = 1;
  } else if (command === "reset-mfa") {
    await store.pool.execute(
      "UPDATE users SET mfa_enabled = FALSE, mfa_secret_enc = NULL, mfa_last_step = NULL WHERE id = ?",
      [existing.id]
    );
    await store.pool.execute("DELETE FROM mfa_recovery_codes WHERE user_id = ?", [existing.id]);
    await store.pool.execute("DELETE FROM auth_challenges WHERE user_id = ?", [existing.id]);
    const closed = await store.deleteSessionsForUser(existing.id);
    await store.logAuthEvent(existing.id, "mfa_reset_by_admin", `${closed} sessions closed`, "cli");
    console.log(
      `Authenticator removed for ${email} (${closed} sessions closed). They will enrol a new one at next sign-in.`
    );
  } else if (command === "unlock") {
    await store.clearLoginFailures(existing.id);
    await store.logAuthEvent(existing.id, "unlocked_by_admin", "", "cli");
    console.log(`Account ${email} unlocked.`);
  } else if (command === "sign-out") {
    console.log(`${await store.deleteSessionsForUser(existing.id)} sessions closed for ${email}.`);
  }
} finally {
  await store.closeDatabase();
}
