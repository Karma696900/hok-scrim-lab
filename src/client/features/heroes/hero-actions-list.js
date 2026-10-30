// The list of heroes: the filters, the view, back to the top.
import { applyHeroFilter, resortHeroes } from "./hero-list.js";
import { onAction, onChange } from "../../app/event-actions.js";
import { state } from "../../app/app-state.js";
import { calm, repaintSkills } from "./hero-actions-shared.js";

export function installListControls() {
  // A chip of the active filters takes its filter off.
  onAction("filter-remove", button => {
    const { kind, value } = button.dataset;
    if (kind === "search") {
      state.search = "";
      const field = document.querySelector("#hero-search");
      if (field) {
        field.value = "";
      }
    } else if (kind === "lane") {
      state.laneFilter = "All";
    } else {
      const next = new Set(state.roleFilter);
      next.delete(value);
      state.roleFilter = next;
    }
    applyHeroFilter();
  });

  onAction("hero-reset", () => {
    state.search = "";
    state.laneFilter = "All";
    state.roleFilter = new Set();
    const field = document.querySelector("#hero-search");
    if (field) {
      field.value = "";
    }
    applyHeroFilter();
  });

  // On a phone the filters fold away behind one button.
  onAction("filters-toggle", button => {
    const panel = document.querySelector("#hero-filters");
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  });

  onAction("scroll-top", () => {
    window.scrollTo({ top: 0, behavior: calm() ? "instant" : "smooth" });
  });

  // The grid and the list view of the index only differ by a class.
  onAction("hero-view", button => {
    state.heroView = button.dataset.layout;
    document.querySelector("#hero-index")?.classList.toggle("rows", state.heroView === "rows");
    for (const choice of document.querySelectorAll('[data-action="hero-view"]')) {
      const on = choice === button;
      choice.classList.toggle("on", on);
      choice.setAttribute("aria-pressed", String(on));
    }
  });

  onChange(
    event => event.target.id === "hero-sort",
    event => {
      state.heroSort = event.target.value;
      resortHeroes();
    }
  );

  onAction("skill-tab", button => {
    // Only the skills block changes: the rest of the sheet (artwork, videos, patch notes) is not
    // rebuilt.
    state.skillIndex = Number(button.dataset.skillIndex);
    if (repaintSkills()) {
      document
        .querySelector(`#skills-body .skill-tab[data-skill-index="${state.skillIndex}"]`)
        ?.focus({ preventScroll: true });
    }
  });
}
