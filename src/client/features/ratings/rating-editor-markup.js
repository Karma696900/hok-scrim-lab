// rating editor, markup: avatar, row, reserveHeroes, reserveRow, and 8 more.
import { LANE_ICON_URLS, laneLabel, laneLogos, laneName } from "../../domain/lanes.js";
import { dateTime, number, t } from "../../app/browser-i18n.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { tierPortrait, tierRow } from "../../domain/tier-labels.js";
import { UNRANKED } from "./rating-editor-shared.js";
import { rankedIn } from "./rating-editor-parts.js";

// ---- markup -----------------------------------------------------------------------------------

/** A hero on the board: its portrait, as in the tier lists, on a button so that a click or a key picks it. */
export const avatar = (view, id) => {
  const name = view.esc(view.nameOf(id));
  return `<button type="button" class="tier-avatar" draggable="true" data-hero="${view.esc(id)}" data-name="${name}" aria-pressed="${view.picked === id}" aria-label="${name}" title="${name}">${tierPortrait(view.heroOf(id))}</button>`;
};

export const row = (view, label, heroes) =>
  tierRow({
    tier: label,
    label: `<div class="tier-name">${view.esc(label)}</div><span class="tier-count">${heroes.length}</span>`,
    drop: ` data-drop="${view.esc(label)}"`,
    heroes: heroes.length
      ? heroes.map(view.avatar).join("")
      : `<span class="muted">${t("Drop heroes here")}</span>`
  });

/** The heroes that wait in the lane, narrowed by what is typed in the box. */
export function reserveHeroes(view) {
  const needle = view.reserveSearch.trim().toLocaleLowerCase();
  const shown = view.draft.unranked.filter(
    id => !needle || view.nameOf(id).toLocaleLowerCase().includes(needle)
  );
  if (shown.length) {
    return shown.map(view.avatar).join("");
  }
  return `<span class="muted">${view.draft.unranked.length ? t("No match.") : t("Every hero is ranked")}</span>`;
}

/** The row of the heroes that wait: a box to find one, and the place to drop a hero to take it out of its tier. */
export const reserveRow = view =>
  tierRow({
    tier: "",
    label: `<span>${t("Unranked")}</span><span class="tier-count">${view.draft.unranked.length}</span><label class="field field--search rt-search">${icon("search", "i--sm")}<input id="rt-search" type="search" placeholder="${t("Search a hero")}" aria-label="${t("Search a hero")}" value="${view.esc(view.reserveSearch)}" autocomplete="off"></label>`,
    drop: ` data-drop="${UNRANKED}" id="rt-reserve"`,
    heroes: view.reserveHeroes(),
    unranked: true
  });

/** How the heroes of the lane are spread over the tiers: a bar each, in the colour of the tier. */
export function spread(view) {
  const sizes = view.tiers.map(label => view.draft.rows.get(label).length);
  const most = Math.max(1, ...sizes);
  return `<ul class="rt-spread">${view.tiers
    .map(
      (label, at) =>
        `<li data-tier="${view.esc(label)}"><b>${view.esc(label)}</b><div class="bar" aria-hidden="true"><i data-p="${Math.round((sizes[at] / most) * 100)}"></i></div><span>${sizes[at]}</span></li>`
    )
    .join("")}</ul>`;
}

/** What was moved since the lane was opened, the last move first. */
export function log(view) {
  if (!view.moves.length) {
    return `<p class="rt-hint">${t("Drag a hero to a tier, or click it and choose the tier.")}</p>`;
  }
  return `<ol class="rt-log" aria-label="${t("Changes not saved yet")}">${view.moves
    .slice(0, LOG_SHOWN)
    .map(
      entry =>
        `<li><span class="rt-log__name">${view.esc(view.nameOf(entry.heroId))}</span>${icon("right", "i--sm")}<span class="rt-log__to">${entry.to === UNRANKED ? t("Unranked") : view.esc(entry.to)}</span></li>`
    )
    .join("")}</ol>`;
}

/** The state of the lane: which one it is, whether it is saved, how it is spread, the buttons. */
export function info(view) {
  const list = view.saved.get(view.lane);
  const version =
    list.version === null
      ? t("Never saved")
      : `${t("Version {number}", { number: number(list.version) })}${list.updatedAt ? ` · ${dateTime(list.updatedAt)}` : ""}`;
  return `<section class="rt-info">
        <div class="rt-info__head">${laneLogos([view.lane], 34, { decorative: true })}<div class="grow"><h2>${view.esc(laneName(view.lane))}</h2><small class="rt-version">${version}</small></div><span class="muted" id="rt-state">${view.dirty ? t("Changes not saved yet") : list.version === null ? t("Never saved") : ""}</span></div>
        ${view.spread()}
        <div class="rt-actions"><button type="button" class="btn btn--primary" data-save${view.dirty && !view.saving ? "" : " disabled"}>${icon("check", "i--sm")}${t("Save the ratings")}</button><button type="button" class="btn" data-undo${view.moves.length ? "" : " disabled"}>${icon("undo", "i--sm")}${t("Undo changes")}</button><button type="button" class="btn btn--ghost" data-reset${view.dirty ? "" : " disabled"}>${t("Reset")}</button></div>
        <p class="form-error" role="alert">${view.esc(view.problem)}</p>
        ${view.log()}
      </section>`;
}

export function board(view) {
  const move = view.picked
    ? `<div class="rt-move" role="group" aria-label="${t("Move {name} to", { name: view.esc(view.nameOf(view.picked)) })}"><b>${t("Move {name} to", { name: view.esc(view.nameOf(view.picked)) })}</b>${[...view.tiers, UNRANKED].map(label => `<button type="button" class="btn btn--sm" data-send="${view.esc(label)}">${label === UNRANKED ? t("Unranked") : view.esc(label)}</button>`).join("")}</div>`
    : "";
  return `<div class="tier-list-layout rt-board${view.rise(" d-1")}">${view.tiers.map(label => view.row(label, view.draft.rows.get(label))).join("")}<aside class="rt-side">${view.info()}${move}${view.reserveRow()}</aside></div>`;
}

/** The lanes: they are on the stage, and the count of each is the heroes that have a tier. */
export function tabs(view) {
  return `<div class="lane-tabs rt-lanes" role="group" aria-label="${t("Lane")}">${[
    ...view.saved.keys()
  ]
    .map(
      name =>
        `<button type="button" class="lane-tab${name === view.lane ? " active" : ""}" data-lane="${view.esc(name)}" aria-pressed="${name === view.lane}"><img src="${LANE_ICON_URLS[name]}" alt="" width="30" height="30"><span>${view.esc(laneLabel(name))}</span><small>${rankedIn(view.saved.get(name))}</small></button>`
    )
    .join("")}</div>`;
}

/** The hero of the stage: the first of the best tier that has one, so that the art says who is on top. */
export function leadHero(view) {
  for (const label of view.tiers) {
    const id = view.draft.rows.get(label)?.[0];
    if (id && view.heroOf(id)) {
      return view.heroOf(id);
    }
  }
  return sceneHero(7);
}

export function stage(view) {
  const list = view.saved.get(view.lane);
  const ranked = [...view.draft.rows.values()].reduce((sum, heroes) => sum + heroes.length, 0);
  const total = ranked + view.draft.unranked.length;
  const figure = (value, label) =>
    `<div class="ws-figure"><b>${value}</b><span>${label}</span></div>`;
  return `<header class="page-head ws-stage rt-stage keep-dark card--feature${view.rise()}">${sceneArtSlot("ws-stage__art", view.leadHero())}
        <div class="ws-stage__main"><h1>${t("Official ratings")}</h1><p>${t("Rate the heroes of each lane from SS to D. The rating shows next to each lane on the page of the hero; the lists themselves are for the editors only.")}</p>
          ${view.tabs()}</div>
        <div class="ws-figures">${figure(`${number(ranked)} / ${number(total)}`, t("Heroes rated"))}${figure(list.version === null ? "&mdash;" : number(list.version), t("Version"))}</div>
      </header>`;
}

export function paint(view) {
  const scrolled = view.root.querySelector("#rt-reserve")?.scrollTop ?? 0;
  view.root.innerHTML = `${view.stage()}${view.board()}`;
  const reserve = view.root.querySelector("#rt-reserve");
  if (reserve) {
    reserve.scrollTop = scrolled;
  }
  fillSceneArt(view.root.querySelector(".ws-stage__art"), view.leadHero());
  view.entered = true;
}

const LOG_SHOWN = 8;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  avatar,
  row,
  reserveHeroes,
  reserveRow,
  spread,
  log,
  info,
  board,
  tabs,
  leadHero,
  stage,
  paint
};
