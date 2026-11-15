// What the server says about the public tier list before any script runs: a title that names the
// month (and the lane), and the heroes in their order for the ItemList that search engines read.
import { currentTierList } from "../../features/tier-lists/public-tier-list-service.js";
import { SITE_NAME } from "../../../shared/routes.js";
import { tr } from "../server-i18n.js";

const LANE_NAMES = {
  clash: "Clash Lane",
  jungle: "Jungle",
  mid: "Mid Lane",
  farm: "Farm Lane",
  roam: "Roamer"
};
/** The heroes named in the ItemList: the first ones of the list, best tier first. */
const LISTED = 50;

/** The heroes a description names: the first ones of the list. */
const BEST = 3;

/** "Agudo, Angela and Kongming": the names of a sentence. */
const names = (language, list) =>
  list.length < 2
    ? list.join("")
    : tr(language, "{first} and {last}", {
        first: list.slice(0, -1).join(", "),
        last: list.at(-1)
      });

/**
 * The description of one lane (or of the whole list): its best heroes this month. Each page has its own, instead of
 * the one sentence the six pages shared.
 */
function describeBest(language, say, lane, month, best) {
  const heroes = names(language, best);
  return lane
    ? tr(
        language,
        "Honor of Kings {lane} tier list for {month}: {heroes} on top. Every {lane} hero from SS to D, ranked by the tournament games of the last three months.",
        { lane: say(language, lane), month, heroes }
      )
    : tr(
        language,
        "Honor of Kings tier list for {month}: {heroes} on top. Every hero of every lane from SS to D, ranked by the tournament games of the last three months.",
        { month, heroes }
      );
}

/** The title, the description and the heroes of /tier-list or /tier-list/{lane}. */
export async function describeTierList(ctx, matched, language, say, localized) {
  const slug = (matched.section ?? "").slice(1);
  const lane = LANE_NAMES[slug] ?? null;
  const month = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
    new Date()
  );
  // tr, not say: the key tool reads the key of a tr() call (scripts/i18n/keys.mjs)
  const title = lane
    ? tr(language, "HOK {lane} Tier List ({month}) — best Honor of Kings {lane} heroes | {site}", {
        site: SITE_NAME,
        lane: say(language, lane),
        month
      })
    : tr(language, "HOK Tier List ({month}) — best Honor of Kings heroes for every lane | {site}", {
        site: SITE_NAME,
        month
      });
  let items = [];
  let updatedAt = null;
  try {
    const [list, heroes] = await Promise.all([currentTierList(ctx.store), ctx.store.readHeroes()]);
    const names = new Map(heroes.map(hero => [hero.id, hero.name]));
    updatedAt = list.updatedAt;
    items = list.lanes
      .filter(item => !lane || item.lane === lane)
      .flatMap(item => item.tiers.flatMap(tier => tier.heroes))
      .filter(hero => names.has(hero.heroId))
      .slice(0, LISTED)
      .map(hero => ({ id: hero.heroId, name: names.get(hero.heroId) }));
  } catch {
    // the page still answers; the structured data waits for the next visit
  }
  const best = items.slice(0, BEST).map(hero => hero.name);
  return {
    status: 200,
    ...localized(language, matched.route),
    index: true,
    title,
    ...(best.length ? { description: describeBest(language, say, lane, month, best) } : {}),
    tierList: { path: `/tier-list${lane ? `/${slug}` : ""}`, items, updatedAt }
  };
}
