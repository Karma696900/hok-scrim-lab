import { badRequest } from "../../platform/errors.js";
import { createHash } from "node:crypto";
import { normalizeRecoveryCode } from "../../platform/security/totp.js";

export const hashRecovery = code =>
  createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

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
