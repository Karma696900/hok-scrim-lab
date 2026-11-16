// A forgotten password, changed on the site with the authenticator (no mail is ever sent), and a Google
// sign-in that finds an account of the site with the same address: it is linked to it after a proof
// instead of making a second, empty account (owner, 2026-11-16).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { generateSecret, hotp, stepAt } from "../../platform/security/totp.js";
import { hashPassword, verifyPassword } from "../../platform/security/password.js";
import { createSecretBox } from "../../platform/security/secret-box.js";
import { hashRecovery } from "./auth-service-shared.js";
import { beginLink, confirmLink, forgotPassword } from "./auth-service-recover.js";
import { challengeStatus } from "./auth-service-seed.js";

const FAST = { log2N: 10, pepper: "" };
const OLD = "the old passphrase nobody remembers 1";
const NEW = "a brand new passphrase for 2026";
const EMAIL = "ana@example.test";
const RECOVERY = "ABCDE-FGHJK";

/** One account (with or without authenticator) and everything the service touches, kept in memory. */
async function world({ mfa = true, password = true, locked = 0 } = {}) {
  const secret = generateSecret();
  const user = {
    id: "u1",
    email: EMAIL,
    name: "Ana",
    password_hash: password ? await hashPassword(OLD, FAST) : null,
    mfa_enabled: mfa,
    mfa_secret_enc: mfa ? secret : null,
    mfa_last_step: null,
    locked_until: locked,
    profile_complete: true
  };
  const seen = { events: [], failures: 0, cleared: 0, closed: [], linked: null, logins: [] };
  const codes = new Set([hashRecovery(RECOVERY)]);
  const challenges = new Map();
  const box = createSecretBox(randomBytes(32));
  const store = {
    getLoginUser: async email => (email === user.email ? user : null),
    getAuthUser: async id => (id === user.id ? user : null),
    acceptMfaStep: async (_id, step) => {
      if (user.mfa_last_step !== null && step <= user.mfa_last_step) {
        return false;
      }
      user.mfa_last_step = step;
      return true;
    },
    consumeRecoveryCode: async (_id, hash) => codes.delete(hash),
    countRecoveryCodes: async () => codes.size,
    recordLoginFailure: async () => {
      seen.failures += 1;
      // as the store: the 5th failure locks for 15 minutes
      user.locked_until = seen.failures >= 5 ? Date.now() + 15 * 60_000 : 0;
      return { failed: seen.failures, lockedUntil: user.locked_until };
    },
    clearLoginFailures: async () => {
      seen.cleared += 1;
    },
    setPassword: async (_id, hash) => {
      user.password_hash = hash;
    },
    deleteSessionsForUser: async (id, except = null) => {
      seen.closed.push({ id, except });
      return 2;
    },
    createChallenge: async ({ tokenHash, userId, kind, method }) => {
      challenges.set(tokenHash, {
        token_hash: tokenHash,
        user_id: userId,
        kind,
        method,
        attempts: 0
      });
    },
    setChallengeSecret: async (tokenHash, encrypted) => {
      challenges.get(tokenHash).pending_secret_enc = encrypted;
    },
    bumpChallengeAttempts: async tokenHash => {
      const challenge = challenges.get(tokenHash);
      return challenge ? (challenge.attempts += 1) : null;
    },
    getChallenge: async tokenHash => challenges.get(tokenHash) ?? null,
    deleteChallenge: async tokenHash => challenges.delete(tokenHash),
    linkGoogle: async (id, link) => {
      seen.linked = { id, ...link };
      return true;
    }
  };
  const cookies = {};
  const ctx = {
    store,
    secretBox: box,
    config: { passwordPepper: "" },
    hashOptions: FAST,
    unseed: (_id, payload) => payload,
    event: async (_id, name) => seen.events.push(name),
    identity: {
      names: { challenge: "hok_challenge" },
      setCookie: (_response, name, value) => {
        cookies[name] = value;
      },
      clearCookie: (_response, name) => {
        delete cookies[name];
      },
      readCookies: () => cookies
    },
    completeLogin: async (_request, _response, row, method) => {
      seen.logins.push({ id: row.id, method });
      return row;
    },
    beginSecondFactor: async (_request, _response, row) => ({
      step: row.mfa_enabled ? "mfa" : "enroll"
    })
  };
  // the service calls its neighbours as ctx.name(...), as bindTo wires them in auth-service.js
  const { openChallenge, currentChallenge } = await import("./auth-service-seed.js");
  ctx.openChallenge = (...args) => openChallenge(ctx, ...args);
  ctx.currentChallenge = (...args) => currentChallenge(ctx, ...args);
  return { ctx, user, seen, secret, challenges };
}

const request = { ip: "203.0.113.9" };
const reset = (ctx, fields) =>
  forgotPassword(ctx, request, {}, { email: EMAIL, newPassword: NEW, ...fields });
const refused = error => error.status === 401 && error.code === "reset_refused";

describe("a forgotten password, changed with the authenticator", () => {
  test("the email, a fresh code and a new password: the password changes and every session closes", async () => {
    const { ctx, user, seen, secret } = await world();
    const result = await reset(ctx, { code: hotp(secret, stepAt()) });
    assert.equal(result.reset, true);
    assert.ok(await verifyPassword(NEW, user.password_hash, { pepper: "" }), "the new one works");
    assert.equal(await verifyPassword(OLD, user.password_hash, { pepper: "" }), false);
    assert.deepEqual(seen.closed, [{ id: "u1", except: null }], "no session is kept");
    assert.equal(seen.cleared, 1, "a lock from forgotten tries is lifted");
    assert.ok(seen.events.includes("password_reset"));
  });

  test("a recovery code works once", async () => {
    const { ctx, user } = await world();
    const result = await reset(ctx, { recoveryCode: RECOVERY.toLowerCase() });
    assert.equal(result.reset, true);
    assert.equal(result.recoveryLeft, 0);
    assert.ok(await verifyPassword(NEW, user.password_hash, { pepper: "" }));
    await assert.rejects(
      reset(ctx, { recoveryCode: RECOVERY, newPassword: "yet another long passphrase 9" }),
      refused
    );
  });

  test("a wrong code changes nothing and counts as a failed try", async () => {
    const { ctx, user, seen } = await world();
    const before = user.password_hash;
    await assert.rejects(reset(ctx, { code: "000000" }), refused);
    assert.equal(user.password_hash, before);
    assert.equal(seen.failures, 1);
    assert.deepEqual(seen.closed, []);
  });

  test("a code already used cannot be used again", async () => {
    const { ctx, secret } = await world();
    const code = hotp(secret, stepAt());
    await reset(ctx, { code });
    await assert.rejects(
      reset(ctx, { code, newPassword: "yet another long passphrase 9" }),
      refused
    );
  });

  test("an unknown email and an account without authenticator get the same answer", async () => {
    const answers = [];
    const { ctx: known, secret } = await world();
    await reset(known, { email: "nobody@example.test", code: hotp(secret, stepAt()) }).catch(
      error => answers.push(error)
    );
    const { ctx: plain, user: plainUser } = await world({ mfa: false });
    const before = plainUser.password_hash;
    await reset(plain, { code: "123456" }).catch(error => answers.push(error));
    assert.equal(plainUser.password_hash, before, "nothing proves who asks: nothing changes");
    assert.equal(answers.length, 2);
    for (const error of answers) {
      assert.ok(refused(error), `${error.status} ${error.code}`);
      assert.equal(error.message, answers[0].message);
    }
  });

  test("a locked account says until when, even with the right code, and the lock is not lifted", async () => {
    const until = Date.now() + 60_000;
    const { ctx, user, secret } = await world({ locked: until });
    const before = user.password_hash;
    await assert.rejects(
      reset(ctx, { code: hotp(secret, stepAt()) }),
      error =>
        error.status === 429 && error.code === "account_locked" && error.extra.retryAt === until
    );
    assert.equal(user.password_hash, before);
    const { ctx: plain } = await world({ mfa: false, locked: until });
    await assert.rejects(
      reset(plain, { code: "123456" }),
      error => error.code === "account_locked",
      "the same answer with or without an authenticator"
    );
  });

  test("the wrong code that locks the account says so at once", async () => {
    const { ctx, user } = await world();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await assert.rejects(reset(ctx, { code: "000000" }), refused);
    }
    await assert.rejects(
      reset(ctx, { code: "000000" }),
      error => error.code === "account_locked" && error.extra.retryAt === user.locked_until
    );
  });

  test("an account without a password (Google, profile not chosen yet) is refused", async () => {
    const { ctx, secret } = await world({ password: false });
    await assert.rejects(reset(ctx, { code: hotp(secret, stepAt()) }), refused);
  });

  test("a weak new password is refused before the code is spent", async () => {
    const { ctx, user, secret } = await world();
    await assert.rejects(
      reset(ctx, { code: hotp(secret, stepAt()), newPassword: "short" }),
      error => error.status === 400 && error.code === "weak_password"
    );
    assert.equal(user.mfa_last_step, null, "the code can still be used");
  });
});

const GOOGLE = { googleSubject: "google-sub-77", picture: "https://lh3.googleusercontent.com/a" };

/** A Google sign-in that found the account: the link is waiting for its proof. */
async function waitingLink(options) {
  const setup = await world(options);
  await beginLink(setup.ctx, request, {}, setup.user, GOOGLE);
  return setup;
}
const link = (ctx, proof) => confirmLink(ctx, request, {}, proof);

describe("a Google sign-in that finds an account of the site with the same address", () => {
  test("the Google account is kept sealed in the sign-in in progress, never in clear", async () => {
    const { challenges } = await waitingLink();
    const [challenge] = challenges.values();
    assert.equal(challenge.kind, "link");
    assert.equal(challenge.method, "google");
    assert.ok(challenge.pending_secret_enc);
    assert.doesNotMatch(challenge.pending_secret_enc, /google-sub-77/);
  });

  test("the page knows which proof to ask for", async () => {
    const withCode = await waitingLink();
    assert.deepEqual(await challengeStatus(withCode.ctx, request, {}), {
      step: "link",
      email: EMAIL,
      method: "google",
      proof: "code"
    });
    const withPassword = await waitingLink({ mfa: false });
    assert.equal((await challengeStatus(withPassword.ctx, request, {})).proof, "password");
  });

  test("with an authenticator: its code links Google and signs in (Google + code are the two factors)", async () => {
    const { ctx, seen, secret, challenges } = await waitingLink();
    const result = await link(ctx, { code: hotp(secret, stepAt()) });
    assert.equal(result.step, "done");
    assert.deepEqual(seen.linked, { id: "u1", ...GOOGLE });
    assert.deepEqual(seen.logins, [{ id: "u1", method: "google" }]);
    assert.ok(seen.events.includes("google_linked"));
    assert.equal(challenges.size, 0);
  });

  test("with an authenticator: a recovery code works too, but the password alone does not", async () => {
    const first = await waitingLink();
    await assert.rejects(
      link(first.ctx, { password: OLD }),
      error => error.status === 401 && error.code === "invalid_code"
    );
    assert.equal(first.seen.linked, null);
    const second = await waitingLink();
    assert.equal((await link(second.ctx, { recoveryCode: RECOVERY })).step, "done");
  });

  test("without an authenticator: the password links Google, then the authenticator is set up", async () => {
    const { ctx, seen } = await waitingLink({ mfa: false });
    const result = await link(ctx, { password: OLD });
    assert.equal(result.step, "enroll");
    assert.equal(seen.linked.googleSubject, "google-sub-77");
    assert.deepEqual(seen.logins, [], "no session before the authenticator");
  });

  test("a wrong proof links nothing and counts as a failed try", async () => {
    const { ctx, seen } = await waitingLink({ mfa: false });
    await assert.rejects(
      link(ctx, { password: "not the password at all 3" }),
      error => error.status === 401 && error.code === "invalid_password"
    );
    assert.equal(seen.linked, null);
    assert.equal(seen.failures, 1);
  });

  test("the 5th wrong try locks the account and says until when", async () => {
    const { ctx, user } = await waitingLink();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await assert.rejects(link(ctx, { code: "000000" }), error => error.code === "invalid_code");
    }
    await assert.rejects(
      link(ctx, { code: "000000" }),
      error => error.status === 429 && error.extra.retryAt === user.locked_until
    );
  });

  test("a locked account is not linked, even with the right code", async () => {
    const { ctx, seen, secret } = await waitingLink({ locked: Date.now() + 60_000 });
    await assert.rejects(
      link(ctx, { code: hotp(secret, stepAt()) }),
      error => error.code === "account_locked"
    );
    assert.equal(seen.linked, null);
  });

  test("another sign-in in progress (not a link) cannot be used to link", async () => {
    const { ctx, challenges, secret } = await waitingLink();
    for (const challenge of challenges.values()) {
      challenge.kind = "mfa";
    }
    await assert.rejects(
      link(ctx, { code: hotp(secret, stepAt()) }),
      error => error.code === "challenge_expired"
    );
  });
});
