import { usedHeroes } from "../../../shared/draft-model.js";
import { api, fetchSeries, serverNow } from "../../app/api-client.js";
import { currentSeries } from "../../app/roster-data.js";
import { app, tell } from "../../lib/dom.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { scrimsPage } from "./scrim-list.js";
import { fillScene } from "./scene.js";
import { draftView, isDue, loadDraftModules } from "./scrim-draft.js";
import { teamsPanelHtml } from "./teams.js";
import {
  seriesBandHtml,
  seriesFrameHtml,
  seriesOnlineHtml,
  seriesSkeleton,
  seriesStageHtml
} from "./board-markup.js";
import { seriesDetailsHtml } from "./board-details.js";

export function renderScrims() {
  const selected = currentSeries();
  // the room the server drew (or the page painted) while the series was on its way stays: the board fills it in
  if (!(selected && app.querySelector(".series-board[data-frame]"))) {
    app.innerHTML = selected ? seriesSkeleton() : scrimsPage();
  }
  draftView.reset();
  if (selected) {
    updateSeriesView(selected);
  } else {
    fillScene();
  }
}

/** Draws that frame when the page has no board yet (the server draws it for a series whose game is being drafted). */
export async function paintSeriesFrame() {
  if (app.querySelector(".series-board")) {
    return;
  }
  await loadDraftModules();
  if (!app.querySelector(".series-board")) {
    app.innerHTML = seriesFrameHtml();
  }
}

function patchRegion(element, html) {
  if (!element || element.dataset.html === html) {
    return;
  }
  element.innerHTML = html;
  element.dataset.html = html;
}

/** Game shown on the board: a reviewed past game (read only) or the live one. */
function displayedGame(series) {
  if (state.viewGameIndex !== null && series.games[state.viewGameIndex]) {
    return { game: series.games[state.viewGameIndex], readOnly: true };
  }
  if (series.currentGame) {
    return { game: series.currentGame, readOnly: false };
  }
  return null;
}

function draftContext(series, shown) {
  const online = Boolean(series.online);
  const userId = state.auth.user?.id;
  const viewerTeamName = online
    ? series.online.teamAUserId === userId
      ? series.teamA.name
      : series.online.teamBUserId === userId
        ? series.teamB.name
        : null
    : null;
  return {
    series,
    game: shown.game,
    readOnly: shown.readOnly,
    online,
    viewer: series.viewer,
    viewerTeamName,
    canActAs: viewerTeamName ? (viewerTeamName === shown.game.blueTeam ? "blue" : "red") : null,
    heroes: state.heroes.filter(hero => hero.availableGlobal !== false),
    flowbornIds: state.heroes
      .filter(hero => /^Flowborn(?:\s*\(|$)/i.test(hero.name))
      .map(hero => hero.id),
    usedA: usedHeroes(series, series.teamA.name),
    usedB: usedHeroes(series, series.teamB.name),
    now: serverNow()
  };
}

/** The board bleeds to the edges of the window: it needs the width of the scrollbar, which the unit vw counts. */
function fitBoard() {
  // read every time: the scrollbar comes and goes with the height of the page (the observer of installBoard calls this when it does)
  document
    .querySelector(".series-board")
    ?.style.setProperty("--sbw", `${window.innerWidth - document.documentElement.clientWidth}px`);
}

function updateSeriesView(series) {
  const board = app.querySelector(".series-board");
  if (!board) {
    return false;
  }
  fitBoard();
  board.removeAttribute("data-frame");
  board.inert = false;
  const shown = displayedGame(series);
  const region = name => board.querySelector(`[data-region="${name}"]`);
  // A board with a draft fills the screen from the top bar to the bottom, nothing under it unless games were played.
  board.classList.toggle("sr-board--room", Boolean(shown));
  board.classList.toggle("sr-board--bare", Boolean(shown) && !series.games.length);
  patchRegion(region("hero"), seriesBandHtml(series, shown));
  patchRegion(region("teams"), teamsPanelHtml(series));
  patchRegion(region("online"), seriesOnlineHtml(series));
  patchRegion(region("stage"), shown ? "" : seriesStageHtml(series));
  patchRegion(region("details"), series.games.length ? seriesDetailsHtml(series) : "");
  const mount = region("draft");
  if (shown) {
    const context = draftContext(series, shown);
    draftView.mount(mount, context);
    draftView.update(context);
  } else if (mount.innerHTML) {
    draftView.reset();
    mount.innerHTML = "";
    mount.dataset.html = "";
  }
  return true;
}

/** Refresh after the series data changed: patch the board in place when it is on screen. */
export function refreshSeries() {
  const series = currentSeries();
  if (state.view === "scrims" && series && updateSeriesView(series)) {
    return;
  }
  render();
}

export async function reloadSeries(idToKeep = state.activeSeriesId) {
  state.series = await fetchSeries();
  state.activeSeriesId = idToKeep;
  refreshSeries();
}

export function teamForStep(game, step) {
  return step?.team === "blue" ? game.blueTeam : game.redTeam;
}

export function installBoard() {
  // the scrollbar comes and goes with the height of the page
  new ResizeObserver(fitBoard).observe(document.documentElement);
  document.querySelector("#handoff-continue").addEventListener("click", () => {
    document.querySelector("#handoff").hidden = true;
    document.querySelector("#view").focus();
  });

  // The clock ticks on the server's time. Only the clock text/state is touched on a tick; when a
  // deadline passes the server is asked to resolve it (auto-pick, wait phase end), at most once a
  // second.
  setInterval(async () => {
    const series = currentSeries();
    const game = series?.currentGame;
    if (
      !game ||
      state.view !== "scrims" ||
      state.viewGameIndex !== null ||
      !draftView.isMounted()
    ) {
      return;
    }
    const now = serverNow();
    draftView.tick({ game, now });
    const draft = game.draft;
    if (isDue(draft, now) && !state.advancing && Date.now() >= state.advanceBlockedUntil) {
      state.advancing = true;
      state.advanceBlockedUntil = Date.now() + 1000;
      try {
        await api(`/api/series/${encodeURIComponent(series.id)}/game/advance`, {
          method: "POST",
          body: {}
        });
        await reloadSeries(series.id);
      } catch (error) {
        tell(error.message);
      } finally {
        state.advancing = false;
      }
    }
  }, 250);

  setInterval(async () => {
    const series = currentSeries();
    // not for a tab nobody is looking at: it asks again at the first tick after the tab comes back
    if (!series?.online || state.polling || document.visibilityState === "hidden") {
      return;
    }
    state.polling = true;
    try {
      const latest = await api(`/api/series/${encodeURIComponent(series.id)}`);
      if (latest.version !== series.version) {
        state.series = state.series.map(item => (item.id === latest.id ? latest : item));
        if (state.view === "scrims" && state.activeSeriesId === latest.id) {
          refreshSeries();
        }
      }
    } catch {
      // A failed poll is simply tried again on the next tick.
    } finally {
      state.polling = false;
    }
  }, 1500);

  // Arrow keys move between the games of a series.
  document.addEventListener("keydown", event => {
    const chip = event.target.closest?.(".game-chip-main");
    if (!chip || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const chips = [...chip.closest(".game-nav").querySelectorAll(".game-chip-main")];
    const index = chips.indexOf(chip);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? chips.length - 1
          : index + (event.key === "ArrowRight" ? 1 : -1);
    if (next < 0 || next >= chips.length || next === index) {
      return;
    }
    event.preventDefault();
    chips[next].click();
    document
      .querySelector(`.game-chip-main[data-game-index="${chips[next].dataset.gameIndex}"]`)
      ?.focus();
  });
}
