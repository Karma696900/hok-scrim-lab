// The scene at the top of the page of a hero: its lanes, its numbers, its rating.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { classLabel, laneName as fullLaneName, laneIcons, laneLabel } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/dom.js";
import * as heroStats from "./hero-stats.js";
import { icon } from "../../../shared/icons.js";
import { responsive, wide } from "../../../shared/media.js";
import { t } from "../../app/browser-i18n.js";

// ---- the scene ----------------------------------------------------------------------------------

const LANE_BLURB = {
  "Clash Lane": () => t("Top lane"),
  Jungle: () => t("Jungle"),
  "Mid Lane": () => t("Mid lane"),
  "Farm Lane": () => t("Bottom lane"),
  Roamer: () => t("Support")
};

/**
 * The official rating of the hero in a lane, from SS to D (nothing when the lane was not rated: a
 * rating is never guessed).
 */
function ratingBadge(lane, tier, source) {
  if (!tier) {
    return "";
  }
  const values = { lane: fullLaneName(lane), tier };
  const label =
    source === "tournaments"
      ? t("Tier in {lane}: {tier}, from the tournament games", values)
      : source === "editors"
        ? t("Tier in {lane}: {tier}, from the editors (too few tournament games)", values)
        : t("Rating in {lane}: {tier}", values);
  return `<a class="hero-rating" href="/tier-list" data-tier="${escapeHtml(tier)}"${source ? ` data-source="${escapeHtml(source)}"` : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${escapeHtml(tier)}</a>`;
}

/** What the lane is in the game, when that says more than its name ("Bottom lane" for Farm; nothing for Jungle). */
const blurbOf = lane => {
  const blurb = LANE_BLURB[lane]?.() ?? "";
  return blurb === (laneLabel(lane) || lane) ? "" : blurb;
};

/** The lanes the hero plays, each with its logo and its rating (an administrator adds and removes them). */
function lanesBlock(hero, isAdmin, ratings, sources = {}) {
  // Every lane can be taken away (Camp's too) as long as the hero keeps one; the change reaches
  // every list at once.
  const removeButton = lane => {
    const last = (hero.lanes || []).length <= 1;
    const label = last
      ? t("A hero keeps at least one lane.")
      : t("Remove the {lane} lane", { lane: fullLaneName(lane) });
    return `<button type="button" class="x lane-remove" data-action="remove-hero-lane" data-hero-id="${escapeHtml(hero.id)}" data-lane="${escapeHtml(lane)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${last ? " disabled" : ""}>${icon("x")}</button>`;
  };
  const lanes = (hero.lanes || [])
    .map(
      lane =>
        `<div class="flane lane-pill hs-lane">${laneIcons([lane], escapeHtml)}<div class="hs-lane__text"><b>${escapeHtml(laneLabel(lane) || lane)}</b>${blurbOf(lane) || hero.laneSources?.[lane] === "manual" ? `<small>${escapeHtml(blurbOf(lane))}${hero.laneSources?.[lane] === "manual" ? ` <span class="manual">${t("manual")}</span>` : ""}</small>` : ""}</div>${ratingBadge(lane, ratings[lane], sources[lane])}${isAdmin ? removeButton(lane) : ""}</div>`
    )
    .join("");
  const missing = PICK_LANES.filter(lane => !(hero.lanes || []).includes(lane));
  const add =
    isAdmin && missing.length
      ? `<div class="flane-add-box"><select id="hero-lane-select" aria-label="${t("Lane to add")}">${missing.map(lane => `<option value="${escapeHtml(lane)}">${escapeHtml(laneLabel(lane))}</option>`).join("")}</select><button type="button" class="flane-add" data-action="add-hero-lane" data-hero-id="${escapeHtml(hero.id)}">${icon("plus", "i--sm")}${t("Add lane (manual)")}</button></div>`
      : "";
  return `<div class="flanes lane-tags hs-lanes">${lanes}${add}</div>`;
}

/** The figures of the tournaments, big: how often it is picked, banned, how often it wins, from how many games. */
function numbersBlock(sheet, ctx) {
  if (!sheet?.tournament) {
    return "";
  }
  const figures = heroStats.headlineFigures(sheet.tournament);
  return `<div class="hs-numbers"><dl>${figures.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl><button type="button" class="link hs-numbers__source" data-action="hero-tab" data-tab="competitive" data-target="hero-competitive">${t("Tournaments")} · ${heroStats.windowLabel(ctx.window.kind)}${icon("arrow", "i--sm")}</button></div>`;
}

export function sceneMarkup({ hero, sheet, details, ctx, isAdmin, roster, canTrain }) {
  const name = hero.displayName || hero.name;
  const world = details?.world ?? {};
  const cover = details?.art?.cover;
  const art = cover
    ? `<img class="hs-scene__art" ${wide(cover, [640, 960, 1280, 1920], "100vw")} alt="" fetchpriority="high" decoding="async">`
    : hero.image
      ? `<img class="hs-scene__art hs-scene__art--wash" ${responsive(hero.image, 96)} alt="" decoding="async">`
      : "";
  const chips = [
    ...(hero.roles || []).map(
      role => `<li class="hs-chip hs-chip--class">${escapeHtml(classLabel(role))}</li>`
    ),
    world.region ? `<li class="hs-chip">${escapeHtml(world.region)}</li>` : "",
    world.height ? `<li class="hs-chip">${escapeHtml(world.height)}</li>` : ""
  ].join("");
  const at = roster.findIndex(item => item.id === hero.id);
  const neighbour = (item, label, iconName, after) =>
    item
      ? `<button type="button" class="btn btn--ghost btn--sm" data-action="open-hero" data-hero-id="${escapeHtml(item.id)}" title="${escapeHtml(item.displayName || item.name)}">${after ? "" : icon(iconName)}${label}${after ? icon(iconName) : ""}</button>`
      : "";
  const training = canTrain
    ? `<button type="button" class="btn btn--ghost btn--sm" data-action="train-hero" data-hero-id="${escapeHtml(hero.id)}">${icon("target")}${t("Add to training")}</button>`
    : "";
  const official = hero.isFlowborn
    ? `<p class="hs-scene__official">${t("{name} · official Camp name", { name: escapeHtml(hero.name) })}</p>`
    : "";
  return `<article class="hs-scene keep-dark card--feature hero-sheet-head fbanner" id="hero-top">
    <div class="hs-scene__bg" aria-hidden="true">${art}</div>
    <div class="hs-scene__top">
      <div class="crumb"><button type="button" class="link" data-action="close-hero">${t("Heroes & Builds")}</button>${icon("right", "i--sm")}<span>${escapeHtml(name)}</span></div>
      <div class="hstack wrap">${neighbour(roster[at - 1], t("Previous"), "left", false)}${neighbour(roster[at + 1], t("Next"), "right", true)}${training}</div>
    </div>
    <div class="hs-scene__main">
      <h1>${escapeHtml(name)}</h1>
      ${world.identity ? `<p class="hs-scene__title">${escapeHtml(world.identity)}</p>` : ""}
      ${official}
      ${chips ? `<ul class="hs-chips">${chips}</ul>` : ""}
      ${lanesBlock(hero, isAdmin, sheet?.ratings ?? {}, sheet?.ratingSources ?? {})}
      ${isAdmin ? `<div class="hs-aliases" id="hero-aliases" data-hero-id="${escapeHtml(hero.id)}"></div>` : ""}
    </div>
    ${numbersBlock(sheet, ctx)}
  </article>`;
}
