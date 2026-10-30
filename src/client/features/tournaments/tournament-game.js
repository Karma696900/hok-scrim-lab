// One game of the editor: the picks and bans, the lane of each pick, the hero picker, the matchups.
import { GROUPS, LANES, PICKS } from "./tournament-model.js";
import { classLabel, laneLabel, laneLogos, laneName } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { responsive } from "../../../shared/media.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { heroName, laneText, other, portrait } from "./tournament-parts.js";

// ---- markup of a game -------------------------------------------------------------------------

export const slotMarkup = (view, gameIndex, group, side, index, game) => {
  const id = game[group][side][index];
  const hero = id ? view.heroById(id) : null;
  const isActive =
    view.active &&
    view.active.game === gameIndex &&
    view.active.group === group &&
    view.active.side === side &&
    view.active.index === index;
  const label = hero ? heroName(hero) : t("Empty slot");
  const size = group === "picks" ? 64 : 44;
  const body = hero?.image
    ? `<img ${responsive(hero.image, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : hero
      ? `<span class="image-fallback"></span>`
      : `<span class="slot-plus" aria-hidden="true">${icon("plus")}</span>`;
  return `<button type="button" class="draft-slot slot-${side}${isActive ? " active" : ""}${hero ? " filled" : ""}" data-slot="${gameIndex}:${group}:${side}:${index}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${isActive}">${body}</button>`;
};

/**
 * A pick: the hero, then the cell of the lane it was played in. The whole cell accepts a dropped
 * logo.
 */
export const pickCell = (view, gameIndex, side, index, game) => {
  const lane = game.lanes[side][index];
  const hero = game.picks[side][index] ? view.heroById(game.picks[side][index]) : null;
  const key = `${gameIndex}:${side}:${index}`;
  const name = hero
    ? t("{hero}: {lane}", { hero: heroName(hero), lane: laneText(lane) })
    : t("Choose a hero first.");
  const draggable = hero && lane ? ' draggable="true"' : "";
  const inner = lane
    ? `${laneLogos([lane], 32)}<small>${escapeHtml(laneLabel(lane))}</small>`
    : `<small>${hero ? t("No lane yet") : "—"}</small>`;
  const who = hero
    ? `<b>${escapeHtml(heroName(hero))}</b><small>${escapeHtml((hero.roles ?? []).map(classLabel).join(" · "))}</small>`
    : `<b class="faint">${t("Empty slot")}</b><small>${t("Choose a hero")}</small>`;
  return `<div class="pick-cell${view.armed !== null && hero ? " can-drop" : ""}" data-cell="${key}">${view.slotMarkup(gameIndex, "picks", side, index, game)}<span class="pick-name">${who}</span><button type="button" class="lane-cell${lane ? " set" : ""}" data-lane-cell="${key}"${hero ? "" : " disabled"}${draggable} aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">${inner}</button></div>`;
};

export const lanePalette = (view, gameIndex) => {
  const tool = (lane, label, inner) =>
    `<button type="button" class="lane-tool${view.armed === lane ? " armed" : ""}" data-lane-tool="${escapeHtml(lane)}" draggable="true" aria-pressed="${view.armed === lane}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${inner}</button>`;
  const lanes = LANES.map(lane =>
    tool(
      lane,
      laneName(lane),
      `${laneLogos([lane], 34)}<span>${escapeHtml(laneLabel(lane))}</span>`
    )
  ).join("");
  const none = tool(
    "",
    t("No lane"),
    `<span class="lane-none" aria-hidden="true">${icon("x")}</span><span>${t("No lane")}</span>`
  );
  return `<div class="palette-bar"><div class="palette-bar__txt"><b>${t("Lane played")}</b><span class="lane-hint">${t("Slide a lane onto a hero, or click a lane and then a hero.")}</span></div><button type="button" class="btn btn--sm lane-suggest" data-suggest="${gameIndex}">${icon("bolt", "i--sm")}${t("Suggest the lanes")}</button><div class="lane-palette" role="group" aria-label="${t("Lane played")}" data-game="${gameIndex}">${lanes}${none}</div></div>`;
};

export const matches = (view, hero) => {
  const needle = view.search.trim().toLocaleLowerCase();
  return (
    !needle ||
    [heroName(hero), hero.englishName, hero.name, hero.id].some(value =>
      String(value ?? "")
        .toLocaleLowerCase()
        .includes(needle)
    )
  );
};

/** The heroes to pick from, as portraits: the whole roster, the ones already in the game greyed out. */
export const pickerMarkup = (view, game) => {
  const shown = view.heroes().filter(view.matches);
  return `<div class="picker"><label class="field field--search"><span class="visually-hidden">${t("Search a hero")}</span>${icon("search", "i--sm")}<input id="picker-search" type="search" autocomplete="off" placeholder="${t("Type a hero, Enter to pick")}" value="${escapeHtml(view.search)}"></label>
      <div class="picker-grid" id="picker-grid">${pickerGrid(shown, view.usedIn(game))}</div></div>`;
};

export const pickerGrid = (shown, used) =>
  shown.length
    ? shown
        .map(
          hero =>
            `<button type="button" class="picker-hero" data-pick="${escapeHtml(hero.id)}"${used.has(hero.id) ? " disabled" : ""} aria-label="${escapeHtml(heroName(hero))}" title="${escapeHtml(heroName(hero))}">${hero.image ? `<img ${responsive(hero.image, 128)} alt="" width="96" height="128" loading="lazy" decoding="async">` : `<span class="image-fallback"></span>`}<span>${escapeHtml(heroName(hero))}</span></button>`
        )
        .join("")
    : `<p class="muted">${t("No hero matches.")}</p>`;

/** What is left to enter on a game: the lane of each hero that was picked. */
export const statusMarkup = game => {
  const missing = side =>
    game.picks[side].filter((heroId, at) => heroId && !game.lanes[side][at]).length;
  if (!game.picks.blue.some(Boolean) && !game.picks.red.some(Boolean)) {
    return "";
  }
  const count = missing("blue") + missing("red");
  return count
    ? `<b class="todo">${t("{count, plural, one {# lane to enter} other {# lanes to enter}} · blue {blue}, red {red}", { count, blue: missing("blue"), red: missing("red") })}</b>`
    : `<b class="ok">${t("All lanes are filled in.")}</b>`;
};

/** The two heroes that met in each lane of a game (blue against red). */
export const matchupsMarkup = (view, game) =>
  LANES.map(lane => {
    const heroIn = side => {
      const at = game.lanes[side].indexOf(lane);
      return at >= 0 && game.picks[side][at] ? view.heroById(game.picks[side][at]) : null;
    };
    const [blue, red] = [heroIn("blue"), heroIn("red")];
    const half = hero =>
      hero ? portrait(hero, 40) : `<span class="pt s-40 empty" aria-hidden="true">?</span>`;
    const names = [blue, red].map(hero => (hero ? escapeHtml(heroName(hero)) : "—")).join(" · ");
    return `<div class="mu">${laneLogos([lane], 32)}<div class="vs">${half(blue)}<i>VS</i>${half(red)}</div><small>${names}</small></div>`;
  }).join("");

export const gameMarkup = (view, game, index) => {
  const red = other(game.blue);
  const shownBans = side => Math.min(PICKS, game.bans[side].filter(Boolean).length + 1);
  const banRow = (side, title) =>
    `<div class="slot-row slot-row-${side}"><span class="slot-title">${title}</span><div class="slots">${Array.from({ length: shownBans(side) }, (_, slot) => view.slotMarkup(index, "bans", side, slot, game)).join("")}</div></div>`;
  const sideCard = (side, token) =>
    `<section class="eside eside--${side === "blue" ? "b" : "r"}"><div class="eside__head">${teamEmblem(view.teamName(token), 32)}<b>${escapeHtml(view.teamName(token))}</b><span class="pill pill--${side}">${side === "blue" ? t("Blue side") : t("Red side")}</span></div><div class="ecells">${Array.from({ length: PICKS }, (_, slot) => view.pickCell(index, side, slot, game)).join("")}</div></section>`;
  const winnerButton = (token, side) =>
    `<button type="button" class="winner-${side}${game.winner === token ? " on" : ""}" data-winner="${index}:${token}" aria-pressed="${game.winner === token}">${t("{team} won", { team: escapeHtml(view.teamName(token)) })}</button>`;
  const bansOpen =
    GROUPS.slice(2).some(([group, side]) => game[group][side].some(Boolean)) ||
    (view.active && view.active.game === index && view.active.group === "bans");
  return `<section class="game-card" aria-label="${t("Game {number}", { number: index + 1 })}">
      <div class="game-head">
        <h3>${t("Game {number}", { number: index + 1 })}</h3>
        <button type="button" class="btn btn--sm" data-swap="${index}">${icon("swap", "i--sm")}${t("Blue: {team}", { team: escapeHtml(view.teamName(game.blue)) })}</button>
        <div class="seg" role="group" aria-label="${t("Winner")}">${winnerButton(game.blue, "blue")}${winnerButton(red, "red")}</div>
        ${view.canBeUltimate(index) ? `<button type="button" class="btn btn--sm tn-ultimate${game.ultimateBattle ? " on" : ""}" data-ultimate="${index}" aria-pressed="${game.ultimateBattle}" title="${t("The deciding last game of a Global Ban & Pick series, played with the classic draft rules: the heroes of the earlier games can be picked again.")}">${icon("flame", "i--sm")}${t("Ultimate Battle")}</button>` : ""}
        <label class="label duration-field">${t("Duration (optional)")}<span class="field"><input data-duration="${index}" inputmode="numeric" placeholder="MM:SS" maxlength="6" value="${escapeHtml(game.duration)}"></span></label>
        ${view.editor.games.length > 1 ? `<button type="button" class="btn btn--danger btn--sm" data-remove-game="${index}">${icon("trash", "i--sm")}${t("Remove game")}</button>` : ""}
      </div>
      ${view.lanePalette(index)}
      <p class="lane-status">${statusMarkup(game)}</p>
      ${view.active && view.active.game === index ? view.pickerMarkup(game) : ""}
      <div class="esides">${sideCard("blue", game.blue)}${sideCard("red", red)}</div>
      <details class="ban-details"${bansOpen ? " open" : ""}><summary>${t("Bans (optional)")}</summary>${banRow("blue", t("Blue bans"))}${banRow("red", t("Red bans"))}</details>
      <h3 class="matchups-title">${t("Face to face by lane")}</h3>
      <div class="matchups">${view.matchupsMarkup(game)}</div>
    </section>`;
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  slotMarkup,
  pickCell,
  lanePalette,
  matches,
  pickerMarkup,
  matchupsMarkup,
  gameMarkup
};
