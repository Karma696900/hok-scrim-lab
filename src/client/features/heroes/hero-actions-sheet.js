// The page of a hero: its tabs, its pieces of build, its variants.
import { api } from "../../app/api-client.js";
import { applyHeroFilter } from "./hero-list.js";
import { escapeHtml, tell } from "../../lib/dom.js";
import { heroFacts } from "../../../shared/condition-model.js";
import * as heroStats from "./hero-stats.js";
import { onAction, onClick, onInput } from "../../app/event-actions.js";
import { pieceDetails } from "../build-lab/build-lab-view.js";
import { showHeroTab } from "./hero-sheet.js";
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { calm, repaintSkills } from "./hero-actions-shared.js";

/** The tablists of the sheet answer to the arrow keys, like any tabs: the focus moves, the tab opens. */
function installTabKeys() {
  document.addEventListener("keydown", event => {
    const tab = event.target.closest?.("#view [role='tab']");
    const list = tab?.closest("[role='tablist']");
    if (!tab || !list?.matches(".hero-tabs, .skill-tabs")) {
      return;
    }
    const tabs = [...list.querySelectorAll("[role='tab']")];
    const rtl = document.documentElement.dir === "rtl";
    const step =
      { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key] ??
      0;
    const at = tabs.indexOf(tab);
    const target =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs.at(-1)
          : step
            ? tabs[(at + step + tabs.length) % tabs.length]
            : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    if (list.matches(".hero-tabs")) {
      showHeroTab(target.dataset.tab, { focus: true });
    } else {
      target.click();
    }
  });
  // the big play button of the presentation video goes away while it plays (whoever pressed play)
  for (const [name, playing] of [
    ["play", true],
    ["pause", false],
    ["ended", false]
  ]) {
    document.addEventListener(
      name,
      event => event.target.closest?.(".hs-player")?.classList.toggle("is-playing", playing),
      true
    );
  }
}

export function installSheetActions() {
  installTabKeys();

  // An address that names a tab (a link to /heroes/533#builds, the back button) opens it.
  window.addEventListener("hashchange", () => {
    if (state.view === "hero" && document.querySelector("#view .hero-tabs")) {
      showHeroTab(decodeURIComponent(location.hash.slice(1)) || "overview", { scroll: true });
    }
  });

  // A piece of a recommended build: its details open under the build.
  onClick(".build-card .build-slot", slot => {
    const [kind, id] = slot.dataset.piece.split(":");
    const source = {
      item: state.catalog?.items,
      arcana: state.catalog?.arcana,
      spell: state.catalog?.spells
    }[kind];
    const piece = source?.find(entry => entry.id === Number(id));
    const panel = slot.closest(".build-card").querySelector(".build-info");
    if (piece && panel) {
      panel.innerHTML =
        panel.dataset.piece === slot.dataset.piece
          ? ""
          : pieceDetails(kind, piece, state.catalog, escapeHtml, {
              // what depends on the hero is marked for the hero of this sheet, at the level of its slider
              facts: heroFacts(
                state.heroSheet?.hero ?? null,
                state.heroSheet?.profile ?? null,
                state.heroLevel
              )
            });
    }
    if (panel) {
      panel.dataset.piece = panel.dataset.piece === slot.dataset.piece ? "" : slot.dataset.piece;
      for (const other of slot.closest(".build-card").querySelectorAll(".build-slot")) {
        other.classList.toggle("active", other.dataset.piece === panel.dataset.piece);
      }
      panel.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    }
  });

  // The tabs of the sheet (and every "see all" that leads to one).
  onAction("hero-tab", button => {
    showHeroTab(button.dataset.tab, { scroll: true });
  });

  // A skill of the overview: the skills tab opens on it.
  onAction("skill-open", button => {
    state.skillIndex = Number(button.dataset.skillIndex);
    repaintSkills();
    showHeroTab("skills", { scroll: true });
  });

  // A piece of the build of the overview: the builds tab opens with its details.
  onAction("hero-piece", button => {
    showHeroTab("builds", { scroll: true });
    // the builds tab opens on the build the piece belongs to
    const variant = button.closest(".hs-digest")?.dataset.variant;
    if (variant) {
      document.querySelector(`[data-action="build-variant"][data-variant="${variant}"]`)?.click();
    }
    document
      .querySelector(`.build-card:not([hidden]) .build-slot[data-piece="${button.dataset.piece}"]`)
      ?.click();
  });
}

export function installBuildActions() {
  // The recommended builds of the sheet: the switch shows one at a time.
  onAction("build-variant", button => {
    const variant = button.dataset.variant;
    for (const choice of document.querySelectorAll('[data-action="build-variant"]')) {
      const on = choice === button;
      choice.classList.toggle("on", on);
      choice.setAttribute("aria-pressed", String(on));
    }
    for (const card of document.querySelectorAll(".build-card")) {
      card.hidden = card.dataset.variant !== variant;
    }
  });

  // The overview shows one recommended build at a time: its switch changes the build in place.
  onAction("digest-variant", button => {
    const section = button.closest(".hs-mod");
    for (const choice of section.querySelectorAll('[data-action="digest-variant"]')) {
      const on = choice === button;
      choice.classList.toggle("on", on);
      choice.setAttribute("aria-pressed", String(on));
    }
    for (const digest of section.querySelectorAll(".hs-digest")) {
      digest.hidden = digest.dataset.variant !== button.dataset.variant;
    }
  });

  // Put the hero among the ones to work on (Training).
  onAction("train-hero", async button => {
    const heroId = button.dataset.heroId;
    const { heroIds } = await api("/api/training/focus");
    if (heroIds.includes(heroId)) {
      tell(t("This hero is already in your training."));
      return;
    }
    await api("/api/training/focus", { method: "PUT", body: { heroIds: [...heroIds, heroId] } });
    tell(t("Added to your training."));
  });

  // The level the base stats are shown at.
  onInput(
    event => event.target.id === "hero-level",
    event => {
      state.heroLevel = Number(event.target.value);
      heroStats.showLevel(document.querySelector("#view"), state.heroLevel);
    }
  );

  // ---- the index ----

  // A lane chip filters by that lane; a second click on it shows every lane again.
  onAction("lane-filter", button => {
    state.laneFilter = state.laneFilter === button.dataset.lane ? "All" : button.dataset.lane;
    applyHeroFilter();
  });

  // The classes add up: a hero that is any of the chosen ones is shown.
  onAction("class-filter", button => {
    const next = new Set(state.roleFilter);
    if (!next.delete(button.dataset.role)) {
      next.add(button.dataset.role);
    }
    state.roleFilter = next;
    applyHeroFilter();
  });
}
