// auth service, enrol start: enrolStart, enrolConfirm, verifySecondFactor, requireFreshCode, and 4 more.
import { HttpError, badRequest } from "../../platform/errors.js";
import {
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  otpauthUri,
  qrDataUri,
  verifyTotp
} from "../../platform/security/totp.js";
import { hashRecovery } from "./auth-service-shared.js";

export async function enrolStart(ctx, request, response) {
  const { challenge, tokenHash } = await ctx.currentChallenge(request, response, "enroll");
  const user = await ctx.store.getAuthUser(challenge.user_id);
  let secret;
  if (challenge.pending_secret_enc) {
    secret = ctx.unseed(user.id, challenge.pending_secret_enc);
  } else {
    secret = generateSecret();
    await ctx.store.setChallengeSecret(tokenHash, ctx.seed(user.id, secret));
  }
  const uri = otpauthUri({ secret, account: user.email, issuer: ctx.issuer });
  return {
    secret: secret.match(/.{1,4}/g).join(" "),
    uri,
    qr: qrDataUri(uri),
    account: user.email,
    issuer: ctx.issuer
  };
}

export async function enrolConfirm(ctx, request, response, { code }) {
  const { challenge, tokenHash } = await ctx.currentChallenge(request, response, "enroll");
  if (!challenge.pending_secret_enc) {
    throw badRequest("Scan the code first.", "no_pending_secret");
  }
  if ((await ctx.store.bumpChallengeAttempts(tokenHash)) > MAX_CHALLENGE_ATTEMPTS) {
    await ctx.store.deleteChallenge(tokenHash);
    throw new HttpError(429, "too_many_attempts", "Too many wrong codes. Sign in again.");
  }
  const user = await ctx.store.getAuthUser(challenge.user_id);
  const secret = ctx.unseed(user.id, challenge.pending_secret_enc);
  const step = verifyTotp(secret, code);
  if (step === null) {
    await ctx.event(user.id, "enrol_failed", "", request);
    throw invalidCode();
  }
  const recoveryCodes = generateRecoveryCodes();
  await ctx.store.enableMfa(
    user.id,
    ctx.seed(user.id, secret),
    step,
    recoveryCodes.map(hashRecovery)
  );
  await ctx.event(user.id, "mfa_enabled", "", request);
  await ctx.completeLogin(request, response, user, challenge.method);
  return { recoveryCodes, user: { id: user.id, name: user.name, email: user.email } };
}

export async function verifySecondFactor(ctx, request, response, { code, recoveryCode }) {
  const { challenge, tokenHash } = await ctx.currentChallenge(request, response, "mfa");
  const user = await ctx.store.getAuthUser(challenge.user_id);
  if (!user || Number(user.locked_until) > Date.now()) {
    throw invalidCode();
  }
  if ((await ctx.store.bumpChallengeAttempts(tokenHash)) > MAX_CHALLENGE_ATTEMPTS) {
    await ctx.store.deleteChallenge(tokenHash);
    await ctx.store.recordLoginFailure(user.id);
    await ctx.event(user.id, "mfa_blocked", "too many attempts", request);
    ctx.identity.clearCookie(response, ctx.identity.names.challenge);
    throw new HttpError(429, "too_many_attempts", "Too many wrong codes. Sign in again.");
  }
  let recoveryLeft = null;
  if (typeof recoveryCode === "string" && recoveryCode.trim()) {
    const accepted =
      normalizeRecoveryCode(recoveryCode).length === 10 &&
      (await ctx.store.consumeRecoveryCode(user.id, hashRecovery(recoveryCode)));
    if (!accepted) {
      await ctx.store.recordLoginFailure(user.id);
      await ctx.event(user.id, "recovery_failed", "", request);
      throw invalidCode();
    }
    recoveryLeft = await ctx.store.countRecoveryCodes(user.id);
    await ctx.event(user.id, "recovery_used", `${recoveryLeft} left`, request);
  } else {
    const step = verifyTotp(ctx.unseed(user.id, user.mfa_secret_enc), code, {
      afterStep: user.mfa_last_step === null ? null : Number(user.mfa_last_step)
    });
    if (step === null || !(await ctx.store.acceptMfaStep(user.id, step))) {
      await ctx.store.recordLoginFailure(user.id);
      await ctx.event(user.id, "mfa_failed", "", request);
      throw invalidCode();
    }
  }
  await ctx.store.deleteChallenge(tokenHash);
  const full = await ctx.completeLogin(request, response, user, challenge.method);
  return { user: { id: full.id, name: full.name, email: full.email }, recoveryLeft };
}

/** Re-authentication for sensitive actions: a fresh authenticator code (replay-protected). */
export async function requireFreshCode(ctx, request, userId, code) {
  const user = await ctx.store.getAuthUser(userId);
  const step = user?.mfa_secret_enc
    ? verifyTotp(ctx.unseed(user.id, user.mfa_secret_enc), code, {
        afterStep: user.mfa_last_step === null ? null : Number(user.mfa_last_step)
      })
    : null;
  if (step === null || !(await ctx.store.acceptMfaStep(user.id, step))) {
    await ctx.event(userId, "stepup_failed", "", request);
    await ctx.store.recordLoginFailure(userId);
    throw invalidCode();
  }
  return user;
}

export async function overview(ctx, userId) {
  const user = await ctx.store.getAuthUser(userId);
  return {
    email: user.email,
    name: user.name,
    tag: user.tag,
    viaGoogle: Boolean(user.via_google),
    hasPassword: Boolean(user.password_hash),
    mfa: Boolean(user.mfa_enabled),
    recoveryRemaining: await ctx.store.countRecoveryCodes(userId),
    events: await ctx.store.recentAuthEvents(userId)
  };
}

/** The profile as the account page and the profile dialog show it. */
export async function profile(ctx, userId) {
  const user = await ctx.store.getProfile(userId);
  return {
    name: user.name,
    tag: user.tag,
    picture: user.picture,
    avatarKind: user.avatar_kind,
    hasGooglePhoto: Boolean(user.google_picture),
    viaGoogle: Boolean(user.via_google)
  };
}

export async function signOutEverywhere(ctx, request, userId) {
  const closed = await ctx.store.deleteSessionsForUser(userId);
  ctx.identity.clearCookie(request.res, ctx.identity.names.session);
  await ctx.event(userId, "logout_all", `${closed} sessions`, request);
  return { closed };
}

export async function logout(ctx, request, response) {
  if (request.user) {
    await ctx.event(request.user.id, "logout", "", request);
  }
  if (request.sessionTokenHash) {
    await ctx.store.deleteSession(request.sessionTokenHash);
  }
  ctx.identity.clearCookie(response, ctx.identity.names.session);
  ctx.identity.clearCookie(response, ctx.identity.names.challenge);
}

const MAX_CHALLENGE_ATTEMPTS = 5;

const invalidCode = () => new HttpError(401, "invalid_code", "This code is not valid.");

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  enrolStart,
  enrolConfirm,
  verifySecondFactor,
  requireFreshCode,
  overview,
  profile,
  signOutEverywhere,
  logout
};
