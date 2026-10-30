// What the games said: the details of a series, game by game.
import { banSlots, usedHeroes } from "../../../shared/draft-model.js";
import { currentHero } from "../../app/roster-data.js";
import { escapeHtml, slotImage } from "../../lib/dom.js";
import { formatDuration } from "../../lib/format.js";
import { icon } from "../../../shared/icons.js";
import { seriesSummaryHtml, topHeroesHtml } from "./scrim-summary.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";

// ---- what the games said ----------------------------------------------------------------------------
/** Under the draft: the games played, and beside them what the series says. */
export function seriesDetailsHtml(series) {
  const usage = series.gameMode === "global-ban-pick";
  return `<div class="sr-details"><div class="sr-insights">${seriesSummaryHtml(series)}${topHeroesHtml(series)}${usage ? usageHtml(series) : ""}</div><section class="sr-games" aria-labelledby="games-title"><div class="sr-games__head"><h2 id="games-title">${t("Completed games")}</h2><span class="pill pill--blue">${series.games.length} / ${series.bestOf}</span></div>${series.games.map((item, index) => gameCardHtml(item, series, index)).join("")}</section></div>`;
}

/** A hero of a finished game: its picture and name (or a dash when the slot stayed empty). */
function heroName(heroId) {
  const hero = currentHero(heroId);
  return hero.displayName || hero.name;
}

/** A ban of a finished game: the hero, or an empty slot when nobody made it (time ran out). */
function banChipHtml(heroId) {
  return heroId
    ? `<span class="pt pt--sq s-36 sr-ban" title="${escapeHtml(heroName(heroId))}">${slotImage(currentHero(heroId))}</span>`
    : `<span class="pt pt--sq s-36 sr-ban sr-ban--empty" title="${t("No ban")}"></span>`;
}

function gameSideHtml(side, teamName, game) {
  const win = game.winner === teamName;
  const picks = game.draft.picks[side];
  const bans = banSlots(game.draft, side);
  return `<div class="gside gside--${side === "blue" ? "b" : "r"}${win ? " win" : ""}"><div class="gside__head">${teamEmblem(teamName, 36)}<span><b>${escapeHtml(teamName)}</b><small>${side === "blue" ? t("Blue side") : t("Red side")}</small></span>${win ? `<span class="pill">${icon("trophy", "i--sm")}${t("Victory")}</span>` : ""}</div>
    <ul class="gpicks" aria-label="${t("Picks")}">${picks.map(heroId => `<li class="gp"><span class="pt pt--sq s-64">${slotImage(currentHero(heroId))}</span><span>${escapeHtml(heroName(heroId))}</span></li>`).join("")}</ul>
    <div class="gbans"><span>${t("Bans")}</span>${bans.some(Boolean) ? bans.map(banChipHtml).join("") : "—"}</div></div>`;
}

function gameCardHtml(game, series, index) {
  const canEdit = series.viewer?.canRecordResult !== false;
  const blueWon = game.winner === game.blueTeam;
  return `<article class="card sr-game rise">
      <div class="sr-game__head">
        <h3>${t("Game {gameNumber}", { gameNumber: game.gameNumber })}</h3>
        <span class="pill ${blueWon ? "pill--blue" : "pill--red"}">${t("{winner} won", { winner: escapeHtml(game.winner) })}</span>
        <span class="spacer"></span>
        <label class="field field--duration">${icon("clock", "i--sm")}<input class="history-duration" data-series-id="${escapeHtml(series.id)}" data-game-index="${index}" value="${formatDuration(game.durationSeconds)}" aria-label="${t("Edit duration for game {gameNumber}", { gameNumber: game.gameNumber })}" ${canEdit ? "" : "disabled"}></label>
        <button type="button" class="btn btn--sm" data-action="view-game" data-game-index="${index}">${icon("eye", "i--sm")}${t("Review the draft")}</button>
        ${canEdit ? `<button type="button" class="btn btn--ghost btn--sm" data-action="edit-draft" data-game-index="${index}">${icon("pencil", "i--sm")}${t("Edit bans &amp; picks")}</button>` : ""}
      </div>
      <div class="sr-game__sides">${gameSideHtml("blue", game.blueTeam, game)}${gameSideHtml("red", game.redTeam, game)}</div>
    </article>`;
}

function usageLine(teamName, heroIds) {
  return `<div class="sr-usage__line"><b>${escapeHtml(teamName)}</b><div class="sr-usage__chips">${heroIds.length ? heroIds.map(heroId => `<span class="pt pt--sq s-36 sr-used" title="${escapeHtml(heroName(heroId))}">${slotImage(currentHero(heroId))}</span>`).join("") : `<span class="muted">${t("No picks recorded")}</span>`}</div></div>`;
}

function usageHtml(series) {
  return `<section class="card sr-usage rise"><div class="card__head"><h2>${t("Series hero usage")}</h2><span class="pill pill--grey">${t("Picks only")}</span></div>${usageLine(series.teamA.name, usedHeroes(series, series.teamA.name))}${usageLine(series.teamB.name, usedHeroes(series, series.teamB.name))}</section>`;
}
