// The rights of a person over their data: the copy and the erasure of an account, and the guard that makes a new table
// that names a person choose between the two lists of features/auth/data-rights.js.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { EXPORTED, NOT_EXPORTED } from "./data-rights.js";
import { hotp, stepAt } from "../../platform/security/totp.js";
import { startTestServer } from "../../../testing/test-app.js";

const STRONG = "correct horse battery staple 42";
const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
let counter = 0;

/** Registers an account with its authenticator, the way a person does; `next()` is a code that was not used yet. */
async function createAccount() {
  const email = `rights${Date.now()}${(counter += 1)}@example.test`;
  const browser = app.browser();
  await browser.post("/api/auth/register", { email, name: "Rights", password: STRONG });
  const start = await browser.post("/api/auth/mfa/enrol/start");
  const secret = start.body.secret.replace(/\s/g, "");
  await browser.post("/api/auth/mfa/enrol/confirm", { code: hotp(secret, stepAt()) });
  const me = (await browser.get("/api/auth/me")).body.user;
  return {
    browser,
    email,
    secret,
    id: me.id,
    next: async () => {
      // time passes: the step after the last one used is open again (the way auth.test.js does it)
      await app.store.pool.query(
        "UPDATE users SET mfa_last_step = mfa_last_step - 3 WHERE id = ?",
        [me.id]
      );
      return hotp(secret, stepAt() + 1);
    }
  };
}

describe("what belongs to a person", { skip }, () => {
  test("every table that names a person is exported or says why it is not", async () => {
    const [rows] = await app.store.pool.query(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND (column_name IN ('user_id', 'owner_user_id', 'created_by', 'reporter_id', 'shared_by', 'invited_by',
                              'team_a_user_id', 'team_b_user_id'))`
    );
    const known = new Set(
      [...EXPORTED, ...NOT_EXPORTED].map(([table, column]) => `${table}.${column}`)
    );
    // `invited_by` of an invitation is somebody else's act towards the person: it goes with the invitation
    const unknown = rows
      .map(row => `${row.t}.${row.c}`)
      .filter(name => !known.has(name) && name !== "team_invitations.invited_by");
    assert.deepEqual(
      unknown,
      [],
      "a table names a person: add it to EXPORTED (and check that erasing the user removes or detaches it) or to NOT_EXPORTED with a reason"
    );
    for (const [table, column] of [...EXPORTED, ...NOT_EXPORTED]) {
      const [found] = await app.store.pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [table, column]
      );
      assert.equal(found.length, 1, `${table}.${column} is listed but does not exist`);
    }
  });
});

describe("the copy of an account", { skip }, () => {
  test("it needs the authenticator code and a session, and holds no secret", async () => {
    const account = await createAccount();
    assert.equal((await account.browser.post("/api/auth/export", { code: "000000" })).status, 401);
    assert.equal(
      (await app.browser().post("/api/auth/export", { code: await account.next() })).status,
      401
    );
    const copy = await account.browser.post("/api/auth/export", { code: await account.next() });
    assert.equal(copy.status, 200, copy.text);
    assert.equal(copy.body.tables.users[0].login_email, account.email);
    assert.ok(copy.body.tables.sessions.length >= 1);
    const text = JSON.stringify(copy.body);
    assert.ok(!/password_hash|mfa_secret|scrypt\$/i.test(text), "no hash and no secret in a copy");
    assert.ok(!text.includes(account.secret));
    assert.ok(
      copy.body.tables.auth_events.some(item => item.event === "data_exported"),
      "the copy is in the journal of the account"
    );
  });
});

describe("the erasure of an account", { skip }, () => {
  test("it needs the password and a fresh code, then nothing is left and the session is over", async () => {
    const account = await createAccount();
    const wrongPassword = await account.browser.post("/api/auth/delete-account", {
      password: "not my password at all",
      code: await account.next()
    });
    assert.equal(wrongPassword.status, 401);
    const wrongCode = await account.browser.post("/api/auth/delete-account", {
      password: STRONG,
      code: "000000"
    });
    assert.equal(wrongCode.status, 401);
    assert.equal((await app.browser().post("/api/auth/delete-account", {})).status, 401);
    await account.browser.post("/api/series", {
      teamA: "Mine",
      teamB: "Theirs",
      bestOf: 1,
      gameMode: "free-for-all"
    });
    const done = await account.browser.post("/api/auth/delete-account", {
      password: STRONG,
      code: await account.next()
    });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.deleted, true);
    const [[{ remaining }]] = await app.store.pool.query(
      "SELECT COUNT(*) AS remaining FROM users WHERE id = ?",
      [account.id]
    );
    assert.equal(Number(remaining), 0);
    for (const [table, column] of EXPORTED.filter(([, column]) => column !== "created_by")) {
      const [rows] = await app.store.pool.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` = ?`,
        [account.id]
      );
      assert.equal(Number(rows[0].n), 0, `${table} still holds something of the person`);
    }
    assert.equal(
      (await account.browser.get("/api/auth/me")).body.user,
      null,
      "the session is over"
    );
    assert.equal(
      (await app.browser().post("/api/auth/login", { email: account.email, password: STRONG }))
        .status,
      401,
      "the account no longer exists"
    );
  });

  test("a team the person created goes to another member; a team with nobody else is deleted", async () => {
    const leaver = await createAccount();
    const stayer = await createAccount();
    const input = name => ({
      name,
      nameKey: `${name}-${randomUUID()}`.toLowerCase(),
      tag: randomUUID().slice(0, 4).toUpperCase(),
      description: "",
      region: "",
      timezone: "UTC",
      languages: ["en"],
      level: "casual",
      maxMembers: 10
    });
    const shared = await app.store.createTeam(leaver.id, input("Shared"), 10);
    const alone = await app.store.createTeam(leaver.id, input("Alone"), 10);
    await app.store.pool.query(
      "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, 'player', '', ?)",
      [shared, stayer.id, Date.now()]
    );
    const done = await leaver.browser.post("/api/auth/delete-account", {
      password: STRONG,
      code: await leaver.next()
    });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.teamsHandedOver, 1);
    assert.equal(done.body.teamsDeleted, 1);
    const [[team]] = await app.store.pool.query("SELECT created_by FROM teams WHERE id = ?", [
      shared
    ]);
    assert.equal(team.created_by, stayer.id);
    const [[member]] = await app.store.pool.query(
      "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
      [shared, stayer.id]
    );
    assert.equal(member.role, "owner", "the team is not left without an owner");
    const [gone] = await app.store.pool.query("SELECT 1 FROM teams WHERE id = ?", [alone]);
    assert.equal(gone.length, 0);
  });
});
