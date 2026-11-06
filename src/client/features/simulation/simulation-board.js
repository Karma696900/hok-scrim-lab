// The board of a game, laid out like the game's own screen and drawn once when it starts. The field fills the
// screen and a camera follows the player's hero (simulation-camera.js). Over it:
// - top left: the minimap and, to its right, the player's hero and the allies (portrait, level, health, mana, a
//   ready ultimate, the respawn countdown);
// - top right: the clock, the kills of both teams, the player's kills, deaths and assists, the scoreboard (☰) and
//   the pause (⚙), with the gold of both teams under them;
// - on the right edge: the four free calls;
// - at the bottom: the joystick on the left; the attack buttons on the right (no skills: the AI casts them); the
//   summoner spell (or Punish) in the middle.
// No shop. simulation-paint.js and simulation-hud.js fill it at
// every frame; simulation-popups.js draws what opens on top.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { controlsHtml } from "./simulation-controls.js";
import { heroCardHtml, miniMapHtml, scoreboardShellHtml } from "./simulation-hud.js";
import { homeToolsHtml } from "./simulation-home.js";
import { portalToolsHtml } from "./simulation-portal.js";
import { mapSvg } from "./simulation-map.js";
import { spotsHtml } from "./simulation-stand.js";
import { esc } from "./simulation-shared.js";

/** The engine's summoner spells, as the button names them. */
export const SPELL_NAMES = {
  punish: () => t("Punish"),
  flash: () => t("Flash"),
  heal: () => t("Heal"),
  sprint: () => t("Sprint"),
  teleport: () => t("Teleport"),
  execute: () => t("Execute"),
  frenzy: () => t("Frenzy"),
  intimidate: () => t("Intimidate"),
  purify: () => t("Purify"),
  stun: () => t("Stun")
};

const callsHtml = calls =>
  `<div class="sim-calls" role="group" aria-label="${t("Calls")}">${calls
    .map(
      entry =>
        `<button type="button" class="sim-call" data-sim="call" data-call="${entry.id}" aria-label="${t(entry.label)}" title="${t(entry.label)}">${icon(entry.icon)}</button>`
    )
    .join("")}</div>`;

function spellHtml(me) {
  const name = SPELL_NAMES[me.spell]?.() ?? esc(me.spell ?? "");
  return `<button type="button" class="sim-spell" data-sim="spell" aria-label="${esc(name)}" title="${esc(name)}">${icon(me.spell === "punish" ? "flame" : "bolt")}<span class="sim-spell__name">${name}</span><b class="sim-spell__time" hidden></b></button>`;
}

/** The top right of the screen; `pause: false` leaves the pause out (a watched game pauses with its speed). */
export const topRightHtml = ({ pause = true } = {}) => `<div class="sim-hud__right">
    <div class="sim-scorebar">
      <span class="sim-scorebar__time"><b class="sim-clock" aria-label="${t("Game time")}">00:00</b><span class="sim-score" aria-label="${t("Score")}"><b data-score="blue">0</b><small>vs</small><b data-score="red">0</b></span></span>
      <span class="sim-kda" aria-label="${t("Kills, deaths and assists")}"><b data-kda>0 / 0 / 0</b></span>
      <button type="button" class="sim-hud__button" data-sim="scoreboard" aria-haspopup="dialog" aria-label="${t("Scoreboard")}" title="${t("Scoreboard")}">${icon("list")}</button>
      ${pause ? `<button type="button" class="sim-hud__button" data-sim="pause" aria-label="${t("Pause")}" title="${t("Pause")}">${icon("settings")}</button>` : ""}
    </div>
    <div class="sim-farm" aria-label="${t("Gold of both teams")}"><b class="sim-farm__gold sim-farm__gold--blue" data-farm="blue">0</b><span class="sim-bar sim-bar--farm"><i data-p="50"></i></span><b class="sim-farm__gold sim-farm__gold--red" data-farm="red">0</b></div>
  </div>`;

/**
 * The board. `start` is the bots server's first message (the map, the ten heroes, the player's hero `me`
 * with its lane, spell and skills, the free calls), `heroes` the roster (names and portraits), `picture` the
 * picture of the map (`{ image, debug }`).
 */
export function boardHtml({ start, heroes, picture = {} }) {
  const { me, calls } = start;
  const allies = start.heroes.filter(hero => hero.side === me.side && hero.id !== me.id);
  return `<div class="sim-turn" role="alert">${icon("phone")}<p>${t("Turn your phone sideways to play.")}</p></div>
  <div class="sim-game sim-game--play">
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
        <ul class="sim-cards" aria-label="${t("Your allies")}">${[me, ...allies].map(hero => heroCardHtml(heroes, hero, hero.id === me.id)).join("")}</ul>
      </div>
      ${topRightHtml()}
      <div class="sim-target" data-target aria-live="polite" hidden></div>
      ${callsHtml(calls)}
      ${controlsHtml()}
      <div class="sim-tools">${portalToolsHtml()}${homeToolsHtml(start.art)}${spellHtml(me)}</div>
    </div>
    <div class="sim-death" hidden></div>
    <div class="sim-cover" hidden></div>
    ${scoreboardShellHtml()}
  </div>
  <div class="sim-end" hidden></div>`;
}
