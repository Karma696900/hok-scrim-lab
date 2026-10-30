// What happens when a person clicks or types on the page.
import { heroName } from "./guide-parts.js";

export async function onClick(view, event) {
  const target = event.target.closest("button");
  if (!target || !view.root.contains(target)) {
    return;
  }
  if (target.dataset.bedFilter) {
    view.filter = target.dataset.bedFilter;
    view.paintSide();
  } else if (target.dataset.bedSection) {
    view.openSection(target.dataset.bedSection);
  } else if (target.dataset.bedHero) {
    if (target.dataset.bedHero !== view.heroId && view.leave()) {
      history.pushState(null, "", view.guideAddress(target.dataset.bedHero));
      await view.open(target.dataset.bedHero);
    }
  } else if (target.dataset.bedVariant) {
    if (Number(target.dataset.bedVariant) !== view.variant && view.leave()) {
      view.loadVariant(Number(target.dataset.bedVariant));
      view.paintMain();
    }
  } else if (target.dataset.bedNoteBuild) {
    // the overview sends the person to the build whose text they want to change
    const wanted = Number(target.dataset.bedNoteBuild);
    if (wanted !== view.variant && !view.leave()) {
      return;
    }
    if (wanted !== view.variant) {
      view.loadVariant(wanted);
    }
    view.openSection("builds");
  } else if (target.matches("[data-bed-note-combos]")) {
    view.openSection("combos");
  } else if (target.matches("[data-bed-save]")) {
    await view.save();
  } else if (target.matches("[data-bed-delete]")) {
    await view.remove();
  } else if (view.section === "combos") {
    await view.comboEditor.onClick(target);
  } else if (view.workbench.onClick(target)) {
    view.dirty = true;
    view.notice = "";
    view.paintMain();
  }
}

export function onInput(view, event) {
  const { id, value } = event.target;
  if (id === "bed-search") {
    view.search = value;
    const needle = value.trim().toLocaleLowerCase();
    view.root.querySelector("#bed-list").innerHTML = view.listItems(
      view
        .heroes()
        .filter(
          hero =>
            (view.filter === "all" ||
              (view.filter === "none" ? !view.countOf(hero.id) : view.countOf(hero.id) > 0)) &&
            (!needle || heroName(hero).toLocaleLowerCase().includes(needle))
        )
    );
  } else if (id === "bed-name" || id === "bed-note" || id === "bed-source") {
    view.fields[{ "bed-name": "name", "bed-note": "note", "bed-source": "sourceUrl" }[id]] = value;
    view.dirty = true;
    view.refreshChecks();
  } else if (view.section === "combos") {
    view.comboEditor.onInput(event);
  } else {
    view.workbench.onInput(event, view.root);
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onInput };
