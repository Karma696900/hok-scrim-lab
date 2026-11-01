// gamedata page, what happens on a click, a key or a submit: onClick, onInput.

export function onClick(view, event) {
  const target = event.target.closest("button, a.gd-tab, a.gd-tile");
  if (!target || !view.root.contains(target)) {
    return;
  }
  if (target.dataset.pick) {
    // a tile is a link to the page of its piece (for search engines and a new tab); a plain click opens
    // the sheet here and the address follows
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button) {
      return;
    }
    event.preventDefault();
    const id = Number(target.dataset.pick);
    view.picked = id === view.picked ? null : id;
    view.followAddress();
    for (const tileButton of view.root.querySelectorAll(".gd-tile")) {
      const open = Number(tileButton.dataset.pick) === view.picked;
      tileButton.classList.toggle("is-open", open);
      tileButton.toggleAttribute("aria-current", open);
    }
    view.repaintDetail();
  } else if (target.dataset.slot !== undefined) {
    view.slot = target.dataset.slot;
    view.repaintKeepingFocus();
  } else if (target.dataset.shop !== undefined) {
    view.shop = target.dataset.shop;
    view.repaintKeepingFocus();
  } else if (target.dataset.tier !== undefined) {
    view.tier = target.dataset.tier;
    view.repaintKeepingFocus();
  } else if (target.dataset.color !== undefined) {
    view.color = target.dataset.color;
    view.repaintKeepingFocus();
  } else if (target.dataset.order !== undefined) {
    view.order = target.dataset.order;
    view.repaintKeepingFocus();
  } else if (target.matches("[data-clear]")) {
    view.search = "";
    view.slot = view.shop = view.tier = view.color = "";
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
