// The official ratings: one list per lane with six fixed tiers, from SS (the best) to D. Pure: the
// caller gives the roster. The same rules as any lane list (see domain.js) apply to the heroes: only
// the heroes of that lane, one Flowborn form, nobody twice, the heroes that are not placed are in
// Unranked.
import { TIERS } from "../../../shared/tier-names.js";
import { badRequest } from "../../platform/errors.js";
import { HERO_ID_PATTERN } from "../../platform/validation.js";
import { LANES } from "../heroes/hero-domain.js";
import { normalizeTierList } from "./tier-list-domain.js";

export const OFFICIAL_TIERS = TIERS;
const HEROES_PER_TIER_MAX = 200;

/** The list of a lane as it is saved (or a new one), with the six tiers in their order and every hero of the lane placed. */
export function officialList(lane, saved, heroes) {
  const placed = new Map((saved?.tiers ?? []).map(tier => [tier.label, tier.heroes ?? []]));
  const list = normalizeTierList(
    {
      lane,
      tiers: OFFICIAL_TIERS.map(label => ({ id: label, label, heroes: placed.get(label) ?? [] })),
      unranked: []
    },
    heroes
  );
  return { lane, tiers: list.tiers, unranked: list.unranked };
}

/** What an editor sends for a lane: the heroes of each tier (tiers that are not sent are empty). */
export function parseOfficialInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("The tiers must be a JSON object.", "invalid_body");
  }
  const { tiers } = body;
  if (!Array.isArray(tiers) || tiers.length > OFFICIAL_TIERS.length) {
    throw badRequest("Send the heroes of each tier, from SS to D.", "invalid_body");
  }
  const seenLabels = new Set();
  const seenHeroes = new Set();
  return tiers.map(entry => {
    if (!entry || !OFFICIAL_TIERS.includes(entry.label) || seenLabels.has(entry.label)) {
      throw badRequest("The tiers are SS, S, A, B, C and D, each once.", "invalid_body");
    }
    seenLabels.add(entry.label);
    if (!Array.isArray(entry.heroes) || entry.heroes.length > HEROES_PER_TIER_MAX) {
      throw badRequest("The heroes of a tier must be a list of hero ids.", "invalid_body");
    }
    for (const heroId of entry.heroes) {
      if (typeof heroId !== "string" || !HERO_ID_PATTERN.test(heroId) || seenHeroes.has(heroId)) {
        throw badRequest("A hero can be in one tier only, by its id.", "invalid_body");
      }
      seenHeroes.add(heroId);
    }
    return { label: entry.label, heroes: entry.heroes };
  });
}

/** The tier of a hero in each lane it can play and was rated in: { "Clash Lane": "A", "Jungle": "S" }. */
export function ratingsOf(heroId, lanesOfHero, documents) {
  const ratings = {};
  for (const lane of LANES) {
    if (!lanesOfHero.includes(lane)) {
      continue;
    }
    const tier = (documents.get(lane)?.tiers ?? []).find(entry => entry.heroes.includes(heroId));
    if (tier) {
      ratings[lane] = tier.label;
    }
  }
  return ratings;
}
