// A click and the search box.
import { GROUP_OF, SPELLS_MAX } from "../../../shared/build-model.js";
import { SHOP_CATEGORIES } from "../../domain/catalog-display.js";

/** A click on one of the buttons above. True when it was one of them (the page repaints). */
export function onClick(view, target) {
  if (target.dataset.shop !== undefined) {
    view.shop = SHOP_CATEGORIES.includes(target.dataset.shop) ? target.dataset.shop : "";
  } else if (target.dataset.tab) {
    view.tab = target.dataset.tab;
    view.search = "";
  } else if (target.dataset.add) {
    const [kind, id] = target.dataset.add.split(":");
    if (kind === "spell") {
      const spell = view.index().spells.get(Number(id));
      if (spell) {
        const taken = view.build.spells.includes(spell.id);
        if (taken) {
          view.setBuild({
            ...view.build,
            spells: view.build.spells.filter(value => value !== spell.id)
          });
          view.info = null;
        } else if (view.build.spells.length < SPELLS_MAX) {
          view.setBuild({ ...view.build, spells: [...view.build.spells, spell.id] });
          view.info = `spell:${spell.id}`;
        }
      }
    } else if (kind === "item") {
      const item = view.index().items.get(Number(id));
      if (item && view.canAdd(item)) {
        const group = GROUP_OF[item.category];
        view.setBuild({ ...view.build, [group]: [...view.build[group], item.id] });
        view.info = `item:${item.id}`;
      }
    } else {
      view.changeArcana(Number(id), 1);
    }
  } else if (target.dataset.more) {
    view.changeArcana(Number(target.dataset.more), 1);
  } else if (target.dataset.less) {
    view.changeArcana(Number(target.dataset.less), -1);
  } else if (target.dataset.piece) {
    view.info = view.info === target.dataset.piece ? null : target.dataset.piece;
  } else if (target.dataset.info) {
    view.info = target.dataset.info;
  } else if (target.matches("[data-close-info]")) {
    view.info = null;
  } else if (target.dataset.toggleCore) {
    const id = Number(target.dataset.toggleCore);
    view.setBuild({
      ...view.build,
      core: view.build.core.includes(id)
        ? view.build.core.filter(value => value !== id)
        : [...view.build.core, id]
    });
  } else if (target.dataset.removeSpell) {
    const id = Number(target.dataset.removeSpell);
    view.setBuild({ ...view.build, spells: view.build.spells.filter(value => value !== id) });
    view.info = null;
  } else if (target.dataset.removeItem) {
    const id = Number(target.dataset.removeItem);
    view.setBuild({
      ...view.build,
      items: view.build.items.filter(value => value !== id),
      utility: view.build.utility.filter(value => value !== id),
      late: view.build.late.filter(value => value !== id)
    });
    view.info = null;
  } else {
    return false;
  }
  return true;
}

/** The search box: only the grid of pieces is redrawn, so the box keeps its focus. */
export function onInput(view, event, root) {
  if (event.target.id !== "lab-search") {
    return false;
  }
  view.search = event.target.value;
  root.querySelector("#lab-grid").innerHTML = view.pickerGrid();
  return true;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onInput };
