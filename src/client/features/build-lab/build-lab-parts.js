// Small helpers of the build lab: the heroes, the address of a build, what is remembered.
import { buildAddress } from "../../../shared/build-model.js";
import { sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { t } from "../../app/browser-i18n.js";

export const heroes = view => view.state.heroes.filter(hero => hero.availableGlobal !== false);

export const hero = view => view.state.heroes.find(entry => entry.id === view.heroId) ?? null;

export const heroOf = (view, id) => view.state.heroes.find(entry => entry.id === id) ?? null;

export const heroName = entry => entry.displayName || entry.name;

export const addressOf = view =>
  buildAddress(location.pathname, {
    build: view.workbench.build,
    heroId: view.heroId,
    level: view.level
  });

export const remember = view => history.replaceState(null, "", view.addressOf());

// ---- markup -----------------------------------------------------------------------------------

/** The stage that opens the left panel: the cover of the hero of the build, the title. */
export const stage = current =>
  `<header class="page-head lb-stage keep-dark rise">${sceneArtSlot("lb-stage__art", current ?? sceneHero(1))}<div class="lb-stage__title"><h1>${t("Build lab")}</h1><p>${t("Try a build: pick a hero, a level, items and arcana. No account needed; the link shares your build.")}</p></div></header>`;

export const piecesOf = target => target.closest?.("[data-add], .build-slot[data-piece]");

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroes, hero, heroOf, addressOf, remember };
