// What the build lab and the builds editor both draw and handle: the build itself (the items in their
// slots, the arcana by colour), the pieces to add it from and the details of a piece. The page that
// uses it draws the rest (the stats and the hero for the lab, the list of heroes for the editor) and
// repaints when a click or an input was handled here.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { emptyBuild } from "../../../shared/build-model.js";
import { pieceDetails } from "./build-lab-view.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as workbenchBuild } from "./workbench-build.js";
import { onView as workbenchPicker } from "./workbench-picker.js";
import { onView as workbenchCards } from "./workbench-cards.js";
import { onView as workbenchActions } from "./workbench-actions.js";

/**
 * @param getCatalog the catalog of the game (stats, tags, items, arcana), once it is loaded
 * @param escapeHtml the page's HTML escaper
 * @param getFacts the hero of the build and its level (see heroFacts), or null: with it the details of
 *   a piece say what applies to this hero
 */
export function createWorkbench({ getCatalog, getFacts = () => null }) {
  const view = { getCatalog, getFacts };
  bindTo(view, workbenchBuild, workbenchPicker, workbenchCards, workbenchActions);
  view.build = emptyBuild();
  view.tab = "items";
  view.search = "";
  view.shop = "";
  view.info = null;
  view.error = "";
  view.indexed = { catalog: null, index: null };

  return {
    /** The build as it is now (items, utility, late, core, arcana). */
    get build() {
      return view.build;
    },
    /** What is wrong with the last build that was set, as a sentence, or "". */
    get error() {
      return view.error;
    },
    set: view.setBuild,
    clear: view.clear,
    closeInfo: view.closeInfo,
    buildCard: view.buildCard,
    pickerCard: view.pickerCard,
    detailsCard: view.detailsCard,
    lookup: view.lookup,
    /** The piece that is open (clicked in the build, or just added), or null. */
    get opened() {
      return view.info ? this.lookup(view.info) : null;
    },
    catalogBar: view.catalogBar,
    /** The grid of the pieces of the tab that is open. */
    catalogGrid: view.pickerGrid,
    slotsPanel: view.slotsPanel,
    /** The arcana of the build, by colour, with a counter for each (the editor the guides use too). */
    arcanaPanel: view.arcanaEditor,
    errorLine: view.errorLine,
    /** The details of the piece that is open, and what can be done with it in the build (nothing when none is open). */
    detailsPanel() {
      const shown = this.opened;
      if (!shown) {
        return "";
      }
      const { kind, piece } = shown;
      const actions = [
        kind === "spell" && view.build.spells.includes(piece.id)
          ? `<button type="button" class="btn btn--sm btn--danger" data-remove-spell="${piece.id}">${icon("trash", "i--sm")}${t("Remove from the build")}</button>`
          : "",
        kind === "item" && view.build.items.includes(piece.id)
          ? `<button type="button" class="btn btn--sm" data-toggle-core="${piece.id}">${view.build.core.includes(piece.id) ? t("Remove the core mark") : t("Mark as core item")}</button>`
          : "",
        kind === "item" && view.usedItems().has(piece.id)
          ? `<button type="button" class="btn btn--sm btn--danger" data-remove-item="${piece.id}">${icon("trash", "i--sm")}${t("Remove from the build")}</button>`
          : ""
      ].join("");
      return `<section class="lb-details"><div class="lb-details__head"><h3>${t("Details")}</h3><button type="button" class="btn btn--ghost btn--sm" data-close-info>${icon("x", "i--sm")}${t("Close")}</button></div>${pieceDetails(kind, piece, view.getCatalog(), escapeHtml, { facts: view.getFacts() })}${actions ? `<div class="hstack wrap lab-piece-actions">${actions}</div>` : ""}</section>`;
    },
    onClick: view.onClick,
    onInput: view.onInput
  };
}
