// What the server says about a hero page before any script runs: a title that names what the page
// holds (a build written by the editors, counters seen in tournaments), and a description with the
// lanes, the role, the tier of the public tier list and the tournament win rate.
import { heroTitleKey } from "../../../shared/hero-title.js";
import { SITE_NAME } from "../../../shared/routes.js";
import { currentTierList, heroTiers } from "../../features/tier-lists/public-tier-list-service.js";
import { tr } from "../server-i18n.js";

/** Picks and wins of a hero in every tournament game that was entered. */
function tournamentRecord(games, heroId) {
  let picks = 0;
  let wins = 0;
  for (const game of games) {
    const side = ["blue", "red"].find(team => game.picks[team].includes(heroId));
    if (side) {
      picks += 1;
      wins += (side === "blue" ? game.blueTeam : game.redTeam) === game.winner ? 1 : 0;
    }
  }
  return { picks, wins };
}

/** Title, description, banner and picture of the page of `hero`. */
export async function describeHero(ctx, hero, language, say) {
  const name = /^Flowborn/i.test(hero.name) ? "Flowborn" : hero.name;
  const lanes = hero.lanes.join(" / ");
  const [builds, games, list] = await Promise.all([
    ctx.store.listBuildSets(hero.id).catch(() => []),
    ctx.store.competitiveGames(null).catch(() => []),
    currentTierList(ctx.store).catch(() => null)
  ]);
  const record = tournamentRecord(games, hero.id);
  const sentences = [
    say(
      language,
      "{name} in Honor of Kings Global: {roles} hero for {lanes}. Skills with videos, artwork and full patch history.",
      { name, roles: hero.roles.join(" / "), lanes }
    )
  ];
  const tiers = list ? heroTiers(list, hero.id, hero.lanes) : { ratings: {} };
  const [lane, tier] = Object.entries(tiers.ratings)[0] ?? [];
  if (tier) {
    sentences.push(
      tr(language, "HOK tier list: {tier} in {lane}.", { tier, lane: say(language, lane) })
    );
  }
  if (record.picks) {
    sentences.push(
      tr(language, "Tournament win rate: {rate} % over {count} games.", {
        rate: Math.round((record.wins / record.picks) * 100),
        count: record.picks
      })
    );
  }
  return {
    status: 200,
    index: true,
    banner: await ctx.bannerSrcset(hero.id, language),
    title: tr(language, heroTitleKey({ build: builds.length > 0, games: record.picks > 0 }), {
      name,
      site: SITE_NAME
    }),
    description: sentences.join(" ").slice(0, 300),
    image: hero.image
  };
}
