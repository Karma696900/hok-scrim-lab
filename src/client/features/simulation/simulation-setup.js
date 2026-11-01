// The set-up screen of the Game Simulation: the stage (title and introduction, the same for every
// visitor, so the server draws it), then the choices of the game: the side, the role of the hero the
// player takes, the difficulty, and the ten heroes, drawn at random by the scrim engine or chosen by
// hand slot by slot. Pure markup: the page keeps the choices in its view object.
import { icon } from "../../../shared/icons.js";
import { dateTime, t } from "../../app/browser-i18n.js";
import { laneName } from "../../domain/lanes.js";
import { stageHero, stageHtml } from "../community/stage.js";
import {
  DIFFICULTIES,
  LANES,
  SIDES,
  difficultyLabel,
  esc,
  heroName,
  heroOf,
  portrait,
  sideLabel
} from "./simulation-shared.js";

/** The stage: what the page is, in two or three sentences a visitor reads before playing. */
export const introHtml = () =>
  stageHtml({
    cls: "sim-stage",
    hero: stageHero(4),
    lead: `<p class="eyebrow">${t("Play")}</p>`,
    title: t("Game Simulation"),
    text: t(
      "Play a whole Honor of Kings match as one hero, seen from above on the map. Move with the joystick or W A S D and attack with the buttons: your skills are cast for you. Your macro is graded behind the scenes (where you go, what you take, and when), and the grade comes at the end."
    )
  });

const segment = (act, values, current, label) =>
  `<div class="seg" role="group" aria-label="${esc(label)}">${values
    .map(
      ([value, text]) =>
        `<button type="button" data-act="${act}" data-value="${esc(value)}" aria-pressed="${value === current}">${text}</button>`
    )
    .join("")}</div>`;

/** The heroes of the pool who play `lane`, by name. */
function laneHeroes(view, lane) {
  const pool = new Set(view.pool ?? []);
  return view.heroes
    .filter(hero => pool.has(hero.id) && (hero.lanes ?? []).includes(lane))
    .sort((a, b) => heroName(view.heroes, a.id).localeCompare(heroName(view.heroes, b.id)));
}

function slotHtml(view, side, lane) {
  const key = `${side}:${lane}`;
  const chosen = view.fixed[key] ?? "";
  const mine = view.mode !== "watch" && side === view.side && lane === view.lane;
  const options = laneHeroes(view, lane)
    .map(
      hero =>
        `<option value="${esc(hero.id)}"${hero.id === chosen ? " selected" : ""}>${esc(heroName(view.heroes, hero.id))}</option>`
    )
    .join("");
  return `<label class="sim-slot${mine ? " is-mine" : ""}"><span class="sim-slot__face">${chosen && heroOf(view.heroes, chosen) ? portrait(view.heroes, chosen, 32) : icon("user")}</span><span class="sim-slot__lane">${laneName(lane)}${mine ? ` <em>${t("You")}</em>` : ""}</span><select data-slot="${esc(key)}"><option value="">${t("Random")}</option>${options}</select></label>`;
}

function heroesHtml(view) {
  if (!view.handPicked) {
    return view.mode === "watch"
      ? `<p class="muted sim-hint">${t("The scrim engine draws one hero for each lane of both teams.")}</p>`
      : `<p class="muted sim-hint">${t("The scrim engine draws one hero for each lane of both teams. You play the one of your role.")}</p>`;
  }
  if (view.pool === null) {
    return `<p class="muted sim-hint">${t("Loading the heroes…")}</p>`;
  }
  return `<div class="sim-slots">${SIDES.map(
    side =>
      `<div class="sim-team sim-team--${side}"><h3>${sideLabel(side)}</h3>${LANES.map(lane => slotHtml(view, side, lane)).join("")}</div>`
  ).join(
    ""
  )}</div><p class="muted sim-hint">${t("A slot left on Random is drawn by the scrim engine.")}</p>`;
}

/** The side, the role and the difficulty: only for a game the player plays. */
function playFieldsHtml(view) {
  return `<div class="sim-field"><span class="label">${t("Your side")}</span>${segment(
    "side",
    SIDES.map(side => [side, sideLabel(side)]),
    view.side,
    t("Your side")
  )}</div>
    <div class="sim-field"><span class="label">${t("Your role")}</span>${segment(
      "lane",
      LANES.map(lane => [lane, laneName(lane)]),
      view.lane,
      t("Your role")
    )}</div>
    <div class="sim-field"><span class="label">${t("Difficulty")}</span>${segment(
      "difficulty",
      DIFFICULTIES.map(level => [level, difficultyLabel(level)]),
      view.difficulty,
      t("Difficulty")
    )}<p class="muted sim-hint">${t("The enemy team plays harder after wrong decisions, and eases off again after good ones.")}</p></div>`;
}

/** The choices of the game and the button that starts it. */
export function setupHtml(view) {
  const busy = view.starting;
  const watch = view.mode === "watch";
  const label = busy
    ? t("Setting up the game…")
    : watch
      ? t("Watch the game")
      : t("Start the game");
  return `<section class="card sim-setup" aria-labelledby="sim-setup-title">
    <h2 id="sim-setup-title">${t("Set up your game")}</h2>
    <div class="sim-field"><span class="label">${t("Mode")}</span>${segment(
      "mode",
      [
        ["play", t("Play a hero")],
        ["watch", t("Watch ten bots")]
      ],
      watch ? "watch" : "play",
      t("Mode")
    )}${watch ? `<p class="muted sim-hint">${t("Ten bots play the whole match. While you watch, change the speed and the view: everything, or what one team sees.")}</p>` : ""}</div>
    ${watch ? "" : playFieldsHtml(view)}
    <div class="sim-field"><span class="label">${t("Heroes")}</span>${segment(
      "heroes",
      [
        ["random", t("Random heroes")],
        ["hand", t("Choose the heroes")]
      ],
      view.handPicked ? "hand" : "random",
      t("Heroes")
    )}${heroesHtml(view)}</div>
    <p class="sim-phone muted">${icon("phone")}${t("On a phone, play with the screen turned sideways.")}</p>
    <div class="sim-start"><button type="button" class="btn btn--primary btn--lg" data-act="start"${busy ? " disabled" : ""}>${icon("play")}${label}</button></div>
    ${view.problem ? `<p class="error-block" role="alert">${esc(view.problem)}</p>` : ""}
  </section>`;
}

/** The last games of a signed-in player (grade, difficulty, date, hero); nothing for a visitor. */
export function historyHtml(view) {
  if (!view.signedIn) {
    return `<section class="card sim-history"><h2>${t("Your games")}</h2><p class="muted">${t("Sign in to keep your games and their grade.")}</p></section>`;
  }
  if (view.history === null) {
    return `<section class="card sim-history"><h2>${t("Your games")}</h2><p class="muted">${t("Loading…")}</p></section>`;
  }
  const rows = view.history
    .map(
      game =>
        `<li class="sim-past"><span class="sim-past__face">${portrait(view.heroes, game.heroId, 32)}</span><span class="sim-past__hero">${esc(heroName(view.heroes, game.heroId))}<small>${laneName(game.lane)} · ${sideLabel(game.side)}</small></span><span class="sim-past__level">${difficultyLabel(game.difficulty)}</span><time datetime="${new Date(game.playedAt).toISOString()}">${dateTime(game.playedAt)}</time><b class="sim-grade sim-grade--${esc(game.grade.toLowerCase())}">${esc(game.grade)}</b></li>`
    )
    .join("");
  return `<section class="card sim-history"><h2>${t("Your games")}</h2>${
    rows ? `<ol class="sim-pasts">${rows}</ol>` : `<p class="muted">${t("No game yet.")}</p>`
  }</section>`;
}

/** The whole set-up screen. */
export const pageHtml = view =>
  `<div class="sim-page">${introHtml()}<div class="sim-columns">${setupHtml(view)}${historyHtml(view)}</div></div>`;
