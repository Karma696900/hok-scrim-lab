// The markup of the series board: the frame, the band, the stage, the roster, the lobby.
import { CONTROLS, MODES } from "./new-series.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { draftView } from "./scrim-draft.js";
import { escapeHtml } from "../../lib/dom.js";
import { formatDuration } from "../../lib/format.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { icon } from "../../../shared/icons.js";
import { modeLabel } from "./scrim-summary.js";
import { responsive } from "../../../shared/media.js";
import { shareButtons } from "../sharing/sharing-actions.js";
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { teamsButtonHtml } from "./teams.js";

// ---- Series board ------------------------------------------------------------------------- The
// board is a set of stable regions. Each region is only touched when its markup changed, and the
// draft itself is patched slot by slot (draft-view.js), so a poll or a pick never rebuilds the
// page.
const SERIES_REGIONS = ["hero", "teams", "online", "stage", "draft", "details"];

export function seriesSkeleton() {
  return `<div class="series-board sr-board">${SERIES_REGIONS.map(name => `<div data-region="${name}"></div>`).join("")}</div>`;
}

/**
 * The board of a series in its draft before the series is known ("frame"): the band with nobody's name in it and the
 * empty room, so that the clock is on the screen at once. Nothing in it can be used (inert); the real board takes it over.
 */
export function seriesFrameHtml() {
  const game = { gameNumber: 1, blueTeam: "", draft: { started: true } };
  const series = {
    id: "",
    teamA: { name: "" },
    teamB: { name: "" },
    games: [],
    currentGame: game,
    status: "active",
    bestOf: 1,
    winsRequired: 1,
    gameMode: "global-ban-pick",
    viewer: { canShare: true, canDelete: true },
    online: null
  };
  const regions = {
    hero: seriesBandHtml(series, { game, readOnly: false }),
    draft: draftView.frame()
  };
  return `<div class="series-board sr-board sr-board--room sr-board--bare" data-frame inert>${SERIES_REGIONS.map(name => `<div data-region="${name}">${regions[name] ?? ""}</div>`).join("")}</div>`;
}

/**
 * The band at the top of a series: the way back, the two teams with the score between them, where the
 * series stands, then the games as tabs and what can be done with the series (share, export, delete).
 */
export function seriesBandHtml(series, shown) {
  const score = getSeriesScore(series);
  const game = shown?.game;
  const name = t("{teamA} vs {teamB}", {
    teamA: escapeHtml(series.teamA.name),
    teamB: escapeHtml(series.teamB.name)
  });
  const side = teamName =>
    !game
      ? ""
      : game.blueTeam === teamName
        ? `<span class="side-chip blue">${t("Blue")}</span>`
        : `<span class="side-chip red">${t("Red")}</span>`;
  const team = (which, label, teamName, user) =>
    `<div class="vsteam vsteam--${which}">${teamEmblem(teamName, 56)}<span class="vsteam__who"><h2>${user?.picture ? avatarMarkup(user, 24) : ""}<span>${escapeHtml(teamName)}</span></h2>${side(teamName) || `<small>${label}</small>`}</span></div>`;
  const finished = series.status !== "active";
  const status = finished
    ? `<span class="pill${series.status === "draw" ? " pill--grey" : ""}">${series.status === "draw" ? t("Series draw") : t("Finished")}</span>`
    : `<span class="sr-live">${t("In progress")}</span>`;
  const actions = `${series.viewer?.canShare ? shareButtons("series", series.id, !series.online) : ""}${teamsButtonHtml(series)}<button type="button" class="btn btn--sm" data-action="open-export" data-series-id="${escapeHtml(series.id)}" data-name="${escapeHtml(`${series.teamA.name}_vs_${series.teamB.name}_BO${series.bestOf}`)}">${icon("download", "i--sm")}${t("Export PDF / PNG")}</button>${series.viewer?.canDelete === false ? "" : `<button type="button" class="btn btn--sm btn--danger" data-action="delete-series" data-series-id="${escapeHtml(series.id)}">${icon("trash", "i--sm")}${t("Delete")}</button>`}`;
  return `<section class="sr-band">
      <div class="sr-band__top">
        <button type="button" class="sr-back" data-action="back-series">${icon("left", "i--sm")}<span>${t("Scrims & Drafts")}</span></button>
        <h1 class="visually-hidden">${name}</h1>
        <div class="vsrow scoreboard" aria-label="${t("Series score")}">
          ${team("a", t("Team A"), series.teamA.name, series.online?.teamAUser)}
          <div class="vsscore" role="img" aria-label="${escapeHtml(series.teamA.name)} ${score.teamA}, ${escapeHtml(series.teamB.name)} ${score.teamB}">
            <b><span class="${score.teamA > score.teamB ? "w" : ""}">${score.teamA}</span><i aria-hidden="true">–</i><span class="${score.teamB > score.teamA ? "w" : ""}">${score.teamB}</span></b>
            <small class="score-note">${t("First to {winsRequired} · BO{bestOf}", { winsRequired: series.winsRequired, bestOf: series.bestOf })}</small>
          </div>
          ${team("b", t("Team B"), series.teamB.name, series.online?.teamBUser)}
        </div>
        <div class="sr-band__info">${status}<small>${modeLabel(series.gameMode)}</small></div>
      </div>
      <div class="sr-band__bar">
        ${gameNavHtml(series, shown)}
        <div class="sr-actions">${actions}</div>
      </div>
    </section>`;
}

export function seriesOnlineHtml(series) {
  if (!series.online) {
    return "";
  }
  const connected = Boolean(series.online.teamBUserId);
  const invite =
    series.online.invitationCode && !connected
      ? `<div class="sr-online__invite"><label class="field grow"><input id="invite-link" readonly value="${escapeHtml(`${location.origin}/?join=${encodeURIComponent(series.online.invitationCode)}`)}" aria-label="${t("Online invite link")}"></label><button type="button" class="btn btn--sm" data-action="copy-invite">${icon("copy", "i--sm")}${t("Copy invite link")}</button></div>`
      : "";
  return `<section class="sr-online"><div class="sr-online__what"><h2>${t("Online room")}</h2><span class="pill ${connected ? "" : "pill--warn"}">${connected ? t("Player connected") : t("Waiting for a player")}</span></div><p class="muted">${connected ? t("Both players are connected. The draft stays synchronized between browsers.") : t("Send this one-use invitation to your opponent. They must sign in with a different Google account.")}</p>${invite}</section>`;
}

/** The games of the series, as tabs: to move from one to another (and back to the one being played). */
function gameNavHtml(series, shown) {
  const viewingIndex = shown?.readOnly ? series.games.indexOf(shown.game) : null;
  const finished = series.games.map(
    (item, index) =>
      `<article class="game-chip${viewingIndex === index ? " active" : ""}"><button type="button" class="game-chip-main" data-action="view-game" data-game-index="${index}" aria-pressed="${viewingIndex === index}" title="${t("Blue: {blueTeam}", { blueTeam: escapeHtml(item.blueTeam) })}"><strong>${t("Game {gameNumber}", { gameNumber: item.gameNumber })}</strong><span>${t("{winner} won · {duration}", { winner: escapeHtml(item.winner), duration: formatDuration(item.durationSeconds) })}</span></button></article>`
  );
  const live = series.currentGame
    ? `<article class="game-chip current${shown && !shown.readOnly ? " active" : ""}"><button type="button" class="game-chip-main" data-action="view-game" data-game-index="current" aria-pressed="${Boolean(shown && !shown.readOnly)}" title="${t("Blue: {blueTeam}", { blueTeam: escapeHtml(series.currentGame.blueTeam) })}"><strong>${t("Game {gameNumber}", { gameNumber: series.currentGame.gameNumber })}</strong><span>${series.currentGame.draft.started === false ? t("Ready check") : t("Draft in progress")}</span></button></article>`
    : "";
  return `<nav class="game-history game-nav" aria-label="${t("Games of this series")}">${finished.join("")}${live}</nav>`;
}

/** Between two games, or when the series is over: what happens next. */
export function seriesStageHtml(series) {
  const score = getSeriesScore(series);
  if (series.status === "active") {
    const first = series.games.length % 2 === 0 ? series.teamA.name : series.teamB.name;
    const second = series.games.length % 2 === 0 ? series.teamB.name : series.teamA.name;
    const canStart = series.viewer?.canDrive !== false;
    return `<section class="card card--feature sr-next rise"><span class="sr-next__number" aria-hidden="true">${series.games.length + 1}</span><div class="sr-next__text"><h2>${t("Next game")}</h2><p class="muted">${t("Blue side alternates automatically. You can override it for this game.")}</p>${canStart ? "" : `<p class="muted">${t("Only the creator of this online series starts the next game.")}</p>`}</div><label class="label sr-next__side">${t("Blue side")}<span class="field"><select id="blue-team-select"><option>${escapeHtml(first)}</option><option>${escapeHtml(second)}</option></select></span></label><button type="button" class="btn btn--primary btn--lg" data-action="start-game" data-series-id="${escapeHtml(series.id)}" ${canStart ? "" : "disabled"}>${icon("play")}${t("Prepare game {number}", { number: series.games.length + 1 })}</button></section>${series.games.length ? "" : lobbyHtml(series)}`;
  }
  const winner =
    score.teamA === score.teamB
      ? ""
      : score.teamA > score.teamB
        ? series.teamA.name
        : series.teamB.name;
  const line = winner
    ? winner === series.teamA.name
      ? `<b>${escapeHtml(series.teamA.name)} ${score.teamA}</b> : ${score.teamB} ${escapeHtml(series.teamB.name)}`
      : `${escapeHtml(series.teamA.name)} ${score.teamA} : <b>${score.teamB} ${escapeHtml(series.teamB.name)}</b>`
    : `${escapeHtml(series.teamA.name)} ${score.teamA} : ${score.teamB} ${escapeHtml(series.teamB.name)}`;
  return `<section class="card card--feature sr-over rise">${icon("trophy", "i--xl")}<div class="sr-over__text"><h2>${series.status === "draw" ? t("Series draw") : t("Series complete")}</h2><p>${line}</p></div><button type="button" class="btn btn--primary btn--lg" data-action="new-series">${icon("plus")}${t("Start another series")}</button></section>`;
}

/** Ten heroes of the roster, as tall portraits (the same ten all day): something to look at before the first game. */
function rosterHtml() {
  const pool = state.heroes.filter(
    hero => hero.availableGlobal !== false && hero.image && !hero.isFlowborn
  );
  if (!pool.length) {
    return "";
  }
  const start = (Math.floor(Date.now() / 86400000) * 7) % pool.length;
  const heroes = [...pool.slice(start), ...pool.slice(0, start)].slice(0, 10);
  return `<section class="card sr-roster rise"><div class="card__head"><h2>${t("Heroes")}</h2><a class="link" href="/heroes">${t("Browse heroes")}${icon("right", "i--sm")}</a></div><ul>${heroes
    .map(
      hero =>
        `<li><button type="button" class="sr-tile" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}" aria-label="${escapeHtml(hero.displayName || hero.name)}"><span class="sr-hero__art"><img ${responsive(hero.image, 160, "160px")} alt="" width="140" height="187" loading="lazy" decoding="async"></span><b>${escapeHtml(hero.displayName || hero.name)}</b></button></li>`
    )
    .join("")}</ul></section>`;
}

/** Before the first game: the order of the draft step by step, and what was chosen for the series. */
function lobbyHtml(series) {
  const mode = MODES.find(item => item.id === series.gameMode);
  const control = CONTROLS.find(item => item.id === series.draftMode);
  const steps = mode.steps
    .map((step, index) => {
      const side = step.team === "blue" ? t("Blue") : t("Red");
      const what = step.action === "ban" ? t("Ban") : t("Pick");
      return `<li class="${step.team}"><b>${index + 1}</b>${icon(step.action === "ban" ? "ban" : "check")}<span>${what}</span><small>${side}</small></li>`;
    })
    .join("");
  const facts = [
    [t("Hero rule"), mode.title()],
    [
      t("Format"),
      t("First to {winsRequired} · BO{bestOf}", {
        winsRequired: series.winsRequired,
        bestOf: series.bestOf
      })
    ],
    ...(control ? [[t("Draft control"), control.title()]] : [])
  ];
  return `<div class="sr-lobby"><section class="card sr-order rise"><div class="card__head"><h2>${t("Draft order")}</h2></div><ol>${steps}</ol></section><section class="card sr-rules rise"><div class="card__head"><h2>${t("Summary")}</h2></div><dl class="sr-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl><p class="muted">${mode.text()}</p>${control ? `<p class="muted">${control.text()}</p>` : ""}</section>${rosterHtml()}</div>`;
}
