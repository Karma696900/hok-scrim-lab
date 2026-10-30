import { icon } from "../../../shared/icons.js";
import { currentHero } from "../../app/roster-data.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { escapeHtml, slotImage } from "../../lib/dom.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { t } from "../../app/browser-i18n.js";
import { format } from "../community/labels.js";
import { modeLabel } from "./scrim-summary.js";

// The rows that list a series (the Scrims page, the History page): both teams with their emblem, the score
// at the centre, the rule, the day and where the series stands, the pictures of the last picks of each team
// when the list carries the drafts (the Scrims page does, the summaries of the History page do not), and a
// button that exports the series as a PDF or a PNG.

function stateMark(summary) {
  if (summary.status === "complete") {
    return `<span class="pill sc-state">${icon("trophy", "i--sm")}${t("Complete")}</span>`;
  }
  if (summary.status === "draw") {
    return `<span class="pill pill--grey sc-state">${t("Series draw")}</span>`;
  }
  // Short on purpose (the column is narrow): the number of the game is on the board itself.
  return summary.currentGameNumber
    ? `<span class="sc-state sc-state--live" title="${t("Game {number} in progress", { number: summary.currentGameNumber })}">${t("In progress")}</span>`
    : `<span class="pill pill--grey sc-state">${t("Ready")}</span>`;
}

/** The five pictures of a team's picks: the heroes taken, then a numbered gap for each one still to come. */
function picksStrip(heroIds, side) {
  return `<span class="sc-picks sc-picks--${side}" aria-hidden="true">${Array.from(
    { length: 5 },
    (_, index) => {
      const hero = heroIds[index] ? currentHero(heroIds[index]) : null;
      return hero
        ? `<span class="pt pt--sq s-32 sc-pick" title="${escapeHtml(hero.displayName || hero.name)}">${slotImage(hero)}</span>`
        : `<span class="pt pt--sq s-32 sc-pick sc-pick--empty">${index + 1}</span>`;
    }
  ).join("")}</span>`;
}

/** Row for a server summary (History) or a loaded series (Scrims); `picks` = { a, b } hero ids, when known. */
export function summaryRow(summary, picks = null) {
  const downloadName = `${summary.teamA}_vs_${summary.teamB}_BO${summary.bestOf}`;
  const day = format(summary.updatedAt, { weekday: "short", day: "numeric", month: "short" });
  const hour = format(summary.updatedAt, { hour: "2-digit", minute: "2-digit" });
  const { teamA, teamB } = summary.score;
  const done = summary.status === "complete";
  const side = (mine, other) => (done ? (mine > other ? " w" : mine < other ? " l" : "") : "");
  const live = summary.status === "active" && Boolean(summary.currentGameNumber);
  const names = { teamA: escapeHtml(summary.teamA), teamB: escapeHtml(summary.teamB) };
  return `<div class="series-item sc-item"><button type="button" class="series-row sc-row${live ? " sc-row--live" : ""}${picks ? "" : " sc-row--plain"}" data-action="open-series" data-series-id="${escapeHtml(summary.id)}">
      <span class="sc-team sc-team--a"><b title="${names.teamA}">${names.teamA}</b>${teamEmblem(summary.teamA, 56)}</span>
      <span class="sc-mid"><span class="sc-score"><b class="${side(teamA, teamB).trim()}">${teamA}</b><i>–</i><b class="${side(teamB, teamA).trim()}">${teamB}</b></span>${stateMark(summary)}</span>
      <span class="sc-team sc-team--b">${teamEmblem(summary.teamB, 56)}<b title="${names.teamB}">${names.teamB}</b></span>
      ${picks ? `${picksStrip(picks.a, "a")}${picksStrip(picks.b, "b")}` : ""}
      <span class="sc-foot"><small class="sc-meta">${t("BO{bestOf}", { bestOf: summary.bestOf })} · ${escapeHtml(modeLabel(summary.gameMode))}</small><small class="sc-when">${escapeHtml(day)} · ${escapeHtml(hour)}</small></span>
      <span class="visually-hidden">${t("{teamA} vs {teamB}", names)}</span>
    </button><button type="button" class="series-export btn btn--ghost btn--icon" data-action="open-export" data-series-id="${escapeHtml(summary.id)}" data-name="${escapeHtml(downloadName)}" aria-label="${t("Export {teamA} vs {teamB} as PDF or PNG", names)}" title="${t("Export as PDF or PNG")}">${icon("download", "i--sm")}</button></div>`;
}

/** The picks of each team in the game that has some: the one being played, else the last one recorded. */
function latestPicks(series) {
  const played = [series.currentGame, ...series.games.toReversed()].filter(Boolean);
  const game = played.find(item => item.draft.picks.blue.length + item.draft.picks.red.length > 0);
  if (!game) {
    return played.length ? { a: [], b: [] } : null;
  }
  const picksOf = team => game.draft.picks[game.blueTeam === team ? "blue" : "red"];
  return { a: picksOf(series.teamA.name), b: picksOf(series.teamB.name) };
}

/** Row for a fully loaded series (Scrims list). */
export function seriesRow(series) {
  return summaryRow(
    {
      id: series.id,
      teamA: series.teamA.name,
      teamB: series.teamB.name,
      bestOf: series.bestOf,
      gameMode: series.gameMode,
      status: series.status,
      gamesCount: series.games.length,
      currentGameNumber: series.currentGame?.gameNumber ?? null,
      updatedAt: series.updatedAt,
      score: getSeriesScore(series)
    },
    latestPicks(series)
  );
}

/** What a list says when it has nothing to show: one line (an icon, a bold title, a sentence) and, maybe, one action. */
export function emptyLine(iconName, title, text, action = "") {
  return `<p class="sc-empty">${icon(iconName, "i--sm")}<span><b>${title}</b> ${text}</span>${action}</p>`;
}
