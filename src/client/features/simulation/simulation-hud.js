// The heads-up display of a game played by hand, around the camera's field (simulation-board.js lays it out):
// - the minimap: the whole map with its fog, the towers that stand, the heroes the side sees and the camera's
//   frame;
// - the cards of the player's hero and of the allies: portrait, level, health cut every 1000 points as in the
//   game, the gauge in place of mana (simulation-gauge.js), a ring when the ultimate is ready, the respawn countdown;
// - the top right: the clock, the kills of both teams, the player's kills, deaths and assists;
// - the scoreboard (☰): both teams, each hero's level, kills, deaths, assists and items, the kills and the gold of
//   each team. It does not pause the game, as in the game.
// The items' pictures come from the catalogue (run.items, loaded with the board).
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { catalogImageAttrs } from "../../domain/catalog-display.js";
import { paintGauge } from "./simulation-gauge.js";
import { mapSvg, placeOnBoard } from "./simulation-map.js";
import { esc, heroName, portrait } from "./simulation-shared.js";

const SEGMENT_HP = 1000;
const ITEM_SLOTS = 6;

/** A health bar cut every 1000 points (`--segments` is written with its length). */
export const healthBar = cls =>
  `<span class="sim-bar sim-bar--hp ${cls}" role="img" aria-label="${esc(t("Health"))}"><i></i></span>`;

/** The minimap: the same map, small, with its own fog and marks (simulation-map.js `mini`). */
export function miniMapHtml(map, side, picture) {
  return `<div class="sim-mini" role="img" aria-label="${esc(t("Map"))}">
    ${mapSvg(map, side, { ...picture, debug: false, mini: true })}
    <div class="sim-mini__dots"></div>
    <span class="sim-mini__frame"></span>
  </div>`;
}

/** The card of one hero of the side: the player's own is ringed in gold and comes first. */
export function heroCardHtml(heroes, hero, mine) {
  return `<li class="sim-card${mine ? " is-me" : ""}" data-card="${esc(hero.id)}" title="${esc(heroName(heroes, hero.heroId))}">
    <span class="sim-card__face">${portrait(heroes, hero.heroId, 40)}<b class="sim-card__level">1</b><b class="sim-card__timer" hidden></b></span>
    <span class="sim-card__bars">${healthBar("")}<span class="sim-bar sim-bar--mana" role="img" aria-label="${esc(t("Mana"))}"><i></i></span></span>
  </li>`;
}

/** The scoreboard's frame, empty and closed: simulation-hud.js fills it while it is open. */
export const scoreboardShellHtml =
  () => `<div class="sim-scores" role="dialog" aria-modal="false" aria-labelledby="sim-scores-title" hidden>
    <div class="sim-scores__card">
      <header class="sim-scores__head"><h2 id="sim-scores-title">${t("Scoreboard")}</h2><button type="button" class="sim-hud__button" data-sim="scoreboard" aria-label="${t("Close")}" title="${t("Close")}">${icon("x")}</button></header>
      <div class="sim-scores__teams"></div>
    </div>
  </div>`;

function itemCell(run, id) {
  const item = run.items?.get(String(id));
  if (!item) {
    return `<span class="sim-item" title="${esc(String(id))}"></span>`;
  }
  const picture = item.imageId
    ? `<img ${catalogImageAttrs(item.imageId, 28)} alt="" width="28" height="28" decoding="async">`
    : "";
  return `<span class="sim-item" title="${esc(item.name)}">${picture}<span class="visually-hidden">${esc(item.name)}</span></span>`;
}

function scoreRow(run, entry) {
  const items = entry.items ?? [];
  const cells = Array.from({ length: ITEM_SLOTS }, (_, slot) =>
    slot < items.length ? itemCell(run, items[slot]) : `<span class="sim-item is-empty"></span>`
  ).join("");
  const mine = entry.id === run.me.id ? " is-me" : "";
  return `<li class="sim-scores__row${mine}">
    <span class="sim-card__face">${portrait(run.heroes, entry.heroId, 36)}<b class="sim-card__level">${entry.level}</b></span>
    <span class="sim-scores__name">${esc(heroName(run.heroes, entry.heroId))}</span>
    <b class="sim-scores__kda">${entry.kills} / ${entry.deaths} / ${entry.assists ?? 0}</b>
    <span class="sim-scores__items" aria-label="${esc(t("Items"))}">${cells}</span>
  </li>`;
}

function teamHtml(run, view, side) {
  const rows = view.scoreboard.filter(entry => entry.side === side);
  const kills = rows.reduce((sum, entry) => sum + entry.kills, 0);
  return `<section class="sim-scores__team sim-scores__team--${side}">
    <h3><span>${side === "red" ? t("Red") : t("Blue")}</span><b>${kills}</b><small>${t("Gold")} ${Math.round(view.farm[side])}</small></h3>
    <ol>${rows.map(entry => scoreRow(run, entry)).join("")}</ol>
  </section>`;
}

/** Fills the scoreboard while it is open, again only when what it shows changed. */
export function paintScoreboard(run, view) {
  const box = run.layerOf.scores;
  if (box.hidden) {
    return;
  }
  const own = run.side;
  const html = [own, own === "blue" ? "red" : "blue"]
    .map(side => teamHtml(run, view, side))
    .join("");
  if (html !== run.keys.scores) {
    run.keys.scores = html;
    box.querySelector(".sim-scores__teams").innerHTML = html;
  }
}

/** Opens or closes the scoreboard. */
export function toggleScoreboard(run) {
  const box = run.layerOf.scores;
  box.hidden = !box.hidden;
  run.keys.scores = "";
  if (!box.hidden && run.lastView) {
    paintScoreboard(run, run.lastView);
  }
  (box.hidden ? run.layerOf.scoresButton : box.querySelector("button"))?.focus();
}

/** `part` as a share of `whole`, from 0 to 100. */
export const share = (part, whole) =>
  whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0;

/** A bar's length (0..100) and, for health, its cuts every 1000 points. */
export function fillBar(bar, percent, maxHp) {
  const fill = bar?.firstElementChild;
  if (!fill) {
    return;
  }
  if (fill.dataset.p !== String(percent)) {
    fill.dataset.p = String(percent);
    fill.style.setProperty("--p", String(percent));
  }
  if (maxHp !== undefined) {
    const segments = String(Math.max(1, maxHp / SEGMENT_HP).toFixed(2));
    if (bar.dataset.segments !== segments) {
      bar.dataset.segments = segments;
      bar.style.setProperty("--segments", segments);
    }
  }
}

/** The cards of the side's heroes. */
export function paintCards(run, view) {
  for (const hero of view.heroes.filter(h => h.side === run.side)) {
    const card = run.cards.get(hero.id);
    if (!card) {
      continue;
    }
    const [hp, mana] = card.querySelectorAll(".sim-bar");
    fillBar(hp, hero.alive ? share(hero.hp ?? 1, hero.maxHp ?? 1) : 0, hero.maxHp ?? SEGMENT_HP);
    paintGauge(mana, hero);
    card.querySelector(".sim-card__level").textContent = String(hero.level ?? 1);
    card.classList.toggle("is-ult", hero.alive && Boolean(hero.ult));
    card.classList.toggle("is-dead", !hero.alive);
    const timer = card.querySelector(".sim-card__timer");
    timer.hidden = hero.alive;
    if (!hero.alive) {
      timer.textContent = String(Math.max(0, Math.ceil((hero.respawnAt ?? 0) - view.time)));
    }
  }
}

/** The clock's neighbours: the kills of both teams and the player's own count (the gold: paintFarm). */
export function paintTop(run, view) {
  const { layerOf } = run;
  const kills = { blue: 0, red: 0 };
  for (const entry of view.scoreboard) {
    kills[entry.side] += entry.kills;
  }
  layerOf.scoreBlue.textContent = String(kills.blue);
  layerOf.scoreRed.textContent = String(kills.red);
  const mine = view.scoreboard.find(entry => entry.id === run.me.id);
  if (mine) {
    layerOf.kda.textContent = `${mine.kills} / ${mine.deaths} / ${mine.assists ?? 0}`;
  }
}

function miniDot(run, hero) {
  let dot = run.miniDots.get(hero.id);
  if (!dot) {
    dot = document.createElement("span");
    const mine = hero.id === run.me.id ? " is-me" : "";
    dot.className = `sim-mini__hero sim-mini__hero--${hero.side === run.side ? "ally" : "enemy"}${mine}`;
    dot.innerHTML = portrait(run.heroes, hero.heroId, 20);
    run.layerOf.miniDots.append(dot);
    run.miniDots.set(hero.id, dot);
  }
  return dot;
}

/** Puts `element` at map point `at` on a board of `side` (shares of its width and height). */
export function placeAt(element, at, side) {
  const [x, y] = placeOnBoard(at, side);
  element.style.left = `${x.toFixed(2)}%`;
  element.style.top = `${y.toFixed(2)}%`;
}

/** The heroes the side sees, on the minimap, where they are drawn on the field. */
export function paintMini(run, view) {
  const shown = new Set();
  for (const hero of view.heroes.filter(h => h.alive)) {
    const dot = miniDot(run, hero);
    shown.add(hero.id);
    dot.hidden = false;
    placeAt(dot, run.glide.get(hero.id)?.drawn ?? hero.pos, run.side);
  }
  for (const [id, dot] of run.miniDots) {
    if (!shown.has(id)) {
      dot.hidden = true;
    }
  }
  for (const tower of view.towers) {
    run.miniTowers.get(tower.id)?.classList.toggle("is-down", !tower.alive);
  }
}
