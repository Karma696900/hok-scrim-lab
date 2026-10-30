// What a signed-in person does with their own account: pseudo, photo, password, recovery codes, a copy of their data, erasure.
import { badRequest, HttpError, weakPassword } from "../../platform/errors.js";
import {
  hashPassword,
  normalizePassword,
  passwordIssues,
  verifyPassword
} from "../../platform/security/password.js";
import { generateRecoveryCodes } from "../../platform/security/totp.js";
import { processAvatar } from "../../platform/images/avatar.js";
import { cleanName, hashRecovery } from "./auth-service-shared.js";

export async function renameSelf(ctx, request, userId, { name }) {
  const pseudo = cleanName(name);
  await ctx.store.updateName(userId, pseudo);
  await ctx.event(userId, "pseudo_changed", "", request);
  return ctx.profile(userId);
}

export async function uploadAvatar(ctx, request, userId, { bytes, contentType }) {
  const processed = await processAvatar(bytes, contentType);
  const user = await ctx.store.getProfile(userId);
  await ctx.store.setAvatar(userId, {
    kind: "custom",
    picture: `/avatars/${user.tag}?v=${Date.now()}`,
    bytes: processed
  });
  await ctx.event(userId, "avatar_changed", "custom", request);
  return ctx.profile(userId);
}

/** kind "google": back to the Google photo. kind "none": no photo (initials). */
export async function chooseAvatar(ctx, request, userId, { kind }) {
  const user = await ctx.store.getProfile(userId);
  if (kind === "google") {
    if (!user.google_picture) {
      throw badRequest("This account has no Google photo.", "no_google_photo");
    }
    await ctx.store.setAvatar(userId, { kind: "google", picture: user.google_picture });
  } else if (kind === "none") {
    await ctx.store.setAvatar(userId, { kind: "none", picture: "" });
  } else {
    throw badRequest("Unknown avatar choice.", "invalid_body");
  }
  await ctx.event(userId, "avatar_changed", kind, request);
  return ctx.profile(userId);
}

export async function changePassword(ctx, request, userId, { currentPassword, newPassword, code }) {
  const user = await ctx.store.getAuthUser(userId);
  if (!user.password_hash) {
    throw badRequest("This account signs in with Google and has no password.", "no_password");
  }
  if (
    typeof currentPassword !== "string" ||
    !(await verifyPassword(currentPassword, user.password_hash, {
      pepper: ctx.config.passwordPepper
    }))
  ) {
    await ctx.store.recordLoginFailure(userId);
    throw new HttpError(401, "invalid_password", "The current password is not correct.");
  }
  if (typeof newPassword !== "string") {
    throw badRequest("Choose a new password.", "invalid_password");
  }
  const problems = passwordIssues(newPassword, { email: user.email, name: user.name });
  if (problems.length) {
    throw weakPassword(problems);
  }
  if (normalizePassword(newPassword) === normalizePassword(currentPassword)) {
    throw badRequest("Choose a password you have not used just now.", "same_password");
  }
  // Everything that can be checked without spending the one-time code is checked first.
  await ctx.requireFreshCode(request, userId, code);
  await ctx.store.setPassword(userId, await hashPassword(newPassword, ctx.hashOptions));
  const revoked = await ctx.store.deleteSessionsForUser(userId, request.sessionTokenHash);
  await ctx.event(userId, "password_changed", `${revoked} other sessions closed`, request);
  return { changed: true, otherSessionsClosed: revoked };
}

export async function regenerateRecoveryCodes(ctx, request, userId, { code }) {
  await ctx.requireFreshCode(request, userId, code);
  const recoveryCodes = generateRecoveryCodes();
  await ctx.store.replaceRecoveryCodes(userId, recoveryCodes.map(hashRecovery));
  await ctx.event(userId, "recovery_regenerated", "", request);
  return { recoveryCodes };
}

/** A copy of everything the site holds about the person (GDPR, right of access and portability). */
export async function exportData(ctx, request, userId, { code }) {
  await ctx.requireFreshCode(request, userId, code);
  await ctx.event(userId, "data_exported", "", request);
  return ctx.store.exportUserData(userId);
}

/**
 * Erases the account (GDPR, right to erasure): the password (when there is one) and a fresh authenticator code are
 * asked, as for every step that cannot be undone. What goes with it is in features/auth/data-rights.js.
 */
export async function deleteAccount(ctx, request, userId, { password, code }) {
  const user = await ctx.store.getAuthUser(userId);
  if (
    user.password_hash &&
    (typeof password !== "string" ||
      !(await verifyPassword(password, user.password_hash, {
        pepper: ctx.config.passwordPepper
      })))
  ) {
    await ctx.store.recordLoginFailure(userId);
    throw new HttpError(401, "invalid_password", "The current password is not correct.");
  }
  await ctx.requireFreshCode(request, userId, code);
  const result = await ctx.store.deleteUserAccount(userId);
  ctx.identity.clearCookie(request.res, ctx.identity.names.session);
  ctx.identity.clearCookie(request.res, ctx.identity.names.challenge);
  return result;
}

/** What this file does for the service: bindTo registers them on its context. */
export const onView = {
  renameSelf,
  uploadAvatar,
  chooseAvatar,
  changePassword,
  regenerateRecoveryCodes,
  exportData,
  deleteAccount
};
