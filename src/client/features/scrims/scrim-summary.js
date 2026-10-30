// What a series says about itself, beside its games: who leads (a ring), how long its games last
// and the heroes that came back the most. Everything is computed from the games that were played;
// nothing is estimated.
import { t } from "../../app/browser-i18n.js";
import { currentHero } from "../../app/roster-data.js";
import { escapeHtml, slotImage } from "../../lib/dom.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { formatDuration } from "../../lib/format.js";

export const modeLabel = mode =>
  mode === "global-ban-pick"
    ? t("Global Ban & Pick")
    : mode === "classic"
      ? t("Classic")
      : t("Free For All");

const SIDES = ["blue", "red"];

/** Two arcs of one ring: the share of the games won by each team. */
function ring(teamA, teamB) {
  const total = teamA + teamB;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const first = total ? (teamA / total) * circumference : 0;
  return `<figure class="sr-ring"><svg viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
      <circle class="sr-ring__b" cx="50" cy="50" r="${radius}" fill="none" stroke-width="10"/>
      <circle class="sr-ring__a" cx="50" cy="50" r="${radius}" fill="none" stroke-width="10" stroke-dasharray="${first.toFixed(2)} ${(circumference - first).toFixed(2)}" transform="rotate(-90 50 50)"/>
    </svg><figcaption><strong>${teamA} – ${teamB}</strong><span>${t("Games")}</span></figcaption></figure>`;
}

/** The ring of the score, the two teams under it, and the facts of the series. */
export function seriesSummaryHtml(series) {
  const score = getSeriesScore(series);
  const lengths = series.games.map(game => Number(game.durationSeconds) || 0).filter(Boolean);
  const average = lengths.length
    ? formatDuration(
        Math.round(lengths.reduce((sum, seconds) => sum + seconds, 0) / lengths.length)
      )
    : "";
  const facts = [
    [t("Hero rule"), modeLabel(series.gameMode)],
    [t("Format"), `BO${series.bestOf}`],
    ...(average ? [[t("Average duration"), average]] : [])
  ];
  return `<section class="card sr-summary rise">
      <div class="card__head"><h2>${t("Summary")}</h2></div>
      <div class="sr-summary__body">
        <div class="sr-summary__ring" role="img" aria-label="${escapeHtml(series.teamA.name)} ${score.teamA}, ${escapeHtml(series.teamB.name)} ${score.teamB}">${ring(score.teamA, score.teamB)}</div>
        <div class="sr-summary__text">
          <ul class="sr-legend"><li><i class="dot a"></i><span>${escapeHtml(series.teamA.name)}</span><b>${score.teamA}</b></li><li><i class="dot b"></i><span>${escapeHtml(series.teamB.name)}</span><b>${score.teamB}</b></li></ul>
          <dl class="sr-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
        </div>
      </div>
    </section>`;
}

/** The five heroes picked in the most games of the series (both teams together). */
export function topHeroesHtml(series) {
  const counts = new Map();
  for (const game of series.games) {
    for (const side of SIDES) {
      for (const heroId of game.draft.picks[side]) {
        counts.set(heroId, (counts.get(heroId) ?? 0) + 1);
      }
    }
  }
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) {
    return "";
  }
  return `<section class="card sr-top rise">
      <div class="card__head"><h2>${t("Most picked heroes")}</h2></div>
      <ol>${top
        .map(([heroId, count]) => {
          const hero = currentHero(heroId);
          const games = t("{count, plural, one {# game} other {# games}}", { count });
          return `<li><span class="sr-hero__art" title="${escapeHtml(games)}">${slotImage(hero)}<em aria-hidden="true">${count}</em></span><b>${escapeHtml(hero.displayName || hero.name)}</b><span class="visually-hidden">${games}</span></li>`;
        })
        .join("")}</ol>
    </section>`;
}
