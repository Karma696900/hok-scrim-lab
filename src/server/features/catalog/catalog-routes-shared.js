import { notFound } from "../../platform/errors.js";

export const positive = (value, what = "Not found.") => {
  const id = Number(value);
  if (!/^\d{1,10}$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1) {
    throw notFound(what);
  }
  return id;
};
