// The public tier list of each lane. Tournaments first: among the heroes played enough in the lane,
// the best score is SS, the worst D, and six equal bands lie between them. A hero played too little
// takes the tier the editors gave it; a hero with neither is "not ranked yet".
import { TIERS } from "../../../shared/tier-names.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

export const LANE_SLUGS = Object.freeze({
  "Clash Lane": "clash",
  Jungle: "jungle",
  "Mid Lane": "mid",
  "Farm Lane": "farm",
  Roamer: "roam"
});

/** The tier of a score between the worst and the best of its lane: six equal bands, SS at the top. */
export function tierOf(score, worst, best) {
  if (!(best > worst)) {
    return "SS";
  }
  const place = (score - worst) / (best - worst);
  const band = Math.min(5, Math.floor(place * 6 + 1e-9));
  return TIERS[5 - Math.max(0, band)];
}

/** The editors' tiers of a lane, from a Map or a plain object of official documents: { heroId: "A" }. */
function editorTiers(official, lane) {
  const document = official instanceof Map ? official.get(lane) : official?.[lane];
  const tiers = {};
  for (const tier of document?.tiers ?? []) {
    if (!TIERS.includes(tier.label)) {
      continue;
    }
    for (const heroId of tier.heroes ?? []) {
      tiers[heroId] ??= tier.label;
    }
  }
  return tiers;
}

function laneTierList(lane, { lanes, official, heroes, minGames }) {
  const names = new Map(heroes.map(hero => [hero.id, hero.name ?? hero.id]));
  const nameOf = id => String(names.get(id) ?? id);
  const entries = lanes.find(item => item.lane === lane)?.all?.byWinRate ?? [];
  const byHero = new Map(entries.map(entry => [entry.heroId, entry]));
  const ranked = entries.filter(entry => entry.games >= minGames && Number.isFinite(entry.score));
  const scores = ranked.map(entry => entry.score);
  const [worst, best] = [Math.min(...scores), Math.max(...scores)];
  const editors = editorTiers(official, lane);
  const tiers = TIERS.map(label => ({ label, heroes: [] }));
  const place = (label, hero) => tiers[TIERS.indexOf(label)].heroes.push(hero);
  const done = new Set();
  for (const entry of ranked) {
    done.add(entry.heroId);
    place(tierOf(entry.score, worst, best), {
      heroId: entry.heroId,
      source: "tournaments",
      games: entry.games,
      winRate: entry.winRate ?? null,
      pickRate: entry.pickRate ?? null,
      score: entry.score
    });
  }
  const candidates = new Set([
    ...heroes.filter(hero => (hero.lanes ?? []).includes(lane)).map(hero => hero.id),
    ...Object.keys(editors)
  ]);
  const unranked = [];
  for (const heroId of candidates) {
    if (done.has(heroId)) {
      continue;
    }
    if (!editors[heroId]) {
      unranked.push(heroId);
      continue;
    }
    const entry = byHero.get(heroId);
    place(editors[heroId], {
      heroId,
      source: "editors",
      games: entry?.games ?? 0,
      winRate: entry?.winRate ?? null,
      pickRate: entry?.pickRate ?? null,
      score: null
    });
  }
  const order = (a, b) =>
    (b.score ?? -1) - (a.score ?? -1) || nameOf(a.heroId).localeCompare(nameOf(b.heroId));
  for (const tier of tiers) {
    tier.heroes.sort(order);
  }
  unranked.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return { lane, slug: LANE_SLUGS[lane], tiers, unranked };
}

/**
 * The public tier list of the five lanes.
 * lanes: popularHeroes(...).lanes; official: the editors' documents by lane (Map or object);
 * heroes: [{ id, name, lanes }]; minGames: the games a hero needs before tournaments rank it.
 */
export function publicTierList({
  lanes = [],
  official = {},
  heroes = [],
  minGames = 10,
  updatedAt = null
}) {
  return {
    lanes: LANES.map(lane => laneTierList(lane, { lanes, official, heroes, minGames })),
    updatedAt
  };
}
