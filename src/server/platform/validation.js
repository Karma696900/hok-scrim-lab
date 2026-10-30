// Request validation. Hand-written on purpose (see docs/DECISIONS.md): the payloads are few, the
// rules are domain-specific (hero ids, team names, draft shape) and a schema library would add a
// dependency without removing the domain checks. This file holds the helpers every feature uses;
// each feature parses its own requests (features/<name>/validation.js).
import { badRequest } from "./errors.js";

export const HERO_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function plainObject(value, label = "Request body") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("{label} must be a JSON object.", "invalid_body", { label });
  }
  return value;
}

export function text(value, label, { min = 0, max }) {
  if (typeof value !== "string") {
    throw badRequest("{label} must be a string.", "invalid_body", { label });
  }
  const trimmed = value.normalize("NFC").trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw badRequest("{label} must be between {min} and {max} characters.", "invalid_body", {
      label,
      min,
      max
    });
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw badRequest("{label} contains control characters.", "invalid_body", { label });
  }
  return trimmed;
}

/**
 * A text field of a body that may be left out: trimmed, runs of spaces collapsed, no control characters; "" when it
 * is missing. `min` and `max` are lengths, `required` refuses a missing or blank field.
 */
export function cleanText(value, label, { min, max, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw badRequest("{label} is required.", "invalid_body", { label });
    }
    return "";
  }
  if (typeof value !== "string") {
    throw badRequest("{label} must be a string.", "invalid_body", { label });
  }
  const clean = value
    .normalize("NFC")
    .trim()
    .replace(/[ \t]+/g, " ");
  if (/[\u0000-\u0008\u000b-\u001f\u007f<>]/.test(clean)) {
    throw badRequest("{label} contains control characters.", "invalid_body", { label });
  }
  if (required && !clean) {
    throw badRequest("{label} is required.", "invalid_body", { label });
  }
  if (clean.length > max && !min) {
    throw badRequest("{label} must be at most {max} characters.", "invalid_body", { label, max });
  }
  const lowest = Math.max(min ?? 0, required ? 1 : 0);
  if (clean.length > max || clean.length < lowest) {
    throw badRequest("{label} must be between {min} and {max} characters.", "invalid_body", {
      label,
      min: lowest,
      max
    });
  }
  return clean;
}

/** One of the allowed values, or `fallback` when the field is missing. */
export function choice(value, label, allowed, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!allowed.includes(value)) {
    throw badRequest("{label} is not one of the allowed values.", "invalid_body", { label });
  }
  return value;
}

export function integer(value, label, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest("{label} must be a whole number between {min} and {max}.", "invalid_body", {
      label,
      min,
      max
    });
  }
  return value;
}

export function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  return value;
}

export function heroIdList(value, label, max, knownHeroIds) {
  return array(value, label, max).map(item => {
    if (typeof item !== "string" || !HERO_ID_PATTERN.test(item)) {
      throw badRequest("{label} contains an invalid hero id.", "invalid_body", { label });
    }
    if (knownHeroIds && !knownHeroIds.has(item)) {
      throw badRequest("{label} contains an unknown hero id: {item}.", "unknown_hero", {
        label,
        item
      });
    }
    return item;
  });
}

export function parseUuid(value, label = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw badRequest("Invalid {label}.", "invalid_id", { label });
  }
  return value;
}

export function parsePagination(query, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? defaultSize : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    throw badRequest("page must be a positive whole number.", "invalid_query");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxSize) {
    throw badRequest("pageSize must be between 1 and {maxSize}.", "invalid_query", { maxSize });
  }
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

/** Optional optimistic-concurrency token sent by clients that hold a copy of the series. */
export function parseExpectedVersion(body) {
  const value = body?.expectedVersion;
  if (value === undefined || value === null) {
    return null;
  }
  return integer(value, "expectedVersion", { min: 0, max: 2_000_000_000 });
}

export function httpsUrl(value, label) {
  const raw = text(value, label, { min: 8, max: 500 });
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw badRequest("{label} must be a valid URL.", "invalid_body", { label });
  }
  if (parsed.protocol !== "https:") {
    throw badRequest("{label} must be an https URL.", "invalid_body", { label });
  }
  return parsed.toString();
}

export function count(value, label, max) {
  const number =
    typeof value === "string" && /^\d{1,7}$/.test(value.trim()) ? Number(value) : value;
  return integer(number, label, { min: 0, max });
}

export function queryText(value, label, max) {
  if (typeof value !== "string") {
    throw badRequest("{label} must be a single value.", "invalid_query", { label });
  }
  const trimmed = value.trim();
  if (trimmed.length > max || /[\u0000-\u001f]/.test(trimmed)) {
    throw badRequest("{label} is too long or invalid.", "invalid_query", { label });
  }
  return trimmed;
}

export function queryDate(value, label) {
  const raw = queryText(value, label, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ||
    new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw
  ) {
    throw badRequest("{label} must be a date like 2026-09-30.", "invalid_query", { label });
  }
  return raw;
}

export function parseQueryChoice(query, key, allowed, fallback) {
  if (query[key] === undefined || query[key] === "") {
    return fallback;
  }
  const value = queryText(query[key], key, 20);
  if (!allowed.includes(value)) {
    throw badRequest("{key} must be one of: {value}.", "invalid_query", {
      key,
      value: allowed.join(", ")
    });
  }
  return value;
}

export function parseQueryText(query, key, max = 60) {
  return query[key] === undefined || query[key] === "" ? "" : queryText(query[key], key, max);
}
