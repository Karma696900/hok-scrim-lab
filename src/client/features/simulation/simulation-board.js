// The board of a game, drawn once when it starts: the allies at the top (health, mana, a yellow bar
// when their ultimate is ready), the clock and the pause; the map with the dots, the decision box in
// its top-left corner and the cover that hides it (question, pause); the side panel with the gold of
// both teams, the player's hero (its skill cooldowns, its spell or Punish) and the four free calls.
// simulation-paint.js fills it at every frame; simulation-popups.js draws what opens on top.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { laneName } from "../../domain/lanes.js";
import { mapSvg } from "./simulation-map.js";
import { esc, heroName, portrait } from "./simulation-shared.js";

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

const SKILL_LABELS = { s1: "1", s2: "2", s3: "3", s4: "4", ult: "U" };

const bar = (cls, label) =>
  `<span class="sim-bar ${cls}" role="img" aria-label="${esc(label)}"><i data-p="100"></i></span>`;

function allyHtml(heroes, hero) {
  return `<li class="sim-ally" data-ally="${esc(hero.id)}"><span class="sim-ally__face">${portrait(heroes, hero.heroId, 32)}<b class="sim-ally__timer" hidden></b></span><span class="sim-ally__bars">${bar("sim-bar--hp", t("Health"))}${bar("sim-bar--mana", t("Mana"))}${bar("sim-bar--ult", t("Ultimate"))}</span></li>`;
}

function meHtml(heroes, me) {
  const skills = Object.keys(SKILL_LABELS)
    .filter(key => (me.skills ?? []).includes(key))
    .map(
      key =>
        `<li class="sim-skill" data-skill="${key}"><span class="sim-skill__pic">${SKILL_LABELS[key]}</span><b class="sim-skill__cd" hidden></b></li>`
    )
    .join("");
  const spell = SPELL_NAMES[me.spell]?.() ?? esc(me.spell ?? "");
  return `<div class="sim-me">
    <div class="sim-me__who"><span class="sim-me__face">${portrait(heroes, me.heroId, 48)}</span><span><b>${esc(heroName(heroes, me.heroId))}</b><small>${laneName(me.lane ?? "")}</small></span></div>
    ${bar("sim-bar--hp", t("Health"))}
    <ul class="sim-skills" aria-label="${t("Your skills")}">${skills}</ul>
    <button type="button" class="btn sim-spell" data-sim="spell">${icon(me.spell === "punish" ? "flame" : "bolt")}<span>${spell}</span><b class="sim-spell__state"></b></button>
  </div>`;
}

const callsHtml = calls =>
  `<div class="sim-calls" role="group" aria-label="${t("Calls")}">${calls
    .map(
      entry =>
        `<button type="button" class="btn sim-call" data-sim="call" data-call="${entry.id}" aria-label="${t(entry.label)}" title="${t(entry.label)}">${icon(entry.icon)}<span>${t(entry.label)}</span></button>`
    )
    .join("")}</div>`;

/**
 * The board. `start` is the bots server's first message (the map, the ten heroes, the player's hero `me`
 * with its lane and skills, the free calls), `heroes` the roster (names and portraits), `picture` the
 * picture of the map (`{ image, debug }`).
 */
export function boardHtml({ start, heroes, picture = {} }) {
  const { me, calls } = start;
  const allies = start.heroes.filter(hero => hero.side === me.side && hero.id !== me.id);
  return `<div class="sim-turn" role="alert">${icon("phone")}<p>${t("Turn your phone sideways to play.")}</p></div>
  <div class="sim-game">
    <header class="sim-top">
      <ul class="sim-allies" aria-label="${t("Your allies")}">${allies.map(hero => allyHtml(heroes, hero)).join("")}</ul>
      <b class="sim-clock" aria-label="${t("Game time")}">00:00</b>
      <button type="button" class="btn sim-pause" data-sim="pause" aria-label="${t("Pause")}">${icon("pause")}<span>${t("Pause")}</span></button>
    </header>
    <div class="sim-main">
      <div class="sim-map sim-map--${me.side}">
        ${mapSvg(start.map, me.side, picture)}
        <div class="sim-dots"></div>
        <div class="sim-decision" aria-live="polite" hidden></div>
        <div class="sim-death" hidden></div>
        <div class="sim-cover" hidden></div>
      </div>
      <aside class="sim-panel">
        <div class="sim-farm" aria-label="${t("Gold of both teams")}"><span class="sim-farm__side sim-farm__side--blue"><small>${t("Blue")}</small><b data-farm="blue">0</b></span><span class="sim-bar sim-bar--farm"><i data-p="50"></i></span><span class="sim-farm__side sim-farm__side--red"><small>${t("Red")}</small><b data-farm="red">0</b></span></div>
        ${meHtml(heroes, me)}
        ${callsHtml(calls)}
        <button type="button" class="btn btn--ghost sim-leave" data-sim="leave" aria-label="${t("Leave the game")}">${icon("x")}<span>${t("Leave the game")}</span></button>
      </aside>
    </div>
  </div>
  <div class="sim-end" hidden></div>`;
}
