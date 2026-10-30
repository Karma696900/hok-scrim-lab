import { DomainError } from "../../platform/errors.js";
import { LANES, isFlowborn } from "../heroes/hero-domain.js";
import { randomUUID } from "node:crypto";
import { array, heroIdList, plainObject, text } from "../../platform/validation.js";

/** `null` means "All Roles". */
export function parseLane(value) {
  if (value === undefined || value === null || value === "" || value === "all") {
    return null;
  }
  if (!LANES.includes(value)) {
    throw new DomainError("Choose a valid lane or All Roles.");
  }
  return value;
}

/**
 * Heroes a tier list of this lane is about: available heroes on that lane (one Flowborn form at
 * most). An admin can give a Flowborn form an extra lane; the form whose own Camp lane this is
 * stays the one the lane list shows.
 */
export function lanePool(heroes, lane) {
  const pool = heroes.filter(
    hero => hero.availableGlobal !== false && (lane === null || hero.lanes.includes(lane))
  );
  if (lane === null) {
    return pool;
  }
  const forms = pool.filter(isFlowborn);
  const kept = forms.find(hero => hero.laneSources?.[lane] !== "manual") ?? forms[0];
  return pool.filter(hero => !isFlowborn(hero) || hero === kept);
}

/**
 * Server-side normalisation of a tier list against the current roster:
 *  - ids unknown to the roster table are dropped (they would render as raw ids);
 *  - in a lane list, heroes outside the lane are dropped and only one Flowborn form is kept;
 *  - a hero appears once (first placement wins);
 *  - every available hero of the pool that is not placed lands in Unranked (new heroes arrive there).
 * Without a roster (never synced) only the de-duplication runs, so nothing is lost.
 */
export function normalizeTierList(tierList, heroes) {
  const lane = parseLane(tierList.lane);
  const known = new Map(heroes.map(hero => [hero.id, hero]));
  const pool = lanePool(heroes, lane);
  const allowed = new Set(pool.map(hero => hero.id));
  const hasRoster = heroes.length > 0;
  const seen = new Set();

  const keep = ids =>
    ids.filter(heroId => {
      if (seen.has(heroId)) {
        return false;
      }
      if (hasRoster) {
        if (!known.has(heroId)) {
          return false;
        }
        if (lane !== null && !allowed.has(heroId)) {
          return false;
        }
      }
      seen.add(heroId);
      return true;
    });

  const tiers = tierList.tiers.map(tier => ({ ...tier, heroes: keep(tier.heroes) }));
  const unranked = keep(tierList.unranked);
  if (hasRoster) {
    for (const hero of pool) {
      if (!seen.has(hero.id)) {
        seen.add(hero.id);
        unranked.push(hero.id);
      }
    }
  }
  return { ...tierList, lane, tiers, unranked };
}

const TIER_LIMITS = { name: 80, tiers: 12, label: 24, heroes: 400 };

/**
 * Shape check for a tier list body; roster-aware normalisation happens in
 * features/tier-lists/domain.js.
 */
export function parseTierListInput(body) {
  const input = plainObject(body);
  const tiers = array(input.tiers, "tiers", TIER_LIMITS.tiers).map((tier, index) => {
    plainObject(tier, `tiers[${index}]`);
    const id =
      typeof tier.id === "string" && /^[\w-]{1,40}$/.test(tier.id) ? tier.id : randomUUID();
    return {
      id,
      label: text(tier.label ?? "", `tiers[${index}].label`, { min: 1, max: TIER_LIMITS.label }),
      heroes: heroIdList(tier.heroes ?? [], `tiers[${index}].heroes`, TIER_LIMITS.heroes)
    };
  });
  return {
    name: text(input.name ?? "Untitled tier list", "name", { min: 1, max: TIER_LIMITS.name }),
    lane: input.lane === undefined ? undefined : input.lane,
    tiers,
    unranked: heroIdList(input.unranked ?? [], "unranked", TIER_LIMITS.heroes)
  };
}
