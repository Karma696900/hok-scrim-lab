import { badRequest } from "../../platform/errors.js";

// Real competitive series, as an administrator enters them. Pure: validation, normalisation and the
// statistics of a hero.

export const TEAM_MAX = 80;

export const clean = (value, label, { max, min = 0, required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) {
      throw badRequest("{label} is required.", "invalid_body", { label });
    }
    return "";
  }
  if (typeof value !== "string") {
    throw badRequest("{label} must be a string.", "invalid_body", { label });
  }
  const text = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (/[\u0000-\u001f\u007f<>]/.test(text)) {
    throw badRequest("{label} contains control characters.", "invalid_body", { label });
  }
  if (text.length > max || text.length < min || (required && !text)) {
    throw badRequest("{label} must be between {min} and {max} characters.", "invalid_body", {
      label,
      min: Math.max(min, required ? 1 : 0),
      max
    });
  }
  return text;
};
