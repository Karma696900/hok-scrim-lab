// catalog routes, heroes profile: requireHero, variantOf.
import { notFound } from "../../platform/errors.js";
import { requireHero } from "../heroes/require-hero.js";

export { requireHero };

// ---- heroes: profile (base stats, spells, tags) and recommended builds ------------------------
export const variantOf = value => {
  const variant = Number(value);
  if (variant !== 1 && variant !== 2) {
    throw notFound("Build not found.");
  }
  return variant;
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { requireHero };
