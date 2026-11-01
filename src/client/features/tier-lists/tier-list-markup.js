// The markup of a tier list: the heroes, the bands, the reserve, the shelf, the toolbar.
import { LANE_ICON_URLS, laneLabel, roleLabel } from "../../domain/lanes.js";
import { PICK_LANES } from "../../../shared/draft-model.js";
import { currentHero } from "../../app/roster-data.js";
import { escapeHtml } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { shareButtons } from "../sharing/sharing-actions.js";
import { state } from "../../app/app-state.js";
import { tierKey } from "../../../shared/tier-names.js";
import { tierPortrait, tierRow } from "../../domain/tier-labels.js";
import { tierUi, visibleTierLists } from "./tier-list-shared.js";

const tierLaneOptions = () => [
  ["all", t("All Roles")],
  ...PICK_LANES.map(lane => [lane, laneLabel(lane)])
];

const tierLaneLabel = list => (list.lane ? laneLabel(list.lane) : t("All Roles"));

const rankedCount = list => list.tiers.reduce((sum, tier) => sum + tier.heroes.length, 0);

const heroName = hero => hero.displayName || hero.name;

/** The hero that leads the list: the first one of the best tier that has some. */
export function leadHero(list) {
  const first = list?.tiers.find(tier => tier.heroes.length)?.heroes[0];
  return first ? currentHero(first) : null;
}

// ---- the pieces of the markup ------------------------------------------------------------------------------

// Every Flowborn form reads "Flowborn". In an All Roles list the five forms stay separate entries,
// told apart by a lane badge.
function heroChip(heroId, { list, canEdit, tabbable = false }) {
  const hero = currentHero(heroId);
  const name = heroName(hero);
  const lane = hero.isFlowborn && list.lane === null ? hero.lanes?.[0] : null;
  const label = lane ? t("{name}, {lane} lane", { name, lane: laneLabel(lane) }) : name;
  const badge = lane
    ? `<img class="tier-lane-badge" draggable="false" src="${LANE_ICON_URLS[lane]}" alt="" title="${escapeHtml(laneLabel(lane))}">`
    : "";
  const common = `data-hero-id="${escapeHtml(heroId)}" data-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"`;
  const portrait = `${tierPortrait(hero)}${badge}`;
  if (!canEdit) {
    return `<span class="tier-avatar" role="img" ${common}>${portrait}</span>`;
  }
  return `<span class="tier-avatar${tierUi.picked === heroId ? " is-picked" : ""}" role="button" tabindex="${tabbable ? 0 : -1}" draggable="true" aria-pressed="${tierUi.picked === heroId}" data-action="tier-pick" ${common}>${portrait}</span>`;
}

/** The chips of a place (a tier, the reserve): only the first one is a stop of the Tab key, the arrows go on from there. */
const chips = (ids, options) =>
  ids.map((heroId, index) => heroChip(heroId, { ...options, tabbable: index === 0 })).join("");

/** The name of a tier: a field when the list can be edited, the big letter that gives the band its colour. */
function tierBadge(tier, count, canEdit) {
  const size = tier.label.length > 6 ? " is-s" : tier.label.length > 3 ? " is-m" : "";
  return `<input class="tier-name${size}" data-tier-id="${escapeHtml(tier.id)}" value="${escapeHtml(tier.label)}" maxlength="24" aria-label="${t("Rename {label} tier", { label: escapeHtml(tier.label) })}" ${canEdit ? "" : "readonly"}><small class="tier-count">${number(count)}</small>`;
}

/** Move up, move down, remove: always on screen (a phone has no hover), quiet until the band is looked at. */
function tierControls(tier, index, last) {
  const button = (action, label, iconName, extra = "") =>
    `<button type="button" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(iconName, "i--sm")}</button>`;
  return `<span class="tier-controls">${button("move-tier", t("Move tier up"), "up", `data-tier-index="${index}" data-direction="-1"${index === 0 ? " disabled" : ""}`)}${button("move-tier", t("Move tier down"), "chevron", `data-tier-index="${index}" data-direction="1"${index === last ? " disabled" : ""}`)}${button("remove-tier", t("Remove tier"), "x", `data-tier-id="${escapeHtml(tier.id)}"`)}</span>`;
}

function band(tier, index, list, canEdit) {
  const heroes = tier.heroes.length
    ? chips(tier.heroes, { list, canEdit })
    : `<span class="tier-hint">${icon("plus", "i--sm")}${t("Drop heroes here")}</span>`;
  return tierRow({
    tier: tier.label,
    label: `${tierBadge(tier, tier.heroes.length, canEdit)}${canEdit ? tierControls(tier, index, list.tiers.length - 1) : ""}`,
    drop: ` data-drop-tier="${escapeHtml(tier.id)}"`,
    heroes
  });
}

/** The heroes of the reserve that the search and the lane filter let through. */
function reserveHeroes(list) {
  const needle = tierUi.query.trim().toLocaleLowerCase();
  return list.unranked.filter(heroId => {
    const hero = currentHero(heroId);
    return (
      (tierUi.lane === "all" || hero.lanes?.includes(tierUi.lane)) &&
      (!needle || heroName(hero).toLocaleLowerCase().includes(needle))
    );
  });
}

export function reserveGrid(list, canEdit) {
  if (!list.unranked.length) {
    return `<span class="tier-hint">${icon("check", "i--sm")}${t("Every hero is ranked")}</span>`;
  }
  const shown = reserveHeroes(list);
  return shown.length
    ? chips(shown, { list, canEdit })
    : `<span class="tier-hint">${icon("search", "i--sm")}${t("No match.")}</span>`;
}

/** The reserve of the heroes not ranked yet: docked at the bottom of the screen, with its own search and lanes. */
export function reserve(list, canEdit) {
  const lanes = tierLaneOptions();
  // a lane list holds the heroes of its lane only: its reserve has nothing to filter by lane
  const filter =
    list.lane === null
      ? `<div class="tier-reserve__lanes" role="group" aria-label="${t("Lane")}">${lanes
          .map(
            ([value, label]) =>
              `<button type="button" data-action="tier-reserve-lane" data-lane="${escapeHtml(value)}" aria-pressed="${tierUi.lane === value}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${value === "all" ? `<span>${t("All")}</span>` : `<img src="${LANE_ICON_URLS[value]}" alt="" width="22" height="22">`}</button>`
          )
          .join("")}</div>`
      : "";
  return `<section class="tier-reserve tier-unranked" id="tier-reserve"><div class="tier-reserve__head"><h2>${t("Unranked")}<span class="count" id="tier-reserve-count">${number(list.unranked.length)}</span></h2><label class="field field--search">${icon("search", "i--sm")}<input id="tier-reserve-search" type="search" placeholder="${t("Search a hero")}" aria-label="${t("Search a hero")}" value="${escapeHtml(tierUi.query)}" autocomplete="off"></label>${filter}</div><div class="tier-reserve__zone tier-drop tier-drop-avatars" id="tier-reserve-grid" data-drop-tier="unranked">${reserveGrid(list, canEdit)}</div></section>`;
}

/** The bar that says where to send the hero that was picked (the click and keyboard way to rank). */
export function moveBar(list) {
  if (!tierUi.picked) {
    return "";
  }
  const hero = currentHero(tierUi.picked);
  const name = escapeHtml(heroName(hero));
  const targets = [
    ...list.tiers.map(tier => ({ id: tier.id, label: tier.label, key: tierKey(tier.label) })),
    { id: "unranked", label: t("Unranked"), key: "" }
  ];
  return `<div class="tier-move" role="group" aria-label="${t("Move {name} to", { name })}"><span class="tier-move__who"><span class="tier-move__face">${tierPortrait(hero)}</span><b>${t("Move {name} to", { name })}</b></span><span class="tier-move__targets">${targets
    .map(
      target =>
        `<button type="button" class="tier-move__to${target.id === "unranked" ? " is-reserve" : ""}"${target.key ? ` data-tier="${target.key}"` : ""} data-action="tier-send" data-target="${escapeHtml(target.id)}">${escapeHtml(target.label)}</button>`
    )
    .join(
      ""
    )}</span><button type="button" class="btn btn--ghost btn--sm" data-action="tier-cancel">${icon("x", "i--sm")}${t("Cancel")}</button></div>`;
}

/** The lists of the person as cards: a preview of the heroes of the best tier, the lane, how many are ranked. */
function shelf(list, laneName) {
  const cards = visibleTierLists().map(item => {
    const lead =
      item.tiers.find(tier => tierKey(tier.label) === "S" && tier.heroes.length) ??
      item.tiers.find(tier => tier.heroes.length);
    const faces = (lead?.heroes ?? [])
      .slice(0, 5)
      .map(heroId => `<span class="tl-card__face">${tierPortrait(currentHero(heroId))}</span>`)
      .join("");
    const more = (lead?.heroes.length ?? 0) - 5;
    return `<button type="button" class="tl-card${item.id === list?.id ? " is-active" : ""}" data-action="select-tier-list" data-tier-id="${escapeHtml(item.id)}" aria-pressed="${item.id === list?.id}"><span class="tl-card__faces">${faces ? `${faces}${more > 0 ? `<em>+${number(more)}</em>` : ""}` : `<span class="tl-card__none">${icon(item.lane ? "target" : "users", "i--sm")}</span>`}</span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(tierLaneLabel(item))} · ${t("{count} ranked", { count: number(rankedCount(item)) })}</small></button>`;
  });
  return `<div class="tl-shelf" role="group" aria-label="${t("Tier lists")}">${cards.join("")}${cards.length ? `<button type="button" class="tl-card tl-card--new" data-action="create-tier-list">${icon("plus")}<b>${noPlus(t("New {laneName} tier list +", { laneName: escapeHtml(laneName) }))}</b></button>` : ""}</div>`;
}

export function stage(list, laneName) {
  const lead = leadHero(list) ?? sceneHero(0);
  const tabs = `<div class="lane-tabs tier-lane-tabs" role="tablist" aria-label="${t("Lane of the tier list")}">${tierLaneOptions()
    .map(
      ([value, label]) =>
        `<button class="lane-tab${state.tierLaneFilter === value ? " active" : ""}" role="tab" aria-selected="${state.tierLaneFilter === value}" data-action="tier-lane-filter" data-lane="${escapeHtml(value)}">${value === "all" ? "" : `<img src="${LANE_ICON_URLS[value]}" alt="" width="30" height="30">`}<span>${escapeHtml(label)}</span><small>${state.tierLists.filter(item => (item.lane ?? null) === (value === "all" ? null : value)).length}</small></button>`
    )
    .join("")}</div>`;
  return `<header class="page-head tl-stage keep-dark rise">${sceneArtSlot("tl-stage__art", lead)}<div class="tl-stage__top"><div class="tl-stage__title"><h1>${t("Tier lists")}</h1><p>${t("Build, share and export rankings per lane. New Global heroes enter Unranked automatically.")}</p></div><div class="tl-stage__actions"><a class="btn btn--ghost btn--lg" href="/tier-list">${icon("crown")}${t("See the HOK tier list")}</a><button class="btn btn--primary btn--lg" data-action="create-tier-list">${icon("plus")}${noPlus(t("New {laneName} tier list +", { laneName: escapeHtml(laneName) }))}</button></div></div><div class="tl-stage__bottom">${tabs}${shelf(list, laneName)}</div></header>`;
}

/** What the board is for a list, and what it will be while there is none: the same bands, dimmed, with the heroes of the lane. */
export function boardMarkup(list, canEdit) {
  const lines = list.tiers.map((tier, index) => band(tier, index, list, canEdit)).join("");
  const add = canEdit
    ? `<button type="button" class="tier-add" data-action="add-tier">${icon("plus", "i--sm")}${t("Add tier +")}</button>`
    : "";
  return `<div class="tier-list-layout">${lines}${add}</div>`;
}

export function toolbar(list, canEdit) {
  const readOnly = canEdit ? "" : "readonly";
  const group = (label, content) =>
    content
      ? `<div class="tl-tools__group" role="group" aria-label="${label}">${content}</div>`
      : "";
  const button = (action, label, iconName, extra = "") =>
    `<button class="btn btn--sm${extra}" data-action="${action}" data-tier-id="${escapeHtml(list.id)}">${icon(iconName, "i--sm")}${label}</button>`;
  return `<div class="tier-toolbar tl-toolbar rise d-1"><label class="tl-name"><span class="visually-hidden">${t("Tier list name")}</span><input id="tier-list-name" value="${escapeHtml(list.name)}" aria-label="${t("Tier list name")}" ${readOnly}></label><span class="pill pill--grey">${escapeHtml(tierLaneLabel(list).toUpperCase())}</span>${canEdit ? "" : `<span class="pill">${t("{role} · view only", { role: escapeHtml(roleLabel(list.viewer.role)) })}</span>`}<span class="tl-tools">${list.viewer?.canShare ? group(t("Share"), shareButtons("tierList", list.id, true)) : ""}${group("JSON", `${button("export-tier-list", t("Export JSON"), "download")}${button("import-tier-list", t("Import JSON"), "upload")}`)}${list.viewer?.canDelete === false ? "" : button("delete-tier-list", t("Delete"), "trash", " btn--danger")}<input id="tier-import-file" type="file" accept="application/json,.json" hidden></span></div>`;
}

/** "New All Roles tier list +": the "+" at the end of the sentence is the icon's job now. */
const noPlus = text => text.replace(/\s*\+\s*$/, "");
