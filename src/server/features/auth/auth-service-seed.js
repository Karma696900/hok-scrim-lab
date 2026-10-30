// auth service, seed: seed, unseed, event, openChallenge, and 11 more.
import { HttpError, badRequest, forbidden, weakPassword } from "../../platform/errors.js";
import {
  burnPasswordCheck,
  hashPassword,
  needsRehash,
  passwordIssues,
  verifyPassword
} from "../../platform/security/password.js";
import { hashToken } from "../../platform/http/identity.js";
import { randomBytes } from "node:crypto";
import { cleanName } from "./auth-service-shared.js";

export const seed = (ctx, userId, secret) => ctx.secretBox.encrypt(secret, `totp:${userId}`);

export const unseed = (ctx, userId, payload) => ctx.secretBox.decrypt(payload, `totp:${userId}`);

export const event = (ctx, userId, name, detail, request) =>
  ctx.store.logAuthEvent(userId, name, detail, request?.ip ?? "");

export async function openChallenge(ctx, response, user, kind, method) {
  const token = randomBytes(32).toString("base64url");
  await ctx.store.createChallenge({
    tokenHash: hashToken(token),
    userId: user.id,
    kind,
    method,
    ttlMs: CHALLENGE_TTL_MS
  });
  ctx.identity.setCookie(response, ctx.identity.names.challenge, token, CHALLENGE_TTL_MS / 1000);
}

export async function currentChallenge(ctx, request, response, kind) {
  const token = ctx.identity.readCookies(request)[ctx.identity.names.challenge];
  const challenge = token ? await ctx.store.getChallenge(hashToken(token)) : null;
  if (!challenge || (kind && challenge.kind !== kind)) {
    ctx.identity.clearCookie(response, ctx.identity.names.challenge);
    throw new HttpError(401, "challenge_expired", "Your sign-in expired. Start again.");
  }
  return { challenge, tokenHash: hashToken(token) };
}

export const incomplete = user =>
  user.profile_complete === 0 || user.profile_complete === false || user.profileComplete === false;

/**
 * The step the browser must show next for this account: its profile first (Google accounts), then
 * the second factor.
 */
export const nextStep = user =>
  incomplete(user) ? "profile" : user.mfa_enabled || user.mfaEnabled ? "mfa" : "enroll";

export async function completeLogin(ctx, request, response, userRow, method) {
  const user = {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    tag: userRow.tag ?? "",
    picture: userRow.picture ?? "",
    isGuest: false
  };
  if (request.user?.isGuest) {
    await ctx.store.mergeGuestInto(request.user.id, user.id);
  }
  if (request.sessionTokenHash) {
    await ctx.store.deleteSession(request.sessionTokenHash);
  }
  await ctx.identity.startSession(response, user);
  ctx.identity.clearCookie(response, ctx.identity.names.challenge);
  await ctx.store.clearLoginFailures(user.id);
  await ctx.event(user.id, "login", method, request);
  return user;
}

/** Password OR Google was accepted: open the second-factor (or enrolment) step. */
export async function beginSecondFactor(ctx, request, response, userRow, method) {
  const step = nextStep(userRow);
  await ctx.openChallenge(response, userRow, step, method);
  await ctx.event(
    userRow.id,
    step === "mfa" ? "first_factor" : step === "profile" ? "profile_start" : "enrol_start",
    method,
    request
  );
  return { step };
}

export async function register(ctx, request, response, { email, name, password }) {
  if (!ctx.config.registrationEnabled) {
    throw forbidden("Account creation is closed on this server.", "registration_closed");
  }
  const cleanedEmail = cleanEmail(email);
  const displayName = cleanName(name);
  if (typeof password !== "string") {
    throw badRequest("Choose a password.", "invalid_password");
  }
  const problems = passwordIssues(password, { email: cleanedEmail, name: displayName });
  if (problems.length) {
    throw weakPassword(problems);
  }
  // Administrator addresses cannot be claimed through the public form (their email is not
  // verified): use scripts/accounts/account.js.
  if (ctx.config.adminEmails.has(cleanedEmail)) {
    throw forbidden(
      "This address is reserved. Sign in with Google or ask the server owner.",
      "reserved_email"
    );
  }
  const passwordHash = await hashPassword(password, ctx.hashOptions);
  const user = await ctx.store.createLocalUser({
    email: cleanedEmail,
    loginEmail: cleanedEmail,
    name: displayName,
    passwordHash
  });
  await ctx.event(user.id, "register", "", request);
  return ctx.beginSecondFactor(request, response, { id: user.id, mfa_enabled: false }, "password");
}

export async function login(ctx, request, response, { email, password }) {
  const loginEmail = normalizeEmail(email);
  if (
    typeof password !== "string" ||
    !loginEmail ||
    loginEmail.length > 254 ||
    password.length > 1024
  ) {
    throw invalidCredentials();
  }
  const user = await ctx.store.getLoginUser(loginEmail);
  if (!user || !user.password_hash) {
    await burnPasswordCheck(password, ctx.hashOptions); // same cost as a real check
    throw invalidCredentials();
  }
  const valid = await verifyPassword(password, user.password_hash, {
    pepper: ctx.config.passwordPepper
  });
  if (Number(user.locked_until) > Date.now()) {
    await ctx.event(user.id, "login_blocked", "locked", request);
    throw invalidCredentials(); // identical answer: a lock is not revealed to someone guessing
  }
  if (!valid) {
    const { failed, lockedUntil } = await ctx.store.recordLoginFailure(user.id);
    await ctx.event(
      user.id,
      "login_failed",
      lockedUntil ? `locked after ${failed}` : `attempt ${failed}`,
      request
    );
    throw invalidCredentials();
  }
  if (needsRehash(user.password_hash, ctx.hashOptions)) {
    await ctx.store.setPassword(user.id, await hashPassword(password, ctx.hashOptions));
  }
  return ctx.beginSecondFactor(request, response, user, "password");
}

/** GET: where is this browser in the sign-in? */
export async function challengeStatus(ctx, request, response) {
  try {
    const { challenge } = await ctx.currentChallenge(request, response);
    const user = await ctx.store.getAuthUser(challenge.user_id);
    return { step: challenge.kind, email: user?.email ?? "", method: challenge.method };
  } catch (error) {
    if (error.code === "challenge_expired") {
      return { step: "none" };
    }
    throw error;
  }
}

/**
 * Google accounts, first time: the player chooses their pseudo and a password (twice: checked
 * here as well as in the page). Google's own name is never used. The second factor follows.
 */
export async function completeProfile(ctx, request, response, { name, password, confirm }) {
  const { challenge } = await ctx.currentChallenge(request, response, "profile");
  const user = await ctx.store.getAuthUser(challenge.user_id);
  if (!user || !incomplete(user)) {
    throw badRequest("Your profile is already complete.", "profile_complete");
  }
  const pseudo = cleanName(name);
  if (typeof password !== "string") {
    throw badRequest("Choose a password.", "invalid_password");
  }
  if (password !== confirm) {
    throw badRequest("The two passwords are different.", "password_mismatch");
  }
  const problems = passwordIssues(password, { email: user.email, name: pseudo });
  if (problems.length) {
    throw weakPassword(problems);
  }
  const done = await ctx.store.completeProfile(user.id, {
    name: pseudo,
    passwordHash: await hashPassword(password, ctx.hashOptions),
    loginEmail: normalizeEmail(user.email)
  });
  if (!done) {
    throw badRequest("Your profile is already complete.", "profile_complete");
  }
  await ctx.event(user.id, "profile_completed", "", request);
  const fresh = await ctx.store.getAuthUser(user.id);
  return ctx.beginSecondFactor(request, response, fresh, challenge.method);
}

const CHALLENGE_TTL_MS = 10 * 60_000;

const EMAIL_PATTERN = /^[^\s@<>"'`\\,;:()[\]]{1,64}@[^\s@<>"'`\\,;:()[\]]{1,190}\.[A-Za-z]{2,24}$/;

export const normalizeEmail = value =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

const invalidCredentials = () =>
  new HttpError(401, "invalid_credentials", "Invalid email or password.");

export function cleanEmail(value) {
  const email = normalizeEmail(value);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw badRequest("Enter a valid email address.", "invalid_email");
  }
  return email;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  seed,
  unseed,
  event,
  openChallenge,
  currentChallenge,
  completeLogin,
  beginSecondFactor,
  register,
  login,
  challengeStatus,
  completeProfile
};
