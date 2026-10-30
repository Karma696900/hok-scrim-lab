// Accounts with mandatory MFA: password hashing, TOTP, recovery codes, lockouts, replay, step-up,
// sessions.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, test } from "node:test";
import {
  hashPassword,
  needsRehash,
  passwordProblems,
  verifyPassword
} from "../../platform/security/password.js";
import { createSecretBox, parseKey } from "../../platform/security/secret-box.js";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  hotp,
  otpauthUri,
  qrDataUri,
  stepAt,
  verifyTotp
} from "../../platform/security/totp.js";
import { startTestServer } from "../../../testing/test-app.js";

const FAST = { log2N: 10 };
const STRONG = "correct horse battery staple 42";

describe("password hashing", () => {
  test("hash and verify; wrong password and tampering fail; salts differ", async () => {
    const hash = await hashPassword(STRONG, FAST);
    assert.match(hash, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.equal(await verifyPassword(STRONG, hash), true);
    assert.equal(await verifyPassword(`${STRONG}!`, hash), false);
    const parts = hash.split("$");
    parts[5] = `${parts[5][0] === "A" ? "B" : "A"}${parts[5].slice(1)}`;
    assert.equal(await verifyPassword(STRONG, parts.join("$")), false);
    assert.notEqual(hash, await hashPassword(STRONG, FAST));
    assert.ok(!hash.includes(STRONG));
  });
  test("a pepper changes the result: the same hash cannot be checked without it", async () => {
    const hash = await hashPassword(STRONG, { ...FAST, pepper: "server-secret" });
    assert.equal(await verifyPassword(STRONG, hash, { pepper: "server-secret" }), true);
    assert.equal(await verifyPassword(STRONG, hash, { pepper: "other" }), false);
    assert.equal(await verifyPassword(STRONG, hash), false);
  });
  test("malformed or hostile stored values never verify (and never throw)", async () => {
    for (const stored of [
      "",
      "x",
      "scrypt$1$1$1$a$b",
      "scrypt$1024$8$1$a",
      null,
      undefined,
      "bcrypt$10$x",
      `scrypt$${2 ** 30}$8$1$AAAA$AAAA`,
      "scrypt$1000$8$1$AAAA$AAAA"
    ]) {
      assert.equal(await verifyPassword(STRONG, stored), false);
    }
    assert.equal(
      await verifyPassword("x".repeat(500), await hashPassword(STRONG, FAST)),
      false,
      "over-long input is refused before hashing"
    );
  });
  test("parameters can be raised: old hashes ask to be upgraded", async () => {
    const old = await hashPassword(STRONG, FAST);
    assert.equal(needsRehash(old, { log2N: 10 }), false);
    assert.equal(needsRehash(old, { log2N: 12 }), true);
    assert.equal(needsRehash("garbage"), true);
  });
  test("the password policy", () => {
    assert.deepEqual(passwordProblems(STRONG, { email: "me@example.com" }), []);
    assert.match(passwordProblems("short").join(" "), /at least 12/);
    assert.match(passwordProblems("x".repeat(129)).join(" "), /at most 128/);
    assert.match(
      passwordProblems("password").concat(passwordProblems("aaaaaaaaaaaaaaaa")).join(" "),
      /too common/
    );
    assert.match(
      passwordProblems("zebra-kestrel42-zebra", { email: "kestrel42@example.com" }).join(" "),
      /email name/
    );
    assert.match(
      passwordProblems("Jonathan Smith 1234", { name: "Jonathan Smith" }).join(" "),
      /your name/
    );
    assert.match(passwordProblems("abababababab").join(" "), /variety/);
  });
});

describe("TOTP (RFC 6238 / 4226)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  test("matches the RFC 4226 test vectors", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map(counter => hotp(secret, counter)),
      ["755224", "287082", "359152", "969429"]
    );
  });
  test("matches the RFC 6238 vector at T=59 (SHA-1)", () => {
    assert.equal(hotp(secret, Math.floor(59 / 30)), "287082");
  });
  test("base32 round trip", () => {
    const bytes = randomBytes(20);
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    assert.throws(() => base32Decode("1!?"), /Invalid/);
  });
  test("accepts one step of drift, not two; each step only once; garbage never", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    assert.equal(verifyTotp(secret, hotp(secret, step), { now }), step);
    assert.equal(verifyTotp(secret, hotp(secret, step - 1), { now }), step - 1);
    assert.equal(verifyTotp(secret, hotp(secret, step + 1), { now }), step + 1);
    assert.equal(verifyTotp(secret, hotp(secret, step + 2), { now }), null);
    assert.equal(verifyTotp(secret, hotp(secret, step - 2), { now }), null);
    assert.equal(
      verifyTotp(secret, hotp(secret, step), { now, afterStep: step }),
      null,
      "replay of an accepted step"
    );
    assert.equal(verifyTotp(secret, hotp(secret, step), { now, afterStep: step - 1 }), step);
    for (const bad of [
      "",
      "12345",
      "1234567",
      "abcdef",
      null,
      undefined,
      "12 34 5",
      { toString: () => "000000" }
    ]) {
      assert.equal(verifyTotp(secret, bad, { now }), null);
    }
    assert.equal(
      verifyTotp(secret, ` ${hotp(secret, step).slice(0, 3)} ${hotp(secret, step).slice(3)} `, {
        now
      }),
      step,
      "spaces are tolerated"
    );
  });
  test("provisioning URI and QR code (generated locally, as a data: SVG)", () => {
    const uri = otpauthUri({
      secret: "ABCDEFGH",
      account: "me@example.com",
      issuer: "HOK Global Scrim Lab"
    });
    assert.match(
      uri,
      /^otpauth:\/\/totp\/HOK%20Global%20Scrim%20Lab:me%40example\.com\?secret=ABCDEFGH&issuer=HOK%20Global%20Scrim%20Lab&algorithm=SHA1&digits=6&period=30$/
    );
    const qr = qrDataUri(uri);
    assert.match(qr, /^data:image\/svg\+xml;base64,/);
    assert.match(Buffer.from(qr.split(",")[1], "base64").toString(), /<svg/);
  });
  test("recovery codes: 10 distinct, unambiguous, ~50 bits each", () => {
    const codes = generateRecoveryCodes();
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) {
      assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
  });
});

describe("secret box (AES-256-GCM)", () => {
  const box = createSecretBox(randomBytes(32));
  test("round trip, random IV, tamper and context detection", () => {
    const sealed = box.encrypt("JBSWY3DPEHPK3PXP", "totp:user-1");
    assert.equal(box.decrypt(sealed, "totp:user-1"), "JBSWY3DPEHPK3PXP");
    assert.notEqual(sealed, box.encrypt("JBSWY3DPEHPK3PXP", "totp:user-1"));
    assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
    assert.throws(
      () => box.decrypt(sealed, "totp:user-2"),
      "a seed cannot be moved to another account"
    );
    const [version, iv, tag, body] = sealed.split(".");
    assert.throws(() =>
      box.decrypt([version, iv, tag, `${body.slice(0, -2)}AA`].join("."), "totp:user-1")
    );
    assert.throws(() => box.decrypt("garbage", ""));
    assert.throws(
      () => createSecretBox(randomBytes(32)).decrypt(sealed, "totp:user-1"),
      "another key cannot read it"
    );
  });
  test("the key must be exactly 32 bytes", () => {
    assert.throws(() => parseKey("short"), /32 random bytes/);
    assert.throws(() => createSecretBox(Buffer.alloc(16)));
    assert.ok(parseKey(randomBytes(32).toString("base64")));
  });
});

const app = await startTestServer({ env: { ADMIN_EMAILS: "boss@example.test" } });
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
let counter = 0;
const newEmail = () => `user${Date.now()}${(counter += 1)}@example.test`;

/**
 * Registers, enrols an authenticator and returns what a user would hold: the browser, seed and
 * recovery codes.
 */
async function createAccount({ email = newEmail(), password = STRONG, name = "Test User" } = {}) {
  const browser = app.browser();
  const registered = await browser.post("/api/auth/register", { email, name, password });
  assert.equal(registered.status, 200, registered.text);
  assert.deepEqual(registered.body, { step: "enroll" });
  const start = await browser.post("/api/auth/mfa/enrol/start");
  assert.equal(start.status, 200, start.text);
  const secret = start.body.secret.replace(/\s/g, "");
  const confirmed = await browser.post("/api/auth/mfa/enrol/confirm", {
    code: hotp(secret, stepAt())
  });
  assert.equal(confirmed.status, 200, confirmed.text);
  return {
    browser,
    email,
    password,
    secret,
    recoveryCodes: confirmed.body.recoveryCodes,
    enrolStep: stepAt()
  };
}
const codeAfter = (secret, offset = 1) => hotp(secret, stepAt() + offset);
const lastStep = async email =>
  Number(
    (
      await app.store.pool.query("SELECT mfa_last_step FROM users WHERE login_email = ?", [email])
    )[0][0].mfa_last_step
  );

describe("registration and enrolment", { skip }, () => {
  test("the whole path: register, scan, confirm; only then is there a session", async () => {
    const browser = app.browser();
    const email = newEmail();
    await browser.post("/api/auth/register", { email, name: "Zed", password: STRONG });
    assert.equal(
      (await browser.get("/api/auth/me")).body.user,
      null,
      "registered but no session before MFA"
    );
    assert.equal(
      (
        await browser.post("/api/online/series", {
          teamA: "A",
          teamB: "B",
          bestOf: 1,
          gameMode: "free-for-all"
        })
      ).status,
      401
    );
    assert.deepEqual((await browser.get("/api/auth/challenge")).body.step, "enroll");
    const start = await browser.post("/api/auth/mfa/enrol/start");
    assert.match(start.body.qr, /^data:image\/svg\+xml;base64,/);
    assert.match(start.body.uri, /^otpauth:\/\/totp\//);
    assert.match(start.body.secret, /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    assert.equal(
      (await browser.post("/api/auth/mfa/enrol/start")).body.secret,
      start.body.secret,
      "the same pending seed until confirmed"
    );
    const secret = start.body.secret.replace(/\s/g, "");
    assert.equal(
      (await browser.post("/api/auth/mfa/enrol/confirm", { code: "000000" })).status,
      401
    );
    const confirmed = await browser.post("/api/auth/mfa/enrol/confirm", {
      code: hotp(secret, stepAt())
    });
    assert.equal(confirmed.body.recoveryCodes.length, 10);
    const me = (await browser.get("/api/auth/me")).body;
    assert.equal(me.user.email, email);
    assert.equal(me.user.mfa, true);
    assert.equal(me.user.isAdmin, false);
    assert.equal(
      (await browser.get("/api/auth/challenge")).body.step,
      "none",
      "the challenge is gone"
    );
    assert.equal((await browser.post("/api/auth/mfa/enrol/start")).status, 401);
  });

  test("the account lives in the database: hashed password, encrypted seed, hashed recovery codes — never plaintext", async () => {
    const account = await createAccount();
    const [[row]] = await app.store.pool.query(
      "SELECT password_hash, mfa_secret_enc, mfa_enabled, login_email, email_verified FROM users WHERE login_email = ?",
      [account.email]
    );
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes(account.password));
    assert.match(row.mfa_secret_enc, /^v1\./);
    assert.ok(!row.mfa_secret_enc.includes(account.secret));
    assert.deepEqual([Boolean(row.mfa_enabled), Boolean(row.email_verified)], [true, false]);
    const [codes] = await app.store.pool.query(
      "SELECT code_hash FROM mfa_recovery_codes WHERE user_id = (SELECT id FROM users WHERE login_email = ?)",
      [account.email]
    );
    assert.equal(codes.length, 10);
    for (const code of account.recoveryCodes) {
      assert.ok(!codes.some(entry => entry.code_hash.includes(code.replace("-", ""))));
    }
    const dump =
      JSON.stringify((await app.store.pool.query("SELECT * FROM auth_events"))[0]) +
      JSON.stringify((await app.store.pool.query("SELECT * FROM auth_challenges"))[0]);
    assert.ok(
      !dump.includes(account.password) && !dump.includes(account.secret),
      "the journal never contains secrets"
    );
  });

  test("API responses never carry hashes, seeds or other people's data", async () => {
    const account = await createAccount();
    for (const path of ["/api/auth/me", "/api/auth/security", "/api/auth/challenge"]) {
      const text = (await account.browser.get(path)).text;
      for (const forbidden of [
        "password_hash",
        "scrypt$",
        "mfa_secret",
        "v1.",
        account.secret,
        account.password
      ]) {
        assert.ok(!text.includes(forbidden), `${path} leaks ${forbidden}`);
      }
    }
  });

  test("validation: weak password, bad email, bad name, duplicates (case-insensitive), reserved admin address", async () => {
    const attempt = body =>
      app
        .browser()
        .post("/api/auth/register", { email: newEmail(), name: "N", password: STRONG, ...body });
    assert.equal((await attempt({ password: "short" })).body.code, "weak_password");
    assert.equal((await attempt({ password: "password1234" })).body.code, "weak_password");
    for (const email of [
      "nope",
      "a@b",
      "a b@example.com",
      "<x>@example.com",
      `${"a".repeat(70)}@example.com`,
      "a@example.com\nb@example.com"
    ]) {
      assert.equal((await attempt({ email })).body.code, "invalid_email", email);
    }
    for (const name of ["", "x".repeat(61), "<b>", "a\u0000b"]) {
      assert.equal((await attempt({ name })).body.code, "invalid_name", JSON.stringify(name));
    }
    assert.equal((await attempt({ name: 5 })).status, 400);
    const taken = newEmail();
    assert.equal((await attempt({ email: taken })).status, 200);
    assert.equal((await attempt({ email: taken.toUpperCase() })).status, 409);
    assert.equal((await attempt({ email: "boss@example.test" })).body.code, "reserved_email");
    assert.equal((await app.browser().post("/api/auth/register", [])).status, 400);
  });

  test("an unfinished enrolment cannot sign in: the account stays without a session", async () => {
    const browser = app.browser();
    const email = newEmail();
    await browser.post("/api/auth/register", { email, name: "Half", password: STRONG });
    const other = app.browser();
    const login = await other.post("/api/auth/login", { email, password: STRONG });
    assert.deepEqual(login.body, { step: "enroll" }, "password alone never opens a session");
    assert.equal((await other.get("/api/auth/me")).body.user, null);
  });

  test("a wrong code during enrolment is limited: after 5 tries the sign-in must restart", async () => {
    const browser = app.browser();
    await browser.post("/api/auth/register", {
      email: newEmail(),
      name: "Brute",
      password: STRONG
    });
    await browser.post("/api/auth/mfa/enrol/start");
    const statuses = [];
    for (let index = 0; index < 7; index += 1) {
      statuses.push(
        (await browser.post("/api/auth/mfa/enrol/confirm", { code: String(100000 + index) })).status
      );
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 401]);
  });

  test("registration can be closed by configuration", async () => {
    const closed = await startTestServer({
      env: { REGISTRATION_ENABLED: "false" },
      seedHeroes: false
    });
    try {
      const response = await closed
        .browser()
        .post("/api/auth/register", { email: newEmail(), name: "X", password: STRONG });
      assert.equal(response.body.code, "registration_closed");
      assert.equal((await closed.browser().get("/api/auth/config")).body.registration, false);
      // the session says it too, so the pages do not offer a "Create account" button that leads nowhere
      assert.equal((await closed.browser().get("/api/auth/me")).body.registration, false);
      const page = await closed.browser().get("/training");
      assert.match(page.text, /id="account-control"/);
      assert.doesNotMatch(page.text, /href="\/register"/);
    } finally {
      await closed.close();
    }
  });
});

describe("signing in", { skip }, () => {
  test("password then authenticator code; a wrong code and a wrong password give nothing", async () => {
    const account = await createAccount();
    const browser = app.browser();
    assert.deepEqual(
      (
        await browser.post("/api/auth/login", {
          email: account.email.toUpperCase(),
          password: account.password
        })
      ).body,
      { step: "mfa" }
    );
    assert.equal(
      (await browser.get("/api/auth/me")).body.user,
      null,
      "no session after the first factor"
    );
    assert.equal((await browser.post("/api/auth/mfa/verify", { code: "123456" })).status, 401);
    const ok = await browser.post("/api/auth/mfa/verify", { code: codeAfter(account.secret) });
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await browser.get("/api/auth/me")).body.user.email, account.email);
    assert.ok(
      (
        await browser.post("/api/online/series", {
          teamA: "A",
          teamB: "B",
          bestOf: 1,
          gameMode: "free-for-all"
        })
      ).status === 200,
      "accounts can play online"
    );
  });

  test("unknown email and wrong password are indistinguishable", async () => {
    const account = await createAccount();
    const wrong = await app
      .browser()
      .post("/api/auth/login", { email: account.email, password: `${STRONG}x` });
    const unknown = await app
      .browser()
      .post("/api/auth/login", { email: newEmail(), password: STRONG });
    assert.deepEqual(
      [wrong.status, wrong.body.code, wrong.body.error],
      [unknown.status, unknown.body.code, unknown.body.error]
    );
    assert.equal(wrong.status, 401);
    for (const body of [
      {},
      { email: 5, password: 5 },
      { email: account.email },
      { password: STRONG },
      { email: "x".repeat(400), password: "y" },
      { email: account.email, password: "z".repeat(5000) }
    ]) {
      assert.equal((await app.browser().post("/api/auth/login", body)).status, 401);
    }
  });

  test("a code can only be used once, even in parallel", async () => {
    const account = await createAccount();
    const code = codeAfter(account.secret);
    const attempts = await Promise.all(
      [1, 2, 3].map(async () => {
        const browser = app.browser();
        await browser.post("/api/auth/login", { email: account.email, password: account.password });
        return (await browser.post("/api/auth/mfa/verify", { code })).status;
      })
    );
    assert.deepEqual(attempts.sort(), [200, 401, 401]);
    const later = app.browser();
    await later.post("/api/auth/login", { email: account.email, password: account.password });
    assert.equal(
      (await later.post("/api/auth/mfa/verify", { code })).status,
      401,
      "replaying a captured code fails"
    );
    assert.ok((await lastStep(account.email)) >= stepAt());
  });

  test("a recovery code works once, is single-use, and the count goes down", async () => {
    const account = await createAccount();
    const [first, second] = account.recoveryCodes;
    const signIn = async recoveryCode => {
      const browser = app.browser();
      await browser.post("/api/auth/login", { email: account.email, password: account.password });
      return { browser, response: await browser.post("/api/auth/mfa/verify", { recoveryCode }) };
    };
    const used = await signIn(first.toLowerCase().replace("-", " "));
    assert.equal(used.response.status, 200, used.response.text);
    assert.equal(used.response.body.recoveryLeft, 9);
    assert.equal((await signIn(first)).response.status, 401, "already used");
    assert.equal((await signIn("AAAAA-AAAAA")).response.status, 401);
    assert.equal((await signIn("short")).response.status, 401);
    assert.equal((await signIn(second)).response.status, 200);
    assert.equal(
      (await used.browser.get("/api/auth/security")).body.recoveryRemaining,
      8,
      "the overview counts what is left"
    );
  });

  test("the second-factor step is limited: 5 wrong codes then the challenge is destroyed", async () => {
    const account = await createAccount();
    const browser = app.browser();
    await browser.post("/api/auth/login", { email: account.email, password: account.password });
    const statuses = [];
    for (let index = 0; index < 7; index += 1) {
      statuses.push(
        (await browser.post("/api/auth/mfa/verify", { code: String(200000 + index) })).status
      );
    }
    assert.deepEqual(
      statuses,
      [401, 401, 401, 401, 401, 401, 401],
      "after 5 failures the account is locked, so every further attempt is refused"
    );
    assert.equal(
      (await browser.post("/api/auth/mfa/verify", { code: codeAfter(account.secret) })).status,
      401,
      "even the right code no longer works"
    );
    const [[row]] = await app.store.pool.query(
      "SELECT locked_until FROM users WHERE login_email = ?",
      [account.email]
    );
    assert.ok(Number(row.locked_until) > Date.now());
  });

  test("repeated failures lock the account progressively; the lock is not revealed and does not accept the right password", async () => {
    const account = await createAccount();
    for (let index = 0; index < 5; index += 1) {
      await app
        .browser()
        .post("/api/auth/login", { email: account.email, password: `wrong-${index}-password` });
    }
    const [[locked]] = await app.store.pool.query(
      "SELECT failed_logins, locked_until FROM users WHERE login_email = ?",
      [account.email]
    );
    assert.equal(locked.failed_logins, 5);
    assert.ok(Number(locked.locked_until) > Date.now() + 14 * 60_000);
    const blocked = await app
      .browser()
      .post("/api/auth/login", { email: account.email, password: account.password });
    assert.deepEqual([blocked.status, blocked.body.code], [401, "invalid_credentials"]);
    await app.store.pool.query("UPDATE users SET locked_until = ? WHERE login_email = ?", [
      Date.now() - 1,
      account.email
    ]);
    assert.equal(
      (
        await app
          .browser()
          .post("/api/auth/login", { email: account.email, password: account.password })
      ).status,
      200,
      "usable again once the lock expires"
    );
    await app.store.pool.query("UPDATE users SET failed_logins = 9 WHERE login_email = ?", [
      account.email
    ]);
    const bumped = await app.store.recordLoginFailure(
      (await app.store.getLoginUser(account.email)).id
    );
    assert.ok(bumped.lockedUntil > Date.now() + 29 * 60_000, "the next lock is longer (doubles)");
  });

  test("a successful sign-in rotates the session and merges the guest's data", async () => {
    const account = await createAccount();
    const browser = app.browser();
    const { body: series } = await browser.post("/api/series", {
      teamA: "Guest A",
      teamB: "Guest B",
      bestOf: 1,
      gameMode: "free-for-all"
    });
    const guestToken = browser.jar.get("hok_session");
    await browser.post("/api/auth/login", { email: account.email, password: account.password });
    await browser.post("/api/auth/mfa/verify", { code: codeAfter(account.secret) });
    assert.notEqual(browser.jar.get("hok_session"), guestToken);
    assert.equal(
      (await browser.get(`/api/series/${series.id}`)).status,
      200,
      "the guest's series moved to the account"
    );
    const stale = app.browser();
    stale.jar.set("hok_session", guestToken);
    assert.equal((await stale.get(`/api/series/${series.id}`)).status, 404);
  });

  test("the challenge cookie is httpOnly and SameSite; there is no challenge after logout", async () => {
    const account = await createAccount();
    const response = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password })
    });
    const cookie = response.headers
      .getSetCookie()
      .find(value => value.startsWith("hok_challenge="));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=600/);
    assert.equal(
      (await app.browser().post("/api/auth/mfa/verify", { code: "123456" })).status,
      401,
      "no challenge, no check"
    );
  });
});

describe("security settings", { skip }, () => {
  test("the overview lists the journal without secrets", async () => {
    const account = await createAccount();
    const overview = (await account.browser.get("/api/auth/security")).body;
    assert.deepEqual(
      [
        overview.email,
        overview.mfa,
        overview.hasPassword,
        overview.viaGoogle,
        overview.recoveryRemaining
      ],
      [account.email, true, true, false, 10]
    );
    assert.ok(overview.events.some(item => item.event === "mfa_enabled"));
    assert.equal((await app.browser().get("/api/auth/security")).status, 401);
  });

  test("changing the password needs the current one AND a fresh code; other sessions are closed", async () => {
    const account = await createAccount();
    const other = app.browser();
    await other.post("/api/auth/login", { email: account.email, password: account.password });
    await other.post("/api/auth/mfa/verify", { code: codeAfter(account.secret, 1) });
    assert.ok((await other.get("/api/auth/me")).body.user);
    await app.store.pool.query(
      "UPDATE users SET mfa_last_step = mfa_last_step - 3 WHERE login_email = ?",
      [account.email]
    ); // time passes: new steps become usable
    const next = "a brand new passphrase 2026";
    const body = overrides => ({
      currentPassword: account.password,
      newPassword: next,
      code: codeAfter(account.secret, 1),
      ...overrides
    });
    assert.equal(
      (await account.browser.post("/api/auth/password", body({ code: "000000" }))).status,
      401,
      "wrong code"
    );
    assert.equal(
      (
        await account.browser.post(
          "/api/auth/password",
          body({ currentPassword: "not my password 123" })
        )
      ).status,
      401
    );
    assert.equal(
      (await account.browser.post("/api/auth/password", body({ newPassword: "short" }))).status,
      400
    );
    assert.equal(
      (await app.browser().post("/api/auth/password", body())).status,
      401,
      "needs a session"
    );
    const done = await account.browser.post(
      "/api/auth/password",
      body({ code: hotp(account.secret, stepAt() + 1) })
    );
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.otherSessionsClosed >= 1, true);
    assert.equal(
      (await other.get("/api/auth/me")).body.user,
      null,
      "the other device was signed out"
    );
    assert.ok((await account.browser.get("/api/auth/me")).body.user, "this one stays");
    assert.equal(
      (
        await app
          .browser()
          .post("/api/auth/login", { email: account.email, password: account.password })
      ).status,
      401,
      "the old password is dead"
    );
    assert.equal(
      (await app.browser().post("/api/auth/login", { email: account.email, password: next }))
        .status,
      200
    );
  });

  test("regenerating recovery codes needs a fresh code and invalidates the old ones", async () => {
    const account = await createAccount();
    assert.equal(
      (await account.browser.post("/api/auth/recovery-codes", { code: "000000" })).status,
      401
    );
    const fresh = await account.browser.post("/api/auth/recovery-codes", {
      code: codeAfter(account.secret, 1)
    });
    assert.equal(fresh.body.recoveryCodes.length, 10);
    const browser = app.browser();
    await browser.post("/api/auth/login", { email: account.email, password: account.password });
    assert.equal(
      (await browser.post("/api/auth/mfa/verify", { recoveryCode: account.recoveryCodes[0] }))
        .status,
      401,
      "old codes are gone"
    );
    assert.equal(
      (await browser.post("/api/auth/mfa/verify", { recoveryCode: fresh.body.recoveryCodes[0] }))
        .status,
      200
    );
  });

  test("sign out everywhere closes every session of the account", async () => {
    const account = await createAccount();
    const second = app.browser();
    await second.post("/api/auth/login", { email: account.email, password: account.password });
    await second.post("/api/auth/mfa/verify", { code: codeAfter(account.secret, 1) });
    assert.equal((await account.browser.post("/api/auth/logout-all")).status, 200);
    assert.equal((await account.browser.get("/api/auth/me")).body.user, null);
    assert.equal((await second.get("/api/auth/me")).body.user, null);
  });

  test("logout deletes the session on the server", async () => {
    const account = await createAccount();
    const token = account.browser.jar.get("hok_session");
    await account.browser.post("/auth/logout");
    const replay = app.browser();
    replay.jar.set("hok_session", token);
    assert.equal(
      (await replay.get("/api/auth/me")).body.user,
      null,
      "a stolen cookie is useless after logout"
    );
  });
});

describe("administrators", { skip }, () => {
  test("a local account is never an administrator, even with an admin address (the email is not verified)", async () => {
    const [[row]] = await app.store.pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE login_email = 'boss@example.test'"
    );
    assert.equal(Number(row.n), 0, "the address could not be claimed through registration");
    // Force it into the table as an attacker with database write access would not: even then the
    // flag needs verification.
    const hash = await hashPassword(STRONG, FAST);
    const user = await app.store.createLocalUser({
      email: "boss@example.test",
      loginEmail: "boss@example.test",
      name: "Boss",
      passwordHash: hash
    });
    const { randomBytes: random } = await import("node:crypto");
    const token = random(32).toString("base64url");
    const { createHash } = await import("node:crypto");
    await app.store.createSession(
      createHash("sha256").update(token).digest("hex"),
      user.id,
      Date.now() + 60_000
    );
    const browser = app.browser();
    browser.jar.set("hok_session", token);
    assert.equal((await browser.get("/api/auth/me")).body.user.isAdmin, false);
    assert.equal((await browser.post("/api/roster/sync", {})).status, 403);
  });
});

describe("existing sessions and configuration", { skip }, () => {
  test("configuration refuses a production start without the MFA key or with a weak scrypt cost", async () => {
    const { assertRuntimeConfig, loadConfig } = await import("../../config.js");
    const base = {
      NODE_ENV: "production",
      DB_PASSWORD: "q7Vn!2xLr9TzPw4Hs8Kd",
      MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64")
    };
    assert.doesNotThrow(() => assertRuntimeConfig(loadConfig(base)));
    assert.throws(
      () => assertRuntimeConfig(loadConfig({ ...base, MFA_ENCRYPTION_KEY: "" })),
      /MFA_ENCRYPTION_KEY/
    );
    assert.throws(
      () => assertRuntimeConfig(loadConfig({ ...base, SCRYPT_LOG2N: "12" })),
      /SCRYPT_LOG2N/
    );
  });
});
