// The sheet of a hero: a full-width scene (the cover art, the name, the lanes with their ratings, the
// figures of the tournaments), the tabs under it, and one panel per tab. Everything comes from Camp
// (Global) through the server, from what the editors wrote, or says "Data unavailable" in one line.
import { icon } from "../../../shared/icons.js";
import { responsive } from "../../../shared/media.js";
import { skeleton } from "../../lib/skeleton.js";
import { languageInfo, t } from "../../app/browser-i18n.js";
import { api } from "../../app/api-client.js";
import { contentReady } from "../../domain/staff-content.js";
import { currentHero } from "../../app/roster-data.js";
import { app, escapeHtml, tell, watchVideos } from "../../lib/dom.js";
import { formatDate } from "../../lib/format.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { buildsPanel } from "./hero-builds.js";
import { applyTones, gapLine, gapNote, miniPortrait } from "./hero-sheet-parts.js";
import {
  artworkPanel,
  combosPanel,
  overviewPanel,
  patchesPanel,
  skillsPanel
} from "./hero-panels.js";
import * as heroStats from "./hero-stats.js";
import { HERO_TABS, activeTab, resetActiveTab, syncHash, tabLabel } from "./hero-sheet-tabs.js";
import { competitivePanel, panel } from "./hero-sheet-competitive.js";
import { sceneMarkup } from "./hero-sheet-scene.js";
export { showHeroTab } from "./hero-sheet-tabs.js";

// Camp's page in the visitor's language is fetched in the background the first time a hero is
// opened: the English sheet shows meanwhile, and the sheet is swapped when the translated one has
// arrived.
function waitForTranslatedSheet(heroId, sheet, attempt) {
  if (!sheet.details || sheet.detailsLanguage === sheet.language || attempt >= 6) {
    return;
  }
  setTimeout(async () => {
    if (state.selectedHeroId !== heroId || state.view !== "hero") {
      return;
    }
    try {
      const next = await api(`/api/heroes/${encodeURIComponent(heroId)}`);
      if (state.selectedHeroId !== heroId) {
        return;
      }
      if (next.detailsLanguage === next.language) {
        state.heroSheet = { ...state.heroSheet, ...next };
        render();
      } else {
        waitForTranslatedSheet(heroId, next, attempt + 1);
      }
    } catch {
      /* the English sheet stays */
    }
  }, 12000);
}

/** The game catalogue (stats, tags, items, arcana), kept for a minute. */
let catalogLoad = null;

export function loadCatalog(force = false) {
  if (force || !catalogLoad || Date.now() - catalogLoad.at > 60_000) {
    catalogLoad = {
      at: Date.now(),
      promise: api("/api/catalog").catch(error => {
        catalogLoad = null;
        throw error;
      })
    };
  }
  return catalogLoad.promise;
}

// A hero page asked for directly: its data is requested with the first batch, not after the page
// skeleton.
let earlyHero = null;

export function prefetchHeroSheet(heroId) {
  earlyHero = { heroId, promise: fetchHeroSheet(heroId) };
  earlyHero.promise.catch(() => {});
}

function fetchHeroSheet(heroId) {
  const encoded = encodeURIComponent(heroId);
  const since = heroStats.sinceOf(heroStats.readWindow());
  return Promise.all([
    api(`/api/heroes/${encoded}${since ? `?since=${since}` : ""}`),
    api(`/api/heroes/${encoded}/scrims`),
    loadCatalog(),
    contentReady() // what the staff wrote on this sheet is shown in the language of the page
  ]);
}

// ---- opening a sheet ----------------------------------------------------------------------------

/** Why the sheet could not be read (a hero that does not exist, a server that does not answer): said in one line. */
let failure = "";

export async function openHero(heroId) {
  // coming from another page (or from the server's drawing): the address says which tab; from
  // another sheet: the tab stays
  const onSheet = Boolean(document.querySelector("#hero-top")) && app.dataset.ssr === undefined;
  if (!onSheet) {
    resetActiveTab();
  }
  if (!(onSheet && state.selectedHeroId === heroId)) {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  failure = "";
  state.view = "hero";
  state.selectedHeroId = heroId;
  state.heroSheet = null;
  state.skillIndex = 0;
  render();
  try {
    const pending = earlyHero?.heroId === heroId ? earlyHero.promise : fetchHeroSheet(heroId);
    earlyHero = null;
    const [sheet, scrims, catalog] = await pending;
    state.catalog = catalog;
    if (state.selectedHeroId === heroId) {
      state.heroSheet = { ...sheet, scrims };
      render();
      waitForTranslatedSheet(heroId, sheet, 0);
    }
  } catch (error) {
    tell(error.message);
    if (state.selectedHeroId === heroId) {
      failure = error.message;
      render();
    }
  }
}

/** What the stats blocks of a hero sheet need from this file. */
const statsContext = () => ({
  escapeHtml,
  dataUnavailable: gapNote, // one line, never a box
  heroOf: currentHero,
  isAdmin: Boolean(state.auth.user?.isAdmin),
  window: heroStats.readWindow(),
  catalog: state.catalog ?? null,
  heroId: state.selectedHeroId
});

export function renderHeroSheet() {
  const sheet = state.heroSheet;
  const hero = sheet?.hero || currentHero(state.selectedHeroId);
  const details = sheet?.details || null;
  const isAdmin = Boolean(state.auth.user?.isAdmin);
  const isEditor = Boolean(state.auth.user?.isEditor);
  const ctx = statsContext();

  // The neighbours of this hero in the index (by name): the buttons at the top walk through them.
  const roster = state.heroes
    .filter(item => item.availableGlobal !== false)
    .sort((left, right) => left.name.localeCompare(right.name));
  const canTrain =
    Boolean(state.auth.user) && (!state.modules || state.modules.includes("training"));
  // a hero that does not exist: a short page that says so and offers the heroes that do
  if (!sheet && failure && !state.heroes.some(item => item.id === state.selectedHeroId)) {
    app.innerHTML = `<section class="hs-lost"><h1>${escapeHtml(failure)}</h1><p class="muted">${t("This page does not exist or has moved.")}</p><div class="hstack wrap"><button type="button" class="btn btn--primary" data-action="close-hero">${icon("book")}${t("Browse heroes")}</button><a class="btn" href="/">${icon("home")}${t("Back to the overview")}</a></div></section>
      <section class="hl-more"><h2>${t("More heroes")}</h2><ul>${roster.slice(0, 16).map(miniPortrait).join("")}</ul></section>`;
    return;
  }
  const scene = sceneMarkup({ hero, sheet, details, ctx, isAdmin, roster, canTrain });
  if (!sheet) {
    app.innerHTML = `${scene}${
      failure
        ? `<ul class="hs-gaps hs-gaps--end">${gapLine("", failure, `<button type="button" class="btn btn--sm" data-action="close-hero">${t("Browse heroes")}</button>`)}</ul>`
        : skeleton("page")
    }`;
    return;
  }
  const counts = {
    combos: (sheet.combos ?? []).length,
    builds: (sheet.builds ?? []).length,
    patches: details?.adjustments?.length ?? 0,
    artwork: details?.gallery?.length ?? 0
  };
  const tabs = HERO_TABS.map(
    ([key, id]) =>
      `<button type="button" role="tab" id="hero-tab-${key}" class="${key === activeTab ? "on" : ""}" aria-selected="${key === activeTab}" aria-controls="${id}" tabindex="${key === activeTab ? 0 : -1}" data-action="hero-tab" data-tab="${key}" data-target="${id}">${tabLabel(key)}${counts[key] ? `<span class="count">${counts[key]}</span>` : ""}</button>`
  ).join("");
  const panels = [
    panel("overview", "hero-overview", overviewPanel(sheet, ctx, { isEditor, isAdmin })),
    panel("skills", "hero-skills", skillsPanel(details, hero)),
    panel("combos", "hero-combos", combosPanel(sheet, isEditor, canTrain)),
    panel("builds", "hero-builds", buildsPanel(sheet, ctx, { isEditor })),
    panel("competitive", "hero-competitive", competitivePanel(sheet, ctx)),
    panel("patches", "hero-patches", patchesPanel(details)),
    panel("artwork", "hero-artwork", artworkPanel(details, hero))
  ].join("");
  const translating =
    sheet.details && sheet.detailsLanguage !== sheet.language
      ? `<p class="note note--warn" role="status">${icon("info", "i--sm")}<span>${t("This hero sheet is being fetched in your language. The English version is shown until it arrives.")}</span></p>`
      : "";
  const source = sheet.detailsFetchedAt
    ? `<p class="muted source-note">${t("Hero sheet from HOK Camp Global ({language}) · fetched {date}. Artwork and videos belong to Tencent / TiMi Studio Group.", { language: languageInfo(sheet.detailsLanguage || "en").name, date: escapeHtml(formatDate(sheet.detailsFetchedAt)) })}</p>`
    : "";
  app.innerHTML = `${scene}
    <div class="hs-tabbar-sentinel" id="hero-tabbar-sentinel"></div>
    <div class="hs-tabbar" id="hero-tabbar"><span class="hs-tabbar__id">${hero.image ? `<img ${responsive(hero.image, 40)} alt="" width="34" height="34" decoding="async">` : ""}${escapeHtml(hero.displayName || hero.name)}</span><nav class="tabs hero-tabs" role="tablist" aria-label="${t("Hero sheet sections")}">${tabs}</nav></div>
    <div class="hs-panels">${panels}</div>
    ${translating}${source}`;
  applyTones(app);
  watchVideos(app);
  syncHash();
  watchTabbar();
  if (isAdmin) {
    paintAliases(hero.id);
  }
}

/**
 * The other names of the hero (administrators): what a broadcast, a Liquipedia page or a stream title calls it. The
 * automatic import reads them to find the hero. They are read when the sheet opens, not with the (shared) sheet.
 */
export async function paintAliases(heroId) {
  const slot = document.querySelector("#hero-aliases");
  if (!slot || slot.dataset.heroId !== heroId) {
    return;
  }
  let found;
  try {
    found = await api(`/api/admin/heroes/${encodeURIComponent(heroId)}/aliases`);
  } catch {
    return;
  }
  if (!slot.isConnected) {
    return;
  }
  const chips = found.aliases
    .map(
      ({ alias, key }) =>
        `<li class="hs-alias"><span>${escapeHtml(alias)}</span><button type="button" class="x" data-action="remove-hero-alias" data-hero-id="${escapeHtml(heroId)}" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(t("Remove the name {name}", { name: alias }))}" title="${escapeHtml(t("Remove the name {name}", { name: alias }))}">${icon("x")}</button></li>`
    )
    .join("");
  slot.innerHTML = `<h2 class="hs-aliases__title">${t("Other names")}</h2><p class="hs-aliases__help">${t("The other names of this hero in broadcasts and on Liquipedia. The automatic import reads them to find the hero in a title or a table.")}</p><ul class="hs-aliases__list">${chips || `<li class="hs-aliases__none">${t("No other name yet.")}</li>`}</ul><form class="hs-aliases__form" data-hero-id="${escapeHtml(heroId)}"><input type="text" name="alias" maxlength="80" autocomplete="off" placeholder="${escapeHtml(t("Name to add"))}" aria-label="${escapeHtml(t("Name to add"))}"><button type="submit" class="btn btn--sm">${icon("plus", "i--sm")}${t("Add the name")}</button></form>`;
}

/** The tab bar says so when it is stuck under the top bar (it then shows the name of the hero). */
let stuckObserver = null;

function watchTabbar() {
  stuckObserver?.disconnect();
  const sentinel = document.querySelector("#hero-tabbar-sentinel");
  const bar = document.querySelector("#hero-tabbar");
  if (!sentinel || !bar) {
    return;
  }
  const topbar = document.querySelector(".topbar")?.offsetHeight ?? 0;
  stuckObserver = new IntersectionObserver(
    ([entry]) =>
      bar.classList.toggle(
        "is-stuck",
        !entry.isIntersecting && entry.boundingClientRect.top < topbar
      ),
    { rootMargin: `-${topbar + 1}px 0px 0px 0px` }
  );
  stuckObserver.observe(sentinel);
}
