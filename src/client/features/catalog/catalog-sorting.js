// Sorting many items at once (the tick boxes of the table).
import { t } from "../../app/browser-i18n.js";

/** Gives the ticked items a category and/or a slot (one request: all of them or none). */
export async function applySort(view, changes) {
  const ids = view.selectedIn(view.listFor());
  if (!ids.length || view.busy) {
    return;
  }
  view.busy = true;
  try {
    const { updated } = await view.api("/api/admin/catalog/items/bulk", {
      method: "POST",
      body: { ids, ...changes }
    });
    view.picked.clear();
    await view.reload();
    view.tell(
      t("{count, plural, one {# item updated} other {# items updated}}", { count: updated })
    );
  } catch (problem) {
    view.tell(problem.message);
  } finally {
    view.busy = false;
  }
  view.paint();
}

/** A click on the sorting buttons. True when it was one of them. */
export function handleSort(view, target) {
  if (target.matches("[data-sort-toggle]")) {
    view.sorting = !view.sorting;
    view.picked.clear();
    view.editing = null;
    view.error = "";
    view.paint();
    return true;
  }
  if (!view.sorting) {
    return false;
  }
  if (target.matches("[data-sort-all]")) {
    for (const row of view.listFor()) {
      view.picked.add(row.id);
    }
    view.syncPicks();
    return true;
  }
  if (target.matches("[data-sort-clear]")) {
    view.picked.clear();
    view.syncPicks();
    return true;
  }
  if (target.dataset.sortShop !== undefined) {
    void view.applySort({ shopCategory: target.dataset.sortShop || null });
    return true;
  }
  if (target.dataset.sortSlot) {
    void view.applySort({ category: target.dataset.sortSlot });
    return true;
  }
  return false;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { applySort, handleSort };
