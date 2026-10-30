// gamedata page, what happens on a click, a key or a submit: onClick, onInput.

export function onClick(view, event) {
  const target = event.target.closest("button, a.gd-tab");
  if (!target || !view.root.contains(target)) {
    return;
  }
  if (target.dataset.pick) {
    const id = Number(target.dataset.pick);
    view.picked = id === view.picked ? null : id;
    for (const tileButton of view.root.querySelectorAll(".gd-tile")) {
      const open = Number(tileButton.dataset.pick) === view.picked;
      tileButton.classList.toggle("is-open", open);
      tileButton.setAttribute("aria-pressed", String(open));
    }
    view.repaintDetail();
  } else if (target.dataset.slot !== undefined) {
    view.slot = target.dataset.slot;
    view.repaintKeepingFocus();
  } else if (target.dataset.shop !== undefined) {
    view.shop = target.dataset.shop;
    view.repaintKeepingFocus();
  } else if (target.dataset.color !== undefined) {
    view.color = target.dataset.color;
    view.repaintKeepingFocus();
  } else if (target.dataset.order !== undefined) {
    view.order = target.dataset.order;
    view.repaintKeepingFocus();
  } else if (target.matches("[data-clear]")) {
    view.search = "";
    view.slot = view.shop = view.color = "";
    view.paint();
  } else if (target.matches("[data-retry]")) {
    view.load();
  } else if (target.matches("[data-gd-filters]")) {
    view.filtersOpen = !view.filtersOpen;
    view.root.querySelector("#gd-filters").classList.toggle("is-open", view.filtersOpen);
    target.setAttribute("aria-expanded", String(view.filtersOpen));
  }
}

export function onInput(view, event) {
  if (event.target.id === "gd-search") {
    view.search = event.target.value;
    view.repaintResults();
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onInput };
