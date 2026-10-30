// The list of heroes on the left, and what is on the right when no hero is chosen.
import { LANE_ICON_URLS, laneLogos, laneName } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { slotImage } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { heroName } from "./guide-parts.js";

// ---- markup: the list of heroes ---------------------------------------------------------------------

export function listCard(view) {
  const needle = view.search.trim().toLocaleLowerCase();
  const shown = view.heroes().filter(hero => {
    const count = view.countOf(hero.id);
    return (
      (view.filter === "all" || (view.filter === "none" ? count === 0 : count > 0)) &&
      (!needle || heroName(hero).toLocaleLowerCase().includes(needle))
    );
  });
  const done = view.heroes().filter(hero => view.countOf(hero.id) > 0).length;
  const writing = view.section === "combos";
  const filterLabel = writing
    ? { all: t("All"), none: t("Without a combo"), some: t("With a combo") }
    : { all: t("All"), none: t("Without a build"), some: t("With a build") };
  const doneTitle = writing
    ? t("Heroes with at least one combo")
    : t("Heroes with at least one build");
  return `<section class="ws-card bed-heroes${view.rise(" d-1")}">
        <div class="bed-heroes__head"><h2 class="ws-title">${t("Heroes")}</h2><span class="pill pill--grey" title="${doneTitle}">${done} / ${view.heroes().length}</span></div>
        <label class="field field--search bed-search">${icon("search", "i--sm")}<input id="bed-search" type="search" placeholder="${t("Search a hero")}" aria-label="${t("Search a hero")}" value="${escapeHtml(view.search)}" autocomplete="off"></label>
        <div class="seg" role="group" aria-label="${t("Heroes to show")}">${FILTERS.map(name => `<button type="button" class="${view.filter === name ? "on" : ""}" data-bed-filter="${name}" aria-pressed="${view.filter === name}">${filterLabel[name]}</button>`).join("")}</div>
        <ul class="bed-list" id="bed-list">${view.listItems(shown)}</ul>
      </section>`;
}

export function listItems(view, shown) {
  if (!shown.length) {
    return `<li class="muted bed-none">${t("No match.")}</li>`;
  }
  return shown
    .map(hero => {
      const builds = view.buildsOf(hero.id);
      const combos = view.combosOf(hero.id);
      return `<li><button type="button" class="bed-hero${hero.id === view.heroId ? " active" : ""}" data-bed-hero="${escapeHtml(hero.id)}" aria-current="${hero.id === view.heroId}"><span class="pt s-40">${slotImage(hero)}</span><span class="bed-name">${escapeHtml(heroName(hero))}</span><span class="pill ${builds === 2 ? "" : builds ? "pill--blue" : "pill--grey"}" title="${t("Builds written")}">${icon("cube", "i--sm")}${builds}/2</span><span class="pill ${combos ? "pill--blue" : "pill--grey"}" title="${t("Combos written")}">${icon("bolt", "i--sm")}${combos}</span></button></li>`;
    })
    .join("");
}

// ---- markup: what is on the right when no hero is chosen ------------------------------------------------

/** The heroes that have nothing written yet in this section, as big portraits to start from. */
export function nextTiles(view) {
  return view
    .heroes()
    .filter(hero => view.countOf(hero.id) === 0)
    .slice(0, NEXT_TO_WRITE)
    .map(
      hero =>
        `<button type="button" class="ws-hero-tile" data-bed-hero="${escapeHtml(hero.id)}" aria-label="${escapeHtml(heroName(hero))}">${hero.image ? slotImage(hero) : `<span class="image-fallback"></span>`}<span>${escapeHtml(heroName(hero))}</span></button>`
    )
    .join("");
}

/** How far each lane is covered: the heroes that have something written, over the heroes that play it. */
export function coverage(view) {
  const all = view.heroes();
  return Object.keys(LANE_ICON_URLS)
    .map(lane => {
      const played = all.filter(hero => (hero.lanes ?? []).includes(lane));
      const done = played.filter(hero => view.countOf(hero.id) > 0).length;
      const percent = played.length ? Math.round((done / played.length) * 100) : 0;
      return `<li>${laneLogos([lane], 28, { decorative: true })}<span class="bed-cover__name">${escapeHtml(laneName(lane))}</span><div class="bar" aria-hidden="true"><i data-p="${percent}"></i></div><b>${done} / ${played.length}</b></li>`;
    })
    .join("");
}

export function welcomeHtml(view) {
  const tiles = view.nextTiles();
  return `<section class="ws-card bed-welcome${view.rise(" d-2")}">
        <div class="bed-welcome__head"><h2 class="ws-title">${t("Choose a hero")}</h2><p class="ws-hint">${t("Pick a hero in the list to write its builds.")}</p></div>
        ${tiles ? `<h3 class="ws-title">${t("Still to write")}</h3><div class="bed-next">${tiles}</div>` : ""}
        <h3 class="ws-title">${t("Coverage by lane")}</h3>
        <ul class="bed-cover">${view.coverage()}</ul>
      </section>`;
}

const FILTERS = ["all", "none", "some"];

const NEXT_TO_WRITE = 12;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listCard, listItems, nextTiles, coverage, welcomeHtml };
