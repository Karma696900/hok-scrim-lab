// auth service, recover: forgotPassword, beginLink, confirmLink, checkSecondFactor.
// A forgotten password is changed on the site with the authenticator (the site never sends mail), and a
// Google sign-in that finds an account of the site with the same address links Google to it after a proof,
// instead of making a second, empty account (owner, 2026-11-16).
import { HttpError, badRequest, conflict, weakPassword } from "../../platform/errors.js";
import { hashPassword, passwordIssues, verifyPassword } from "../../platform/security/password.js";
import { normalizeRecoveryCode, verifyTotp } from "../../platform/security/totp.js";
import { hashRecovery, isLocked, lockedOut } from "./auth-service-shared.js";
import { normalizeEmail } from "./auth-service-seed.js";
import { MAX_CHALLENGE_ATTEMPTS, countAttempt, invalidCode } from "./auth-service-enrol-start.js";

/**
 * The authenticator code or a recovery code (spent once), checked for `user`. Nothing is logged here: the
 * caller names what failed.
 */
export async function checkSecondFactor(ctx, user, { code, recoveryCode }) {
  if (typeof recoveryCode === "string" && recoveryCode.trim()) {
    const accepted =
      normalizeRecoveryCode(recoveryCode).length === 10 &&
      Boolean(await ctx.store.consumeRecoveryCode(user.id, hashRecovery(recoveryCode)));
    return {
      accepted,
      via: "recovery",
      recoveryLeft: accepted ? await ctx.store.countRecoveryCodes(user.id) : null
    };
  }
  const step = user.mfa_secret_enc
    ? verifyTotp(ctx.unseed(user.id, user.mfa_secret_enc), code, {
        afterStep: user.mfa_last_step === null ? null : Number(user.mfa_last_step)
      })
    : null;
  return {
    accepted: step !== null && Boolean(await ctx.store.acceptMfaStep(user.id, step)),
    via: "code",
    recoveryLeft: null
  };
}

/** One answer for every refusal but a lock: it never says whether the address has an account. */
const refused = () =>
  new HttpError(401, "reset_refused", "This email and this code do not go together.");

/**
 * The sign-in email, a fresh authenticator code (or a recovery code) and a new password. Only an account
 * with an authenticator can do it: nothing else proves who asks. Every session of the account is closed;
 * the person signs in again with the new password and a new code.
 */
export async function forgotPassword(
  ctx,
  request,
  _response,
  { email, code, recoveryCode, newPassword }
) {
  const loginEmail = normalizeEmail(email);
  if (typeof newPassword !== "string") {
    throw badRequest("Choose a new password.", "invalid_password");
  }
  // checked before the code is spent, and without the account (its pseudo would say it exists)
  const problems = passwordIssues(newPassword, { email: loginEmail });
  if (problems.length) {
    throw weakPassword(problems);
  }
  const user =
    loginEmail && loginEmail.length <= 254 ? await ctx.store.getLoginUser(loginEmail) : null;
  // a lock is said before the authenticator is looked at: the answer does not tell whether it has one
  if (user?.password_hash && isLocked(user)) {
    await ctx.event(user.id, "reset_blocked", "locked", request);
    throw lockedOut(user.locked_until);
  }
  if (!user || !user.password_hash || !user.mfa_enabled || !user.mfa_secret_enc) {
    throw refused();
  }
  const proof = await checkSecondFactor(ctx, user, { code, recoveryCode });
  if (!proof.accepted) {
    const { lockedUntil } = await ctx.store.recordLoginFailure(user.id);
    await ctx.event(user.id, "reset_failed", proof.via, request);
    throw lockedUntil ? lockedOut(lockedUntil) : refused();
  }
  await ctx.store.setPassword(user.id, await hashPassword(newPassword, ctx.hashOptions));
  await ctx.store.clearLoginFailures(user.id);
  const closed = await ctx.store.deleteSessionsForUser(user.id);
  await ctx.event(user.id, "password_reset", `${proof.via}, ${closed} sessions closed`, request);
  return { reset: true, recoveryLeft: proof.recoveryLeft };
}

const sealContext = userId => `link:${userId}`;

/**
 * Google answered for an address that an account of the site already uses: the sign-in waits for the proof
 * that this account is the person's. The Google account waits in the challenge, sealed.
 */
export async function beginLink(ctx, request, response, user, { googleSubject, picture }) {
  const tokenHash = await ctx.openChallenge(response, user, "link", "google");
  await ctx.store.setChallengeSecret(
    tokenHash,
    ctx.secretBox.encrypt(JSON.stringify({ googleSubject, picture }), sealContext(user.id))
  );
  await ctx.event(user.id, "link_start", "google", request);
  return { step: "link" };
}

/**
 * The proof: the authenticator code (or a recovery code) when the account has one, its password otherwise.
 * Google + the code are the two factors: the person is signed in. Google + the password: the authenticator
 * is set up next, as for every account without one.
 */
export async function confirmLink(ctx, request, response, { code, recoveryCode, password }) {
  const { challenge, tokenHash } = await ctx.currentChallenge(request, response, "link");
  const user = await ctx.store.getAuthUser(challenge.user_id);
  if (!user) {
    throw invalidCode();
  }
  if (isLocked(user)) {
    throw lockedOut(user.locked_until);
  }
  if ((await countAttempt(ctx, response, tokenHash)) > MAX_CHALLENGE_ATTEMPTS) {
    await ctx.store.deleteChallenge(tokenHash);
    await ctx.store.recordLoginFailure(user.id);
    await ctx.event(user.id, "link_blocked", "too many attempts", request);
    ctx.identity.clearCookie(response, ctx.identity.names.challenge);
    throw new HttpError(429, "too_many_attempts", "Too many wrong codes. Sign in again.");
  }
  const withCode = Boolean(user.mfa_enabled);
  const accepted = withCode
    ? (await checkSecondFactor(ctx, user, { code, recoveryCode })).accepted
    : typeof password === "string" &&
      Boolean(user.password_hash) &&
      (await verifyPassword(password, user.password_hash, { pepper: ctx.config.passwordPepper }));
  if (!accepted) {
    const { lockedUntil } = await ctx.store.recordLoginFailure(user.id);
    await ctx.event(user.id, "link_failed", withCode ? "code" : "password", request);
    if (lockedUntil) {
      throw lockedOut(lockedUntil);
    }
    throw withCode
      ? invalidCode()
      : new HttpError(401, "invalid_password", "This password is not the one of this account.");
  }
  const google = JSON.parse(
    ctx.secretBox.decrypt(challenge.pending_secret_enc, sealContext(user.id))
  );
  if (!(await ctx.store.linkGoogle(user.id, google))) {
    throw conflict("This Google account is already linked to another account.", "google_taken");
  }
  await ctx.store.deleteChallenge(tokenHash);
  await ctx.event(user.id, "google_linked", "", request);
  if (withCode) {
    await ctx.completeLogin(request, response, user, "google");
    return { step: "done" };
  }
  return ctx.beginSecondFactor(request, response, user, "google");
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { forgotPassword, beginLink, confirmLink };
