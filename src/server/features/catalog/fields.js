import { badRequest } from "../../platform/errors.js";
import { cleanText, integer as whole, plainObject } from "../../platform/validation.js";

export { cleanText as text, plainObject as object, whole };

// The small checks every body of the catalogue is read with. Each takes the value, the name to give
// it in the message, and returns it clean or throws a 400 that says what is wrong.

export const number = (value, label, { min = -1_000_000, max = 1_000_000 } = {}) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw badRequest("{label} must be a number between {min} and {max}.", "invalid_body", {
      label,
      min,
      max
    });
  }
  return Math.round(value * 1000) / 1000;
};

export const numbers = (value, label, max) => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > max) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  return value.map((entry, index) => number(entry, `${label}[${index}]`));
};

export const ids = (value, label, known, max = 12) => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > max) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  const list = value.map(entry => whole(entry, label, { min: 1, max: 2_000_000_000 }));
  if (new Set(list).size !== list.length) {
    throw badRequest("{label} lists the same entry twice.", "invalid_body", { label });
  }
  for (const id of list) {
    if (!known.has(id)) {
      throw badRequest("{label} contains an entry that does not exist.", "unknown_reference", {
        label
      });
    }
  }
  return list;
};

/** true or false; a missing value is false. */
export const flag = (value, label) => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw badRequest("{label} must be true or false.", "invalid_body", { label });
  }
  return value;
};
