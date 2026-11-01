// The public tier list as the site shows it, read from the database: the tournament games of the
// last three months (like /popular), the editors' ratings, the roster. The same answer feeds the
// /tier-list page, the hero page and the editors' page, so a hero has one tier everywhere.
import { createHash } from "node:crypto";
import { defaultPeriod } from "../../../shared/period.js";
import { popularHeroes } from "../tournaments/popular.js";
import { heroFacts } from "../tournaments/popular-facts.js";
import { SCORE } from "../tournaments/popular-score.js";
import { publicTierList } from "./public-tier-list.js";

const dayOf = time => new Date(time).toISOString().slice(0, 10);

/**
 * The tier list of today. Kept with the tournament aggregations (30 s, dropped by any tournament
 * write); the key also names the version of every editors' list and the roster's lanes, so a saved
 * rating or a new hero shows at once.
 */
export async function currentTierList(store, today = dayOf(Date.now())) {
  const [summary, official, heroes] = await Promise.all([
    store.competitiveSummary(),
    store.listOfficialTierLists(),
    store.readHeroes()
  ]);
  const { from, to } = defaultPeriod({ today, first: summary.first });
  const versions = [...official].map(([lane, list]) => `${lane}:${list.version}`).join(",");
  const roster = createHash("sha1")
    .update(JSON.stringify(heroes.map(hero => [hero.id, hero.lanes ?? []])))
    .digest("hex");
  const key = `tier-list|${from}|${to}|${versions}|${roster}`;
  return store.rememberCompetitive(key, async () => {
    const games = (await store.competitiveGames(from)).filter(game => game.playedOn <= to);
    const day = to < today ? to : today;
    const { lanes } = popularHeroes(games, {
      minGames: 1,
      limit: Infinity,
      today: day,
      ...(await heroFacts(store, day))
    });
    const ratedOn = [...official.values()].map(list => dayOf(list.updatedAt));
    const updatedAt = [summary.last, ...ratedOn].filter(Boolean).sort().at(-1) ?? null;
    return {
      period: { from, to },
      minGames: SCORE.minGames,
      totalGames: games.length,
      ...publicTierList({ lanes, official, heroes, minGames: SCORE.minGames, updatedAt })
    };
  });
}

/** Where a hero stands in the lanes it plays: { ratings: { lane: "A" }, sources: { lane: "tournaments" } }. */
export function heroTiers(list, heroId, lanesOfHero) {
  const ratings = {};
  const sources = {};
  for (const lane of list.lanes) {
    if (!lanesOfHero.includes(lane.lane)) {
      continue;
    }
    for (const tier of lane.tiers) {
      const hero = tier.heroes.find(item => item.heroId === heroId);
      if (hero) {
        ratings[lane.lane] = tier.label;
        sources[lane.lane] = hero.source;
      }
    }
  }
  return { ratings, sources };
}

/** The heroes of a lane that the tournaments rank, with their tier: { heroId: "S" } (for the editors). */
export function computedTiers(list, laneName) {
  const lane = list.lanes.find(item => item.lane === laneName);
  const computed = {};
  for (const tier of lane?.tiers ?? []) {
    for (const hero of tier.heroes) {
      if (hero.source === "tournaments") {
        computed[hero.heroId] = tier.label;
      }
    }
  }
  return computed;
}
