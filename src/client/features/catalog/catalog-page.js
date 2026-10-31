// The Catalog page (administrators): the stats of the game, the tags, the items, the arcana and the spells,
// entered by hand with their pictures. A work screen: a low stage with the figures that need a decision, a rail
// to move between the sections, a table (sorted and filtered) in the middle and, on the right, a panel that
// edits the open row without covering anything (or, when no row is open, says what is left to fix). Items and
// arcana are written with the stats list (so every stat is displayed properly), and carry tags. A stat is a
// whole number, a number, a percentage or a choice (Melee or Ranged); a line of an item can be temporary and
// can depend on conditions about the hero, and so can each of its passives and actives.
import { icon } from "../../../shared/icons.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";
import { gatePage } from "../../app/status-pages.js";
import { createCatalogDrafts } from "./catalog-drafts.js";
import { createConditionsEditor } from "./conditions-editor.js";
import { createTranslationsPanel } from "./translations.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as catalogMarkup } from "./catalog-markup.js";
import { onView as catalogParts } from "./catalog-parts.js";
import { onView as catalogList } from "./catalog-list.js";
import { onView as catalogForm } from "./catalog-form.js";
import { onView as catalogPaint, repaintFilteredOf } from "./catalog-paint.js";
import { onView as catalogSorting } from "./catalog-sorting.js";
import { onView as catalogSave } from "./catalog-save.js";
import { onView as catalogActions } from "./catalog-actions.js";
import { emptyDrafts } from "./catalog-empty-drafts.js";
import { heroName } from "./catalog-parts.js";
import { onSearchFocusIn, onSearchFocusOut, onSearchPointer } from "./catalog-search.js";

export function createCatalogPage({ api, tell }) {
  const view = { api, tell };
  bindTo(
    view,
    catalogMarkup,
    catalogParts,
    catalogList,
    catalogForm,
    catalogPaint,
    catalogSorting,
    catalogSave,
    catalogActions
  );
  view.root = null;
  view.heroes = [];
  view.catalog = null;
  view.tab = "items";
  view.editing = null;
  view.filter = "";
  view.categoryFilter = "";
  view.shopFilter = "";
  view.colorFilter = "";
  view.sorting = false;
  view.error = "";
  view.busy = false;
  view.flags = new Set(); // the "without …" chips that are on
  view.sorts = {}; // tab → { key, dir }
  view.picked = new Set(); // the items ticked while sorting
  view.entered = false; // the page rises once, not at every redraw

  // the translations of what the staff writes: its own section
  view.translations = createTranslationsPanel({ api: view.api, escapeHtml: esc, tell: view.tell });
  view.translationsLoaded = false;

  // the conditions of a line or of an effect: one editor for all of them
  view.when = createConditionsEditor({
    escapeHtml: esc,
    getCatalog: () => view.catalog,
    getHeroes: () => view.heroes
  });

  // ---- the form of each section ------------------------------------------------------------------

  view.emptyDraft = emptyDrafts(view);

  // ---- the form and the API: see catalog-drafts.js ------------------------------------------------

  ({
    readDraft: view.readDraft,
    unfinished: view.unfinished,
    bodyOf: view.bodyOf,
    draftOfEntry: view.draftOfEntry
  } = createCatalogDrafts({
    getRoot: () => view.root,
    getEditing: () => view.editing,
    getTab: () => view.tab,
    statOf: view.statOf,
    when: view.when
  }));

  view.repaintFiltered = repaintFilteredOf(view);

  return {
    async show(app, state) {
      if (!state.auth.user?.isAdmin) {
        app.innerHTML = gatePage({
          crumb: `${t("Admin")}${icon("right")}${t("Catalog")}`,
          title: t("Catalog"),
          message: state.auth.user
            ? t("This page is for administrators.")
            : t("Sign in with an administrator account to enter the catalog."),
          signedIn: Boolean(state.auth.user),
          next: location.pathname
        });
        return;
      }
      view.heroes = state.heroes
        .filter(hero => hero.availableGlobal !== false)
        .sort((a, b) => heroName(a).localeCompare(heroName(b)));
      view.root = document.createElement("div");
      view.root.id = "catalog-root";
      app.replaceChildren(view.root);
      view.root.innerHTML = `<div class="loading-line"></div>`;
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("change", view.onChange);
      view.root.addEventListener("input", view.onInput);
      view.root.addEventListener("keydown", view.onKeydown);
      view.root.addEventListener("dragover", view.onDragOver);
      view.root.addEventListener("dragleave", event => {
        event.target.closest?.("[data-dropzone]")?.classList.remove("is-over");
      });
      view.root.addEventListener("drop", view.onDrop);
      // choosing a stat, a tag or a hero by its name (catalog-search.js)
      view.root.addEventListener("pointerdown", onSearchPointer);
      view.root.addEventListener("focusin", onSearchFocusIn);
      view.root.addEventListener("focusout", onSearchFocusOut);
      view.root.addEventListener("submit", event => {
        event.preventDefault();
        view.save();
      });
      document.removeEventListener("keydown", view.onDocumentKeydown);
      document.addEventListener("keydown", view.onDocumentKeydown);
      try {
        await view.reload();
        await view.translations.loadStatus().catch(() => {}); // the number on the rail and on the stage
      } catch (problem) {
        view.tell(problem.message);
        return;
      }
      if (view.root.isConnected) {
        view.paint();
      }
    }
  };
}
