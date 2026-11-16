import { HttpError, badRequest } from "../../platform/errors.js";
import { createHash } from "node:crypto";
import { normalizeRecoveryCode } from "../../platform/security/totp.js";

export const hashRecovery = code =>
  createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

/**
 * The account is locked until `lockedUntil` (ms): said plainly, with the time, whatever was typed, so the
 * answer tells nothing about the password or the code (owner, 2026-11-16: players thought their code was
 * wrong). The page writes the time in the person's own clock.
 */
export const lockedOut = lockedUntil =>
  new HttpError(429, "account_locked", "Too many tries on this account. Try again later.", {
    retryAt: Number(lockedUntil)
  });

export const isLocked = user => Number(user.locked_until) > Date.now();

export function cleanName(value) {
  const name = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) {
    throw badRequest("Enter a display name of 1 to 60 characters.", "invalid_name");
  }
  if (/[\u0000-\u001f\u007f<>]/.test(name)) {
    throw badRequest("The display name cannot contain control characters, < or >.", "invalid_name");
  }
  return name;
}
