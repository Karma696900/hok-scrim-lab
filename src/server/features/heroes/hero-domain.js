import { badRequest } from "../../platform/errors.js";
import { plainObject, text } from "../../platform/validation.js";
import { HERO_ALIAS_MAX, heroNameKey } from "../../../shared/vod-model.js";

// Hero helpers shared by drafts and tier lists. Pure.

export const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

/** Camp ships Flowborn as five role forms named "Flowborn (Tank)", "Flowborn (Mage)", ... */
export const isFlowborn = hero => /^Flowborn(?:\s*\(|$)/i.test(hero?.name ?? "");

/**
 * Name shown in tier lists and hero pages: every Flowborn form reads "Flowborn" (the lane is shown
 * as a badge).
 */
export function displayName(hero) {
  return isFlowborn(hero) ? "Flowborn" : hero.name;
}

export function presentHero(hero) {
  return { ...hero, displayName: displayName(hero), isFlowborn: isFlowborn(hero) };
}

export function parseLaneAddition(body) {
  const input = plainObject(body);
  if (!LANES.includes(input.lane)) {
    throw badRequest("lane must be one of the five Honor of Kings lanes.", "invalid_body");
  }
  return {
    lane: input.lane,
    note: input.note === undefined ? "" : text(input.note, "note", { min: 0, max: 200 })
  };
}

/** Another name of a hero: the text as typed (shown back) and the key it is matched by. */
export function parseHeroAlias(body) {
  const input = plainObject(body);
  const alias = text(input.alias, "alias", { min: 2, max: HERO_ALIAS_MAX });
  const key = heroNameKey(alias);
  if (key.length < 2) {
    throw badRequest("An alias needs at least two letters or digits.", "invalid_body");
  }
  return { alias, key };
}
