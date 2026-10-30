// API keys, the pure part: how a key is made, read from a request and checked, and what a person may ask
// when they create one. Nothing here touches the database or the network.
import { createHash, randomBytes } from "node:crypto";
import {
  API_KEY_HINT_LENGTH,
  API_KEY_LIFETIMES,
  API_KEY_NAME_MAX,
  API_KEY_PATTERN,
  API_KEY_PREFIX,
  API_SCOPES
} from "../../../shared/access-rules.js";
import { badRequest } from "../../platform/errors.js";
import { plainObject, text } from "../../platform/validation.js";

const DAY = 86_400_000;

/** The SHA-256 of a key: all that is stored (a key is 256 random bits, so nothing slower is needed). */
export const hashKey = token => createHash("sha256").update(token).digest("hex");

/** A new key: the secret (shown once), what is kept to recognise it, and what is stored. */
export function generateKey() {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hint: token.slice(0, API_KEY_HINT_LENGTH), hash: hashKey(token) };
}

/**
 * The key of a request: `Authorization: Bearer <key>` (or the `X-API-Key` header). Never the address
 * (addresses end up in logs and in the history of browsers). Null when there is none, or when what is
 * sent cannot be a key (no database lookup is made for it).
 */
export function keyFromRequest(request) {
  const authorization = request.get("authorization") ?? "";
  const bearer = /^Bearer[ ]+(\S+)$/i.exec(authorization)?.[1];
  const token = bearer ?? request.get("x-api-key") ?? "";
  return API_KEY_PATTERN.test(token) ? token : null;
}

/** Whether a key still opens the API at `now` (a revoked key never does). */
export const isUsable = (key, now) =>
  key.revokedAt === null && (key.expiresAt === null || key.expiresAt > now);

/** The scopes of a key as stored (a comma-separated list), only the ones that exist. */
export const scopesOf = stored =>
  String(stored)
    .split(",")
    .filter(scope => API_SCOPES.includes(scope));

/** What a person asks to create: a name, what the key can read, how long it lives. */
export function parseKeyRequest(body, now = Date.now()) {
  const input = plainObject(body, "The key");
  const name = text(input.name ?? "", "name", { min: 1, max: API_KEY_NAME_MAX });
  let scopes = API_SCOPES;
  if (input.scopes !== undefined) {
    if (
      !Array.isArray(input.scopes) ||
      !input.scopes.length ||
      input.scopes.some(scope => !API_SCOPES.includes(scope))
    ) {
      throw badRequest("Choose at least one thing the key can read.", "invalid_body");
    }
    scopes = API_SCOPES.filter(scope => input.scopes.includes(scope));
  }
  const lifetime = input.lifetimeDays === undefined ? 90 : input.lifetimeDays;
  if (!API_KEY_LIFETIMES.includes(lifetime)) {
    throw badRequest("Choose how long the key lives: {choices} days (0 = never).", "invalid_body", {
      choices: API_KEY_LIFETIMES.join(", ")
    });
  }
  return { name, scopes, expiresAt: lifetime ? now + lifetime * DAY : null };
}

/** A key as the person sees it in their list: never its secret, nor its hash. */
export const presentKey = (row, now = Date.now()) => ({
  id: row.id,
  name: row.name,
  hint: row.hint,
  scopes: scopesOf(row.scopes),
  createdAt: Number(row.created_at),
  lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
  expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
  active: isUsable(
    {
      revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
      expiresAt: row.expires_at === null ? null : Number(row.expires_at)
    },
    now
  )
});
