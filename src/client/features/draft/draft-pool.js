// The pool of heroes: its cards and the filter by lane, role and search.
import { classLabel } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";
import { FLOWBORN } from "./draft-view-shared.js";
import { setClass } from "./draft-patch.js";

export function buildPool(view, heroes) {
  const roles = [...new Set(heroes.flatMap(hero => hero.roles || []))].sort((left, right) =>
    left.localeCompare(right)
  );
  view.refs.role.innerHTML = `<option value="All">${t("All types")}</option>${roles.map(role => `<option value="${escapeHtml(role)}">${escapeHtml(classLabel(role))}</option>`).join("")}`;
  // one pass over the roster: the card, its lanes and the two spans the state of the card is written in are all in the
  // markup, so that the 120 cards cost one parse and no element made one by one
  const byId = new Map(heroes.map(hero => [hero.id, hero]));
  view.refs.grid.innerHTML = heroes
    .map(hero =>
      // the logos of the lanes only on the Flowborn forms: the lane is what tells them apart
      view
        .heroCardMarkup(hero, { action: "draft-pick", lanes: FLOWBORN.test(hero.name) })
        .replace("<button ", `<button data-lanes="${escapeHtml((hero.lanes ?? []).join("|"))}" `)
        .replace(
          /<\/button>$/,
          '<span class="hero-card-badge" aria-hidden="true"></span><span class="hero-card-state" hidden></span></button>'
        )
    )
    .join("");
  for (const button of view.refs.grid.children) {
    view.cards.set(button.dataset.heroId, {
      button,
      badge: button.children[button.children.length - 2],
      stateLabel: button.lastElementChild,
      state: null,
      // the markup is a card of a draft that is running: it carries the action of a pick
      awake: true,
      hero: byId.get(button.dataset.heroId)
    });
  }
  view.applyFilter();
}

export function applyFilter(view) {
  const needle = view.filter.search.trim().toLocaleLowerCase();
  let visible = 0;
  for (const { button, hero } of view.cards.values()) {
    const show =
      (view.filter.lane === "All" || hero.lanes.includes(view.filter.lane)) &&
      (view.filter.role === "All" || (hero.roles || []).includes(view.filter.role)) &&
      (!needle || hero.name.toLocaleLowerCase().includes(needle));
    if (button.hidden === show) {
      button.hidden = !show;
    }
    if (show) {
      visible += 1;
    }
  }
  if (view.refs.grid.dataset.empty !== String(visible === 0)) {
    view.refs.grid.dataset.empty = String(visible === 0);
  }
  for (const button of view.refs["lane-bar"].children) {
    const on = button.dataset.lane === view.filter.lane;
    setClass(button, "active", on);
    if (button.getAttribute("aria-pressed") !== String(on)) {
      button.setAttribute("aria-pressed", String(on));
    }
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { buildPool, applyFilter };
