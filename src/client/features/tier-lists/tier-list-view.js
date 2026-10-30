// The tier lists page. A stage opens it (the cover of the best-ranked hero, the title, the lanes and the
// lists of the person as cards), then the board (one full-width band per tier, from SS to D, with a big
// coloured badge and the portraits that wrap), then the reserve of the heroes not ranked yet, which stays
// docked at the bottom of the screen with its own search and lane filter. A hero is moved by dragging, or
// by picking it (click, Enter) and choosing the tier on the bar that appears: no drag needed on a phone.
import { icon } from "../../../shared/icons.js";
import { TIERS } from "../../../shared/tier-names.js";
import { t } from "../../app/browser-i18n.js";
import { laneLabel } from "../../domain/lanes.js";
import { app, dataNotice, escapeHtml, id } from "../../lib/dom.js";
import { fillSceneArt, sceneHero } from "../../domain/scene-art.js";
import { state } from "../../app/app-state.js";
import { boardMarkup, leadHero, moveBar, reserve, stage, toolbar } from "./tier-list-markup.js";
import { currentTierList, tierUi, visibleTierLists } from "./tier-list-shared.js";
import { installTierListsBoard, installTierListsLists } from "./tier-list-events.js";
export { tierUi } from "./tier-list-shared.js";
export { persistTierList } from "./tier-list-events.js";
export { currentTierList } from "./tier-list-shared.js";
export { sendHero } from "./tier-list-events.js";

// The server normalises tier lists against the roster (lane pool, Flowborn rule, legacy ids, new
// heroes in Unranked).
export function createEmptyTierList(lane) {
  return {
    name: t("Tier list {number}", { number: state.tierLists.length + 1 }),
    ...(lane && lane !== "all" ? { lane } : {}),
    tiers: TIERS.map(label => ({ id: id(), label, heroes: [] })),
    unranked: []
  };
}

export function renderTierLists() {
  if (!tierUi.chosen && !visibleTierLists().length && state.tierLists.length) {
    const first =
      state.tierLists.find(item => item.id === state.activeTierId) ?? state.tierLists[0];
    state.tierLaneFilter = first.lane ?? "all";
    state.activeTierId = first.id;
  }
  const list = currentTierList();
  const canEdit = list?.viewer?.canEdit !== false;
  if (
    list &&
    tierUi.picked &&
    !list.unranked.concat(...list.tiers.map(tier => tier.heroes)).includes(tierUi.picked)
  ) {
    tierUi.picked = null;
  }
  const laneName =
    state.tierLaneFilter === "all"
      ? t("All Roles")
      : laneLabel(state.tierLaneFilter) || state.tierLaneFilter;
  const rosterMissing = !state.roster?.heroes?.length;
  const body = list
    ? `${toolbar(list, canEdit)}<div class="tl-board rise d-2${tierUi.picked ? " is-picking" : ""}">${boardMarkup(list, canEdit)}</div>${canEdit ? `<p class="tl-hint muted">${icon("info", "i--sm")}<span>${t("Drag a hero to a tier, or click it and choose the tier.")} ${t("Arrow keys move between heroes, Enter picks one, 1 to 9 send it to that tier, 0 back to Unranked.")}</span></p>` : ""}<div class="tier-dock">${moveBar(list)}${reserve(list, canEdit)}</div>`
    : `<section class="tl-empty rise d-1"><p><b>${t("No {laneName} tier list yet", { laneName: escapeHtml(laneName) })}</b><span>${state.tierLaneFilter === "all" ? t("An All Roles list ranks every Global hero.") : t("A lane list holds only the heroes of that lane (one Flowborn).")}</span></p></section>`;
  app.innerHTML = `${stage(list, laneName)}${rosterMissing ? dataNotice() : ""}${body}${rosterMissing ? "" : dataNotice()}`;
  fillSceneArt(app.querySelector(".tl-stage__art"), leadHero(list) ?? sceneHero(0));
  if (tierUi.focus) {
    const chip = [...app.querySelectorAll(".tier-avatar[data-hero-id]")].find(
      element => element.dataset.heroId === tierUi.focus
    );
    chip?.focus({ preventScroll: true });
    tierUi.focus = null;
  }
}

export function installTierLists() {
  installTierListsLists();
  installTierListsBoard();
}
