// The hero an address names, or a 404: the same answer for an id that is malformed and one that is not on the roster.
import { HERO_ID_PATTERN } from "../../platform/validation.js";
import { notFound } from "../../platform/errors.js";

export const requireHero = async (ctx, heroId) => {
  if (!HERO_ID_PATTERN.test(heroId)) {
    throw notFound("Hero not found.");
  }
  const hero = (await ctx.store.readHeroes()).find(entry => entry.id === heroId);
  if (!hero) {
    throw notFound("Hero not found.");
  }
  return hero;
};
