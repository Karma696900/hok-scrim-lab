// A watched game seen through one hero's eyes (owner, 2026-11-06): the spectator taps a hero (its row in the teams)
// and the bots server follows it (its team's view and fog). The page then draws the screen of a game by hand: the
// tilted field under a camera that follows that hero, its standing dots, the minimap, the cards of its team, the
// clock, the score and the gold. Nothing to press but the speed, the scoreboard and the way back to the whole map: the
// bots play. simulation-run.js swaps this board and the watched one when a frame says whom it follows.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { topRightHtml } from "./simulation-board.js";
import {
  heroCardHtml,
  miniMapHtml,
  paintCards,
  paintMini,
  paintScoreboard,
  paintTop,
  scoreboardShellHtml
} from "./simulation-hud.js";
import { eyesMarkup, mapSvg } from "./simulation-map.js";
import { paintCamps, paintCasts, paintFarm, paintHeroes, paintWaves } from "./simulation-paint.js";
import { clock, esc, heroName, setText } from "./simulation-shared.js";
import { spotsHtml } from "./simulation-stand.js";
import { speedLabel, switchHtml } from "./simulation-watch.js";

/** The hero `follow` of a watched game's start, or null. */
export const followedOf = (start, follow) => start.heroes.find(hero => hero.id === follow) ?? null;

/**
 * The screen of the hero `follow` (an id of `start.heroes`), `speed` the speed played now; null for a hero the game
 * does not have. `start` is the watched game's first message (its heroes carry lane, spell and reach).
 */
export function followBoardHtml({ start, heroes, follow, speed, picture = {} }) {
  const me = followedOf(start, follow);
  if (!me) {
    return null;
  }
  const team = start.heroes.filter(hero => hero.side === me.side && hero.id !== me.id);
  const name = heroName(heroes, me.heroId);
  return `<div class="sim-turn" role="alert">${icon("phone")}<p>${t("Turn your phone sideways to watch.")}</p></div>
  <div class="sim-game sim-game--play sim-game--follow">
    <div class="sim-view">
      <div class="sim-map sim-map--${me.side}">
        ${mapSvg(start.map, me.side, { ...picture, marks: false })}
        <span class="sim-reach" data-reach aria-hidden="true"></span>
      </div>
      <div class="sim-dots" data-stand>${spotsHtml(start.map, start.art)}</div>
    </div>
    <div class="sim-hud">
      <div class="sim-hud__left">
        ${miniMapHtml(start.map, me.side, picture)}
        <ul class="sim-cards" aria-label="${esc(t("{name}'s team", { name }))}">${[me, ...team].map(hero => heroCardHtml(heroes, hero, hero.id === me.id)).join("")}</ul>
      </div>
      ${topRightHtml({ pause: false })}
      <div class="sim-follow-bar">
        <p class="sim-follow-bar__name">${esc(t("Watching {name}", { name }))}</p>
        ${switchHtml("speed", start.speeds, speed, t("Speed"), speedLabel)}
        <button type="button" class="btn btn--ghost sim-follow-bar__back" data-sim="overview">${icon("map")}<span>${t("Whole map")}</span></button>
        <button type="button" class="btn btn--ghost sim-follow-bar__leave" data-sim="leave" aria-label="${t("Leave the game")}" title="${t("Leave the game")}">${icon("x")}</button>
      </div>
    </div>
    ${scoreboardShellHtml()}
  </div>
  <div class="sim-end" hidden></div>`;
}

/** One frame of a watched game through the followed hero's eyes (its team's view, sent by the bots server). */
export function paintFollow(run, state, view, now) {
  paintHeroes(run, view, now);
  paintWaves(run, view);
  paintCamps(run, view);
  paintCasts(run, now);
  if (run.eyes) {
    run.layerOf.eyes.innerHTML = eyesMarkup(run.eyes);
    run.layerOf.miniEyes.innerHTML = run.layerOf.eyes.innerHTML;
    run.eyes = null;
  }
  run.lastView = view;
  paintCards(run, view);
  paintTop(run, view);
  paintFarm(run, view);
  paintMini(run, view);
  paintScoreboard(run, view);
  for (const button of run.switches ?? []) {
    const pressed = String(button.dataset.value === String(state.speed));
    if (button.getAttribute("aria-pressed") !== pressed) {
      button.setAttribute("aria-pressed", pressed);
    }
  }
  setText(run.layerOf.clock, clock(state.time));
}
