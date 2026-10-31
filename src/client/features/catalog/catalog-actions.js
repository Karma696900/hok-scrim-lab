// What happens when a person acts on the page: clicks, typing, keys, dropped pictures.
import { t } from "../../app/browser-i18n.js";
import { changeDraft, focusAdded } from "./catalog-draft-buttons.js";
import { onSearchChange, onSearchInput, onSearchKeydown } from "./catalog-search.js";

// ---- what is done on the page ----------------------------------------------------------------------

/** Opens another section: its own filters and its own order start fresh. */
export function openTab(view, name) {
  view.translations.stop();
  view.tab = name;
  view.editing = null;
  view.filter = "";
  view.categoryFilter = "";
  view.shopFilter = "";
  view.colorFilter = "";
  view.flags.clear();
  view.sorting = false;
  view.picked.clear();
  view.error = "";
}

/** Redraws the page, keeping what is typed in the open form (the filters and the order redraw it too). */
export function repaint(view) {
  if (view.editing) {
    view.readDraft();
  }
  view.paint();
}

/** When an entry is opened its panel comes into view: the Save button on a wide screen, the top on a phone. */
export function showPanel(view) {
  const panel = view.root.querySelector(".ct-panel");
  if (getComputedStyle(panel).position === "sticky") {
    panel.querySelector(".ws-panel__foot")?.scrollIntoView({ block: "nearest" });
  } else {
    panel.scrollIntoView({ block: "start" });
  }
}

/** A click on a line of the table: opens the entry, or (while sorting) ticks it. */
export function onRow(view, row, event) {
  if (row.dataset.pickRow !== undefined) {
    if (event.target.closest("input")) {
      return; // the box does its own toggling and tells the page by `change`
    }
    row.querySelector("input")?.click();
    return;
  }
  const id = Number(row.dataset.edit);
  const entry = view.catalog[view.tab].find(candidate => candidate.id === id);
  if (entry) {
    if (view.editing) {
      view.readDraft();
    }
    view.editing = { id, draft: { ...view.draftOfEntry(entry), id } };
    view.error = "";
    view.paint();
    view.showPanel();
    if (event.type === "keydown") {
      view.root.querySelector('#catalog-form [name="name"]')?.focus({ preventScroll: true });
    }
  }
}

/** The buttons that move around the page: a figure of the stage, a tab, the order of a column, a filter. True when one was pressed. */
function navigate(view, target) {
  if (target.dataset.ctGo) {
    // a figure of the stage: straight to what it counts
    const kind = target.dataset.ctGo;
    if (kind === "texts") {
      void view.openTranslations();
      return true;
    }
    view.openTab("items");
    view.flags.add(kind);
    view.paint();
    return true;
  }
  if (target.dataset.tab === "translations") {
    void view.openTranslations();
    return true;
  }
  if (target.dataset.tab) {
    view.openTab(target.dataset.tab);
    view.paint();
    return true;
  }
  if (target.dataset.orderBy) {
    const key = target.dataset.orderBy;
    const now = view.sortOf();
    view.sorts[view.tab] = { key, dir: now.key === key ? -now.dir : 1 };
    view.repaint();
    return true;
  }
  if (target.dataset.flag) {
    const key = target.dataset.flag;
    if (!view.flags.delete(key)) {
      view.flags.add(key);
    }
    view.repaint();
    return true;
  }
  if (target.dataset.flagGo) {
    view.flags.clear();
    view.flags.add(target.dataset.flagGo);
    view.repaint();
    return true;
  }
  if (target.dataset.color !== undefined) {
    view.colorFilter = target.dataset.color;
    view.repaint();
    return true;
  }
  return false;
}

/** "New": opens the form of an empty entry of the open section. */
function startEntry(view) {
  view.editing = { id: null, draft: view.emptyDraft[view.tab]() };
  view.error = "";
  view.paint();
  view.showPanel();
  view.root.querySelector('#catalog-form [name="name"]')?.focus({ preventScroll: true });
}

/** "Delete" in the form of an entry, once the person confirmed. */
function deleteEntry(view) {
  if (!confirm(t("Delete this entry?"))) {
    return;
  }
  view
    .api(`${view.pathOf()}/${view.editing.id}`, { method: "DELETE" })
    .then(async () => {
      view.tell(t("Deleted"));
      view.editing = null;
      await view.reload();
      view.paint();
    })
    .catch(problem => {
      view.error = problem.message;
      view.paint();
    });
}

export function onClick(view, event) {
  const target = event.target.closest("button");
  const row = event.target.closest("tr[data-edit], tr[data-pick-row]");
  if (!target) {
    if (row && view.tab !== "translations") {
      view.onRow(row, event);
    }
    return;
  }
  if (
    view.tab === "translations" &&
    !target.dataset.tab &&
    !target.dataset.ctGo &&
    view.translations.onClick(event, view.root, view.paintTranslations)
  ) {
    return;
  }
  if (view.tab === "items" && view.handleSort(target)) {
    return;
  }
  if (navigate(view, target)) {
    return;
  }
  if (target.matches("[data-new]")) {
    startEntry(view);
    return;
  }
  if (!view.editing) {
    return;
  }
  if (target.matches("[data-cancel]")) {
    view.editing = null;
    view.error = "";
    view.paint();
    return;
  }
  if (target.matches("[data-delete]")) {
    deleteEntry(view);
    return;
  }
  const draft = view.readDraft();
  if (target.matches("[data-pick-image]")) {
    view.root.querySelector("#catalog-file").click();
    return;
  }
  if (changeDraft(view, target, draft)) {
    view.paint();
    focusAdded(view, target);
  }
}

export function onChange(view, event) {
  if (view.tab === "translations") {
    view.translations.onChange(event, view.paintTranslations);
    return;
  }
  if (onSearchChange(event) && !event.target.matches("[data-repaint]")) {
    return;
  }
  if (event.target.id === "catalog-file") {
    view.chooseImage(event.target.files?.[0]);
    return;
  }
  if (event.target.matches?.("[data-pick]")) {
    const id = Number(event.target.dataset.pick);
    if (event.target.checked) {
      view.picked.add(id);
    } else {
      view.picked.delete(id);
    }
    view.syncPicks();
    return;
  }
  if (event.target.id === "catalog-shop") {
    view.shopFilter = event.target.value;
    view.repaint();
    return;
  }
  if (event.target.id === "catalog-category") {
    view.categoryFilter = event.target.value;
    view.repaint();
    return;
  }
  if (!view.editing) {
    return;
  }
  if (event.target.matches("[data-repaint]")) {
    // the unit of a stat, the stat of a line, the kind of an effect or of a condition: what the
    // form asks for changes, so it is drawn again with what was typed kept
    view.readDraft();
    view.paint();
  } else if (event.target.name?.endsWith("-temporary")) {
    view.root.querySelector(
      `[name="${event.target.name.replace(/-temporary$/, "-duration")}"]`
    ).disabled = !event.target.checked;
  } else if (view.tab === "tags" && event.target.name === "color") {
    const sample = view.root.querySelector(".ct-tag-sample .tag-chip");
    if (sample) {
      sample.className = `tag-chip tag-${event.target.value}`; // the sample takes the new colour
    }
  }
}

export function onInput(view, event) {
  if (view.tab === "translations") {
    view.translations.onInput(event, view.paintTranslations);
    return;
  }
  if (onSearchInput(event)) {
    return;
  }
  if (event.target.name === "name" && view.editing) {
    // the preview of the entry follows the name as it is typed
    const live = view.root.querySelector("#ct-live-name, .ct-tag-sample .tag-chip");
    if (live) {
      live.textContent = event.target.value || t("New");
    }
    return;
  }
  if (event.target.id !== "catalog-filter") {
    return;
  }
  view.filter = event.target.value; // kept at once; the page is only redrawn when the typing pauses
  view.repaintFiltered();
}

export const onKeydown = (view, event) => {
  if (!view.root?.isConnected) {
    return;
  }
  if (onSearchKeydown(event)) {
    return;
  }
  // a line of the table is a control for the keyboard too
  const row = event.target.closest?.("tr[data-edit]");
  if (row && event.target === row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    view.onRow(row, event);
  }
};

// a picture dropped on the preview of the open entry is the picture of the entry
export const hasFile = event => [...(event.dataTransfer?.types ?? [])].includes("Files");

export function onDragOver(view, event) {
  const zone = event.target.closest?.("[data-dropzone]");
  if (zone && view.editing && hasFile(event)) {
    event.preventDefault();
    zone.classList.add("is-over");
  }
}

export function onDrop(view, event) {
  const zone = event.target.closest?.("[data-dropzone]");
  if (zone && view.editing && hasFile(event)) {
    event.preventDefault();
    zone.classList.remove("is-over");
    view.chooseImage(event.dataTransfer.files[0]);
  }
}

/** Ctrl+Enter saves from anywhere on the page (the form may not have the focus). */
export function onDocumentKeydown(view, event) {
  if (!view.root?.isConnected || !view.editing) {
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    view.save();
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  openTab,
  repaint,
  showPanel,
  onRow,
  onClick,
  onChange,
  onInput,
  onKeydown,
  onDragOver,
  onDrop,
  onDocumentKeydown
};
