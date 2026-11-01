// A watched game (the spectator mode): ten bots play the whole match on the bots server, nobody plays. The board
// has the clock, a switch of speeds (Pause, x1 to x16) and a switch of views (everything with no fog, or what the
// blue or the red team sees), the map, and the two teams (health, mana, ultimate, kills and deaths). The map always
// shows the blue base at the bottom. The end names the winner, the length and the kills: no grade, nothing kept.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { paintGauge } from "./simulation-gauge.js";
import { eyesMarkup, mapSvg } from "./simulation-map.js";
import {
  paintCamps,
  paintCasts,
  paintFarm,
  paintHeroes,
  paintWaves,
  setBar,
  share
} from "./simulation-paint.js";
import { clock, esc, heroName, portrait } from "./simulation-shared.js";

const speedLabel = speed => (speed === 0 ? t("Pause") : `x${speed}`);
const VIEW_LABELS = { all: () => t("Everything"), blue: () => t("Blue"), red: () => t("Red") };

const switchHtml = (kind, values, current, label, text) =>
  `<div class="seg sim-switch" role="group" aria-label="${esc(label)}">${values
    .map(
      value =>
        `<button type="button" data-sim="${kind}" data-value="${esc(value)}" aria-pressed="${value === current}">${text(value)}</button>`
    )
    .join("")}</div>`;

const bar = (cls, label) =>
  `<span class="sim-bar ${cls}" role="img" aria-label="${esc(label)}"><i data-p="100"></i></span>`;

function rowHtml(heroes, hero) {
  return `<li class="sim-ally sim-watch-row" data-hero="${esc(hero.id)}"><span class="sim-ally__face">${portrait(heroes, hero.heroId, 32)}<b class="sim-ally__timer" hidden></b></span><span class="sim-ally__bars"><small class="sim-watch-row__name">${esc(heroName(heroes, hero.heroId))}</small>${bar("sim-bar--hp", t("Health"))}${bar("sim-bar--mana", t("Mana"))}${bar("sim-bar--ult", t("Ultimate"))}</span><b class="sim-watch-row__kd" aria-label="${t("Kills and deaths")}">0/0</b></li>`;
}

const teamHtml = (heroes, start, side) =>
  `<section class="sim-watch-team sim-watch-team--${side}"><h3>${side === "red" ? t("Red team") : t("Blue team")}</h3><ul>${start.heroes
    .filter(hero => hero.side === side)
    .map(hero => rowHtml(heroes, hero))
    .join("")}</ul></section>`;

/** The board of a watched game. `start` is the bots server's first message (mode "watch"). */
export function watchBoardHtml({ start, heroes, picture = {} }) {
  return `<div class="sim-turn" role="alert">${icon("phone")}<p>${t("Turn your phone sideways to watch.")}</p></div>
  <div class="sim-game sim-game--watch">
    <header class="sim-top sim-watch-top">
      <b class="sim-clock" aria-label="${t("Game time")}">00:00</b>
      ${switchHtml("speed", start.speeds, start.speed, t("Speed"), speedLabel)}
      ${switchHtml("view", start.views, start.view, t("View"), view => VIEW_LABELS[view]())}
    </header>
    <div class="sim-main">
      <div class="sim-map sim-map--blue${start.view === "all" ? " is-clear" : ""}">
        ${mapSvg(start.map, "blue", picture)}
        <div class="sim-dots"></div>
      </div>
      <aside class="sim-panel sim-watch-panel">
        <div class="sim-farm" aria-label="${t("Gold of both teams")}"><span class="sim-farm__side sim-farm__side--blue"><small>${t("Blue")}</small><b data-farm="blue">0</b></span><span class="sim-bar sim-bar--farm"><i data-p="50"></i></span><span class="sim-farm__side sim-farm__side--red"><small>${t("Red")}</small><b data-farm="red">0</b></span></div>
        ${teamHtml(heroes, start, "blue")}
        ${teamHtml(heroes, start, "red")}
        <button type="button" class="btn btn--ghost sim-leave" data-sim="leave" aria-label="${t("Leave the game")}">${icon("x")}<span>${t("Leave the game")}</span></button>
      </aside>
    </div>
  </div>
  <div class="sim-end" hidden></div>`;
}

/** The end of a watched game: the winner, the length and the kills of each team. */
export function watchEndHtml(result) {
  const winner =
    result.winner === "blue"
      ? t("Blue wins")
      : result.winner === "red"
        ? t("Red wins")
        : t("No winner");
  return `<div class="sim-grade-card sim-watch-end" role="dialog" aria-modal="true" aria-labelledby="sim-watch-end-title">
    <p class="sim-cover__kicker">${t("Game over")}</p>
    <h2 id="sim-watch-end-title">${winner}</h2>
    <dl class="sim-watch-end__facts">
      <div><dt>${t("Game length")}</dt><dd>${clock(result.duration)}</dd></div>
      <div><dt>${t("Blue kills")}</dt><dd>${Number(result.kills?.blue ?? 0)}</dd></div>
      <div><dt>${t("Red kills")}</dt><dd>${Number(result.kills?.red ?? 0)}</dd></div>
    </dl>
    <button type="button" class="btn btn--primary" data-sim="leave">${t("Back to the set-up")}</button>
  </div>`;
}

/** The rows of both teams: bars of the heroes the view shows, kills and deaths always (the scoreboard is public). */
function paintTeams(run, view) {
  const shown = new Map(view.heroes.map(hero => [hero.id, hero]));
  const score = new Map((view.scoreboard ?? []).map(entry => [entry.id, entry]));
  for (const [id, row] of run.teamRows) {
    const hero = shown.get(id);
    const line = score.get(id);
    row.querySelector(".sim-watch-row__kd").textContent = line
      ? `${line.kills}/${line.deaths}`
      : "";
    row.classList.toggle("is-unseen", !hero);
    if (!hero) {
      continue;
    }
    const [hp, mana, ult] = row.querySelectorAll(".sim-bar");
    setBar(hp, hero.alive ? share(hero.hp ?? 1, hero.maxHp ?? 1) : 0);
    paintGauge(mana, hero);
    setBar(ult, hero.ult ? 100 : 0);
    ult.classList.toggle("is-ready", Boolean(hero.ult));
    const timer = row.querySelector(".sim-ally__timer");
    timer.hidden = hero.alive || hero.respawnAt === undefined;
    if (!timer.hidden) {
      timer.textContent = String(Math.max(0, Math.ceil(hero.respawnAt - view.time)));
    }
    row.classList.toggle("is-dead", !hero.alive);
  }
}

/** The switches show what the bots server plays now (a click asks; the next frame says). */
function paintSwitches(run, state, view) {
  const current = { speed: String(state.speed), view: view.side };
  for (const button of run.switches) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.value === current[button.dataset.sim])
    );
  }
  run.layerOf.map.classList.toggle("is-clear", view.side === "all");
  if (view.side === "all") {
    run.layerOf.eyes.innerHTML = "";
  } else if (run.eyes) {
    run.layerOf.eyes.innerHTML = eyesMarkup(run.eyes);
  }
  run.eyes = null;
}

/** One frame of a watched game. */
export function paintWatch(run, state, view, now) {
  paintHeroes(run, view, now);
  paintWaves(run, view);
  paintCamps(run, view);
  paintCasts(run, now);
  paintTeams(run, view);
  paintFarm(run, view);
  paintSwitches(run, state, view);
  run.layerOf.clock.textContent = clock(state.time);
}

/** What the watched board adds to the parts simulation-run.js binds. */
export function bindWatch(run) {
  run.teamRows = new Map(
    [...run.layer.querySelectorAll("[data-hero]")].map(row => [row.dataset.hero, row])
  );
  run.switches = [...run.layer.querySelectorAll('[data-sim="speed"], [data-sim="view"]')];
}
