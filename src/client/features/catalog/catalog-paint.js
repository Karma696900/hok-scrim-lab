// Writing the page into the document.
import { debounce } from "../../lib/debounce.js";
import { fillSceneArt } from "../../domain/scene-art.js";
import { t } from "../../app/browser-i18n.js";
import { lead } from "./catalog-parts.js";

/** The boxes and the panel follow `picked` without drawing the page again (the list keeps its scroll). */
export function syncPicks(view) {
  for (const box of view.root.querySelectorAll("[data-pick]")) {
    box.checked = view.picked.has(Number(box.dataset.pick));
    box.closest("tr")?.classList.toggle("active", box.checked);
  }
  const panel = view.root.querySelector(".sort-panel");
  if (panel) {
    panel.outerHTML = view.sortPanel(view.listFor());
  }
}

/**
 * Where the person is before the page is drawn again: the scroll of the window, of the list and of the
 * panel, and the field that has the cursor. The panel keeps its place only while the same entry stays
 * open (another entry, or a new one after a save, starts at its top).
 */
function placeOf(view) {
  const same = Boolean(view.editing) && view.editing === view.paintedEditing;
  const active = same && view.root.contains(document.activeElement) ? document.activeElement : null;
  return {
    window: window.scrollY,
    list: view.root.querySelector(".catalog-list")?.scrollTop ?? 0,
    panel: same ? (view.root.querySelector(".ct-panel .ws-panel__body")?.scrollTop ?? 0) : 0,
    field: active?.getAttribute("name")
      ? `[name="${CSS.escape(active.getAttribute("name"))}"]`
      : active?.dataset.namePickInput
        ? `[data-name-pick-input="${CSS.escape(active.dataset.namePickInput)}"]`
        : "",
    caret: typeof active?.selectionStart === "number" ? active.selectionStart : null
  };
}

function backTo(view, place) {
  const list = view.root.querySelector(".catalog-list");
  if (list) {
    list.scrollTop = place.list;
  }
  const panel = view.root.querySelector(".ct-panel .ws-panel__body");
  if (panel) {
    panel.scrollTop = place.panel;
  }
  const field = place.field ? view.root.querySelector(place.field) : null;
  if (field && !field.disabled) {
    field.dataset.quiet = ""; // a name field given its cursor back does not open its list again
    field.focus({ preventScroll: true });
    delete field.dataset.quiet;
    if (
      place.caret !== null &&
      typeof field.setSelectionRange === "function" &&
      field.type !== "number"
    ) {
      field.setSelectionRange(place.caret, place.caret);
    }
  }
  if (window.scrollY !== place.window) {
    window.scrollTo(window.scrollX, place.window);
  }
}

export function paint(view) {
  if (view.tab === "translations") {
    view.paintTranslations();
    return;
  }
  const place = view.root.isConnected ? placeOf(view) : null;
  const rows = view.listFor();
  const mode = view.editing ? "has-edit" : view.sorting ? "is-sorting" : "is-idle";
  view.root.innerHTML = `${view.stage()}
      <div class="catalog-layout ct-layout ${mode}">${view.rail()}
        <section class="ws-card ct-main${view.rise(" d-1")}">${view.toolbarMarkup()}${view.tableMarkup(rows)}</section>
        <aside class="ws-panel ct-panel" aria-label="${t("Edit")}">${view.panelMarkup(rows)}</aside>
      </div>`;
  fillSceneArt(view.root.querySelector(".ws-stage__art"), lead());
  view.entered = true;
  view.revealTab();
  if (place) {
    backTo(view, place);
  }
  view.paintedEditing = view.editing;
}

/**
 * Draws the section of the translations: all of it, or only its state card while a round runs, or all of
 * it with the focus given back to the field the person is typing in.
 */
export function paintTranslations(view, { onlyStatus = false, keepFocus = "" } = {}) {
  if (!view.root?.isConnected || view.tab !== "translations") {
    return;
  }
  const holder = view.root.querySelector("#tr-root");
  if (!holder || !view.translationsLoaded) {
    view.root.innerHTML = view.translationsPage(
      view.translationsLoaded ? view.translations.markup() : '<div class="loading-line"></div>'
    );
    fillSceneArt(view.root.querySelector(".ws-stage__art"), lead());
    view.entered = true;
    view.revealTab();
    return;
  }
  if (onlyStatus) {
    view.root
      .querySelector("#tr-status")
      ?.replaceWith(
        Object.assign(document.createElement("div"), { innerHTML: view.translations.statusCard() })
          .firstElementChild
      );
    return;
  }
  holder.innerHTML = view.translations.markup();
  const input = keepFocus ? holder.querySelector(keepFocus) : null;
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

export async function openTranslations(view) {
  view.tab = "translations";
  view.editing = null;
  view.sorting = false;
  view.translationsLoaded = false;
  view.paintTranslations();
  try {
    await view.translations.load(view.paintTranslations);
    view.translationsLoaded = true;
  } catch (problem) {
    view.tell(problem.message);
  }
  view.root.innerHTML = view.translationsPage(
    view.translationsLoaded ? view.translations.markup() : ""
  );
  fillSceneArt(view.root.querySelector(".ws-stage__art"), lead());
  view.revealTab();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { syncPicks, paint, paintTranslations, openTranslations };

// a whole-page redraw per letter cost 94 ms on a phone-class processor (scripts/performance/input-probe.mjs)
export const repaintFilteredOf = view =>
  debounce(() => {
    if (!view.root?.isConnected) {
      return; // the page was left meanwhile
    }
    const input = view.root.querySelector("#catalog-filter");
    if (!input?.isConnected || document.activeElement !== input) {
      view.repaint(); // the field was left meanwhile: draw the filtered list, there is no caret to give back
      return;
    }
    const caret = input.selectionStart;
    view.repaint();
    const fresh = view.root.querySelector("#catalog-filter");
    fresh.focus();
    fresh.setSelectionRange(caret, caret);
  }, 150);
