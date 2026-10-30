// The hero index: an entrance scene (the hero of the day on its cover art, five more heroes to open),
// a column of filters that stays in view, and a dense grid of tall portrait cards. Filtering hides
// and shows the cards; nothing is rebuilt while the person types.
import { icon } from "../../../shared/icons.js";
import { responsive, wide } from "../../../shared/media.js";
import { api } from "../../app/api-client.js";
import { heroOfTheDay, heroSheet } from "../../domain/hero-of-the-day.js";
import { app, dataNotice, escapeHtml, imageMarkup, tell, watchVideos } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { classLabel, laneLogos, laneName as fullLaneName } from "../../domain/lanes.js";
import { render } from "../../app/router.js";
import { LANES, state } from "../../app/app-state.js";
import { miniPortrait } from "./hero-sheet-parts.js";

// The first screenful of cards is drawn at once; the rest is added a moment later (or as soon as a
// filter needs it), which keeps the first layout cheap.
const FIRST_HEROES = 24;

// Only the portraits a phone shows at first are requested at once; the others load as they come
// near the screen.
const EAGER_PORTRAITS = 12;

const SORTS = ["name", "lane", "class"];

// Below this many results the page offers other heroes under them.
const MORE_BELOW = 16;

/** The Global heroes in the order of the page: { hero, id, name, lanes, roles }. */
let entries = [];
let heroTail = [];
let tailTimer = 0;

const byName = (left, right) => left.name.localeCompare(right.name);
const byLane = (left, right) =>
  LANES.indexOf(left.lanes?.[0] ?? "") - LANES.indexOf(right.lanes?.[0] ?? "") ||
  byName(left, right);
const byClass = (left, right) =>
  (left.roles?.[0] ?? "").localeCompare(right.roles?.[0] ?? "") || byName(left, right);
const SORT_ORDER = { name: byName, lane: byLane, class: byClass };

/**
 * A hero of the index: a tall portrait that fills the card, the logos of its lanes at the top, its
 * name and class on a dark fade at the bottom.
 */
function indexCard(hero, index) {
  const role = hero.roles?.[0] ? classLabel(hero.roles[0]) : t("Global");
  return `<button type="button" class="hcard hl-card" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}" aria-label="${escapeHtml(hero.name)}">${imageMarkup(hero, "hl-card__img", false, index >= EAGER_PORTRAITS, true)}<span class="hl-card__lanes">${laneLogos(hero.lanes, 22)}</span><span class="hl-card__name"><b>${escapeHtml(hero.name)}</b><small>${escapeHtml(role)}</small></span><span class="hl-card__row-lanes">${laneLogos(hero.lanes, 22)}</span></button>`;
}

function flushHeroTail() {
  const grid = document.querySelector("#hero-index");
  if (!grid || !heroTail.length) {
    return;
  }
  const rest = heroTail;
  heroTail = [];
  grid.insertAdjacentHTML(
    "beforeend",
    rest.map((hero, index) => indexCard(hero, FIRST_HEROES + index)).join("")
  );
  watchVideos(grid); // the added cards load their picture lazily: they must be observed too
  applyHeroFilter();
}

/** The heroes the entrance scene offers besides the hero of the day: five, always the same ones for a day. */
function otherHeroes(hero) {
  const pool = state.heroes.filter(item => item.availableGlobal !== false && !item.isFlowborn);
  const at = pool.findIndex(item => item.id === hero.id);
  if (at < 0) {
    return [];
  }
  const step = Math.max(1, Math.floor(pool.length / 6));
  const found = [];
  for (let offset = 1; found.length < 5 && offset <= pool.length; offset += 1) {
    const candidate = pool[(at + offset * step) % pool.length];
    if (candidate.id !== hero.id && !found.includes(candidate)) {
      found.push(candidate);
    }
  }
  return found;
}

/**
 * The entrance scene. It is drawn at once from the roster (a colour wash made of the portrait, the
 * name, the classes, the lanes); the cover art and the pictures of the skills are added when the
 * sheet of the hero is read, so nothing moves when they arrive.
 */
function sceneMarkup(hero) {
  const classes = (hero.roles ?? []).map(classLabel).join(" · ");
  const lanes = (hero.lanes ?? [])
    .map(
      lane =>
        `<li class="hl-chip hl-chip--lane">${laneLogos([lane], 24, { decorative: true })}<span>${escapeHtml(fullLaneName(lane))}</span></li>`
    )
    .join("");
  const wash = hero.image
    ? `<img class="hl-scene__wash" ${responsive(hero.image, 96)} alt="" decoding="async">`
    : "";
  return `<section class="hl-scene keep-dark card--feature" id="hero-spot" data-hero="${escapeHtml(hero.id)}" aria-labelledby="hl-scene-name">
    <div class="hl-scene__art" aria-hidden="true">${wash}</div>
    <div class="hl-scene__body">
      <h2 id="hl-scene-name">${escapeHtml(hero.displayName || hero.name)}</h2>
      <ul class="hl-scene__chips"><li class="hl-chip hl-chip--brand">${icon("star", "i--sm")}${t("Hero of the day")}</li>${classes ? `<li class="hl-chip">${escapeHtml(classes)}</li>` : ""}${lanes}</ul>
      <ul class="hl-scene__skills" id="hl-scene-skills"></ul>
      <div class="hl-scene__actions"><button type="button" class="btn btn--primary btn--lg" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}">${t("Open the sheet")}${icon("arrow")}</button></div>
    </div>
    <nav class="hl-scene__more" aria-label="${t("More heroes")}"><ul>${otherHeroes(hero).map(miniPortrait).join("")}</ul></nav>
  </section>`;
}

/** The cover art and the three first skills of the hero of the day, from its Camp sheet (nothing is made up). */
async function enrichScene(hero) {
  const details = await heroSheet(hero);
  const scene = document.querySelector("#hero-spot");
  if (!details || !scene?.isConnected || scene.dataset.hero !== hero.id) {
    return;
  }
  const cover = details.art?.cover;
  if (cover) {
    scene
      .querySelector(".hl-scene__art")
      .insertAdjacentHTML(
        "beforeend",
        `<img class="hl-scene__cover" ${wide(cover, [640, 960, 1280, 1920], "100vw")} alt="" fetchpriority="high" decoding="async">`
      );
    scene.classList.add("has-cover");
  }
  const skills = (details.skills ?? []).filter(skill => skill.icon).slice(0, 3);
  scene.querySelector("#hl-scene-skills").innerHTML = skills
    .map(
      skill =>
        `<li><img ${responsive(skill.icon, 56)} alt="${escapeHtml(skill.name)}" title="${escapeHtml(skill.name)}" width="56" height="56" loading="lazy" decoding="async"></li>`
    )
    .join("");
}

function adminTools(total) {
  if (!state.auth.user?.isAdmin) {
    return "";
  }
  const sync = state.detailsSync;
  return `<section class="hl-admin admin-tools" aria-label="${t("Admin tools")}"><h2>${t("Admin tools")}</h2><span class="pill pill--blue">${t("Admin")}</span><div class="hstack wrap"><button type="button" class="btn btn--sm" id="sync-button" data-action="sync-roster" title="${t("Synchronize hero roster")}">${icon("refresh", "i--sm")}${t("Sync roster")}</button><button type="button" class="btn btn--sm" data-action="sync-details" ${sync?.running ? "disabled" : ""}>${icon("download", "i--sm")}${t("Sync hero sheets from Camp")}</button></div><span class="muted" role="status">${sync ? (sync.running ? t("Fetching {done} / {total}…", { done: sync.done + sync.failed, total: sync.total }) : t("{stored} of {total} hero sheets stored", { stored: sync.stored, total }) + (sync.failed ? ` · ${t("{count} failed last run", { count: sync.failed })}` : "")) : ""}</span></section>`;
}

const sortKeyOf = () => (SORTS.includes(state.heroSort) ? state.heroSort : "name");

/** The Global heroes in the order the person chose. */
function buildEntries() {
  entries = state.heroes
    .filter(hero => hero.availableGlobal !== false)
    .sort(SORT_ORDER[sortKeyOf()])
    .map(hero => ({
      hero,
      id: hero.id,
      name: (hero.displayName || hero.name).toLocaleLowerCase(),
      lanes: hero.lanes ?? [],
      roles: hero.roles ?? []
    }));
}

export function renderHeroes() {
  buildEntries();
  const global = entries.map(entry => entry.hero);
  const sortKey = sortKeyOf();
  const roles = [...new Set(global.flatMap(hero => hero.roles ?? []))].sort((left, right) =>
    left.localeCompare(right)
  );
  const day = heroOfTheDay();
  const rows = state.heroView === "rows";
  const laneButtons = LANES.filter(lane => lane !== "All")
    .map(
      lane =>
        `<button type="button" class="lchip hl-lane" data-action="lane-filter" data-lane="${escapeHtml(lane)}" aria-pressed="false">${laneLogos([lane], 28, { decorative: true })}<span class="hl-lane__name">${escapeHtml(fullLaneName(lane))}</span><em class="hl-count" data-count></em></button>`
    )
    .join("");
  const roleButtons = roles
    .map(
      role =>
        `<button type="button" class="hl-class" data-action="class-filter" data-role="${escapeHtml(role)}" aria-pressed="false"><span>${escapeHtml(classLabel(role))}</span><em class="hl-count" data-count></em></button>`
    )
    .join("");
  const sortOptions = [
    ["name", t("Name")],
    ["lane", t("Lane")],
    ["class", t("Class")]
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === sortKey ? " selected" : ""}>${label}</option>`
    )
    .join("");
  app.innerHTML = `<h1 class="visually-hidden">${t("Hero index")}</h1>
    ${day ? sceneMarkup(day) : ""}
    <div class="hl-layout${day ? "" : " hl-layout--bare"}">
      <aside class="hl-filters" id="hero-filters" aria-label="${t("Filters")}">
        <div class="hl-filters__top">
          <label class="field hl-search">${icon("search")}<input id="hero-search" type="search" placeholder="${t("Search heroes")}" value="${escapeHtml(state.search)}" aria-label="${t("Search heroes")}" autocomplete="off"></label>
          <button type="button" class="btn hl-filters__toggle" data-action="filters-toggle" aria-expanded="false" aria-controls="hero-filters-body">${icon("filter", "i--sm")}<span>${t("Filters")}</span><em class="hl-count" id="hero-filter-count" hidden></em></button>
        </div>
        <div class="hl-filters__body" id="hero-filters-body">
          <div class="hl-group"><h2>${t("Lane")}</h2><div class="hl-lanes" role="group" aria-label="${t("Lane")}">${laneButtons}</div></div>
          <div class="hl-group"><h2>${t("Class")}</h2><div class="hl-classes" role="group" aria-label="${t("Class")}">${roleButtons}</div></div>
          <div class="hl-group hl-group--row"><label for="hero-sort"><h2>${t("Sort")}</h2></label><span class="field field--sort"><select id="hero-sort">${sortOptions}</select></span></div>
          <div class="hl-group hl-group--row"><h2>${t("View")}</h2><div class="seg" role="group" aria-label="${t("View")}"><button type="button" class="${rows ? "" : "on"}" aria-pressed="${!rows}" data-action="hero-view" data-layout="grid" aria-label="${t("Grid")}">${icon("grid", "i--sm")}</button><button type="button" class="${rows ? "on" : ""}" aria-pressed="${rows}" data-action="hero-view" data-layout="rows" aria-label="${t("List")}">${icon("rows", "i--sm")}</button></div></div>
        </div>
      </aside>
      <section class="hl-results" aria-label="${t("Hero index")}">
        <div class="hl-bar"><p class="hl-bar__count" id="hero-count" role="status"></p><ul class="hl-chips" id="hero-chips" aria-label="${t("Active filters")}"></ul><button type="button" class="link hl-reset" data-action="hero-reset" hidden>${t("Reset filters")}</button>${dataNotice()}</div>
        <div class="hero-index hl-grid${rows ? " rows" : ""}" id="hero-index" data-total="${global.length}"></div>
        <div class="hl-nomatch" id="hero-empty" hidden>
          <p class="hl-line">${icon("search", "i--sm")}<b>${state.heroes.length ? t("No matches") : t("Roster unavailable")}</b><span>${state.heroes.length ? t("Adjust the active filters.") : t("Sync the official Global roster to populate this view.")}</span>${state.heroes.length ? `<button type="button" class="btn btn--sm" data-action="hero-reset">${t("Reset filters")}</button>` : ""}</p>
        </div>
        <section class="hl-more" id="hero-more" aria-label="${t("More heroes")}" hidden><h2>${t("More heroes")}</h2><ul></ul></section>
        <footer class="hl-foot"><span id="hero-count-foot" class="muted"></span><button type="button" class="btn btn--ghost btn--sm" data-action="scroll-top">${icon("up", "i--sm")}${t("Back to top")}</button></footer>
        ${adminTools(global.length)}
      </section>
    </div>`;
  paintHeroGrid();
  if (day) {
    enrichScene(day);
  }
}

/** Draws the cards in the order of the page (the first screenful now, the rest a moment later). */
function paintHeroGrid() {
  const grid = document.querySelector("#hero-index");
  if (!grid) {
    return;
  }
  clearTimeout(tailTimer);
  const ordered = entries.map(entry => entry.hero);
  grid.innerHTML = ordered.slice(0, FIRST_HEROES).map(indexCard).join("");
  heroTail = ordered.slice(FIRST_HEROES);
  watchVideos(grid);
  applyHeroFilter();
  if (heroTail.length) {
    tailTimer = setTimeout(flushHeroTail, 3000);
    // the first move of the person down the page brings the rest of the cards (no row is left half drawn)
    window.addEventListener("scroll", flushHeroTail, { once: true, passive: true });
  }
}

/** The cards in another order (the sort changed): only the grid is drawn again. */
export function resortHeroes() {
  buildEntries();
  paintHeroGrid();
}

/** Back from a sheet: every card is there and the page is where the person left it. */
export function restoreHeroList(scrollTop) {
  flushHeroTail();
  window.scrollTo({ top: scrollTop, behavior: "instant" });
}

/** The filters as a sentence for each one that is on: what it is and how to take it off. */
function activeFilters() {
  const list = [];
  const search = state.search.trim();
  if (search) {
    list.push({ kind: "search", value: "", label: `“${search}”` });
  }
  if (state.laneFilter !== "All") {
    list.push({ kind: "lane", value: state.laneFilter, label: fullLaneName(state.laneFilter) });
  }
  for (const role of state.roleFilter) {
    list.push({ kind: "role", value: role, label: classLabel(role) });
  }
  return list;
}

/** Shows or hides the index cards for the current search, lane and class; nothing is rebuilt. */
export function applyHeroFilter() {
  const grid = document.querySelector("#hero-index");
  if (!grid) {
    return;
  }
  const active = activeFilters();
  if (heroTail.length && active.length) {
    flushHeroTail();
    return;
  }
  const search = state.search.trim().toLocaleLowerCase();
  const textOk = entry => entry.name.includes(search);
  const laneOk = entry => state.laneFilter === "All" || entry.lanes.includes(state.laneFilter);
  const roleOk = entry =>
    state.roleFilter.size === 0 || entry.roles.some(role => state.roleFilter.has(role));
  const visible = new Set(
    entries.filter(entry => textOk(entry) && laneOk(entry) && roleOk(entry)).map(entry => entry.id)
  );
  for (const card of grid.children) {
    card.hidden = !visible.has(card.dataset.heroId);
  }
  const total = Number(grid.dataset.total);
  const line = t("{shown} of {total} shown", { shown: visible.size, total });
  document.querySelector("#hero-count").textContent = line;
  const foot = document.querySelector("#hero-count-foot");
  if (foot) {
    foot.textContent = line;
  }
  document.querySelector("#hero-empty").hidden = visible.size > 0;
  grid.hidden = visible.size === 0;
  // a short list is never the whole page: the heroes that are not shown are offered under it
  const more = document.querySelector("#hero-more");
  if (more) {
    const wanted = active.length > 0 && visible.size < MORE_BELOW;
    more.hidden = !wanted;
    if (wanted) {
      more.querySelector("ul").innerHTML = entries
        .filter(entry => !visible.has(entry.id))
        .slice(0, 16)
        .map(entry => miniPortrait(entry.hero))
        .join("");
    }
  }
  // the lanes and the classes say how many heroes each would give with the other filters on
  for (const button of document.querySelectorAll("#view .lchip[data-lane]")) {
    const on = button.dataset.lane === state.laneFilter;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    button.querySelector("[data-count]").textContent = String(
      entries.filter(
        entry => textOk(entry) && roleOk(entry) && entry.lanes.includes(button.dataset.lane)
      ).length
    );
  }
  for (const button of document.querySelectorAll("#view .hl-class[data-role]")) {
    const on = state.roleFilter.has(button.dataset.role);
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    button.querySelector("[data-count]").textContent = String(
      entries.filter(
        entry => textOk(entry) && laneOk(entry) && entry.roles.includes(button.dataset.role)
      ).length
    );
  }
  document.querySelector("#hero-chips").innerHTML = active
    .map(
      filter =>
        `<li><button type="button" class="hl-chip hl-chip--on" data-action="filter-remove" data-kind="${filter.kind}" data-value="${escapeHtml(filter.value)}" aria-label="${escapeHtml(t("Remove the filter {name}", { name: filter.label }))}">${escapeHtml(filter.label)}${icon("x", "i--sm")}</button></li>`
    )
    .join("");
  for (const button of document.querySelectorAll("#view .hl-reset")) {
    button.hidden = active.length === 0;
  }
  const badge = document.querySelector("#hero-filter-count");
  if (badge) {
    badge.hidden = active.length === 0;
    badge.textContent = String(active.length);
  }
}

export async function refreshDetailsStatus() {
  try {
    state.detailsSync = await api("/api/admin/hero-details");
  } catch {
    state.detailsSync = null;
  }
  if (state.view === "heroes") {
    render();
  }
}

export async function syncHeroDetails() {
  await api("/api/admin/hero-details/sync", { method: "POST", body: {} });
  tell(t("Fetching hero sheets from Camp in the background…"));
  await refreshDetailsStatus();
  const poll = setInterval(async () => {
    await refreshDetailsStatus();
    if (!state.detailsSync?.running || state.view !== "heroes") {
      clearInterval(poll);
    }
  }, 4000);
}
