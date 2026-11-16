// public tier list, words: what the boards show, said in sentences, for the players who read and for the search
// engines (owner, 2026-11-16: the page must come first on "hok tier list" and the questions around it). The best
// heroes of each lane with the record of the first, and the questions players type, answered from the same list.
import { laneName } from "../../domain/lanes.js";
import { currentLanguage, list, percentage, t } from "../../app/browser-i18n.js";

const longDay = value =>
  new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "long" }).format(
    new Date(`${value}T00:00:00`)
  );

/** The heroes of a lane, best tier first. */
const ranked = lane => lane.tiers.flatMap(tier => tier.heroes);

/** "Best Clash Lane heroes right now: Dharma, Devara and Fuzi. Dharma has won 62 % of 29 tournament games…" */
export function laneSummary(view, lane) {
  const heroes = ranked(lane);
  if (!heroes.length) {
    return "";
  }
  const best = t("Best {lane} heroes right now: {heroes}.", {
    lane: laneName(lane.lane),
    heroes: list(heroes.slice(0, 3).map(hero => view.nameOf(hero.heroId)))
  });
  const first = heroes[0];
  const record =
    first.source === "tournaments" && first.games
      ? ` ${t(
          "{hero} has won {rate} of {count, plural, one {# tournament game} other {# tournament games}} in the last three months.",
          {
            hero: view.nameOf(first.heroId),
            rate: percentage(first.winRate ?? 0, 0),
            count: first.games
          }
        )}`
      : "";
  return `<p class="tlp-summary">${view.esc(best + record)}</p>`;
}

/** One question and its answer. */
const question = (asked, answer) => `<h3>${asked}</h3><p>${answer}</p>`;

/** The questions players type, answered from the list: on a lane's page, the first one is about that lane. */
export function questions(view) {
  const lanes = view.data?.lanes ?? [];
  const own = lanes.find(lane => lane.slug === view.slug);
  const nameOf = hero => view.esc(view.nameOf(hero.heroId));
  const best = own
    ? question(
        view.esc(
          t("Who is the best {lane} hero in Honor of Kings right now?", {
            lane: laneName(own.lane)
          })
        ),
        view.esc(
          t(
            "In this order: {heroes}. The list comes from the tournament games of the last three months.",
            {
              heroes: list(
                ranked(own)
                  .slice(0, 3)
                  .map(hero => view.nameOf(hero.heroId))
              )
            }
          )
        )
      )
    : question(
        view.esc(t("What is the best hero in Honor of Kings right now?")),
        `${view.esc(t("The best hero of each lane, from the tournament games of the last three months:"))} ${lanes
          .filter(lane => ranked(lane).length)
          .map(lane => `${view.esc(laneName(lane.lane))}: ${nameOf(ranked(lane)[0])}`)
          .join(" · ")}.`
      );
  const updated = view.data?.updatedAt
    ? ` ${t("Last change: {date}.", { date: longDay(view.data.updatedAt) })}`
    : "";
  return `<section class="tlp-faq card"><h2>${view.esc(t("Questions"))}</h2>
      ${best}
      ${question(
        view.esc(t("Is this tier list for Honor of Kings Global?")),
        view.esc(
          t(
            "Yes. It covers the global version of the game only: its heroes, their names and the tournaments played on it."
          )
        )
      )}
      ${question(
        view.esc(t("How often does the tier list change?")),
        view.esc(t("With every tournament series entered on the site.") + updated)
      )}
    </section>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { laneSummary, questions };
