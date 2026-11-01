// The three pages of the data of the game: /items, /arcana and /spells. Public (no account), read-only: what
// the staff entered in the catalogue. A stage opens each page (the cover of a hero, the title, three big tabs
// with how many pieces each section holds), then three columns: the filters, the grid of pieces with their
// picture, their cost and their two main stats, and the sheet of the piece that was clicked, which stays in
// view. Nothing is invented: a number nobody entered (the cooldown of a spell, a price) is simply not shown.
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as gamedataPageParts } from "./gamedata-page-parts.js";
import { onView as gamedataPageMarkup } from "./gamedata-page-markup.js";
import { onView as gamedataPageActions } from "./gamedata-page-actions.js";
import { onView as gamedataRecipe } from "./gamedata-recipe.js";
import { SECTIONS } from "./gamedata-page-shared.js";

export function createGameDataPages({ api, state }) {
  const view = { api, state };
  bindTo(view, gamedataPageParts, gamedataPageMarkup, gamedataPageActions, gamedataRecipe);
  view.esc = escapeHtml;
  view.root = null;
  view.section = "items";
  view.catalog = null;
  view.problem = "";
  view.search = "";
  view.slot = ""; // items: a slot, or "" for all
  view.shop = ""; // items: a category of the shop, or "" for all
  view.tier = ""; // items: a level (basic, intermediate, final, enchanted), or "" for all
  view.color = ""; // arcana: a colour, or "" for all
  view.order = "name"; // "name", "price" (items) or "cooldown" (spells)
  view.picked = null; // the id of the piece whose sheet is open
  view.wantedTile = false; // the address names a piece: bring its tile into view once the grid is drawn
  view.filtersOpen = false; // on a phone: the filters are folded under a button

  return {
    /** `piece` is "" (the list) or "/12": the address of one piece opens on its sheet. */
    async show(app, name, piece = "") {
      if (view.section !== name) {
        view.picked = null;
        view.search = "";
        view.slot = view.shop = view.tier = view.color = "";
        view.order = "name";
      }
      view.section = SECTIONS.includes(name) ? name : "items";
      // an address like /items/12 (or the older /items?piece=12) opens on the sheet of that piece
      const wanted = Number(
        (piece ?? "").replace(/^\//, "") || new URLSearchParams(location.search).get("piece")
      );
      if (Number.isInteger(wanted) && wanted > 0) {
        view.picked = wanted;
        view.wantedTile = true;
        view.search = "";
        view.slot = view.shop = view.tier = view.color = ""; // a filter must not hide the tile that was asked for
      }
      view.root = document.createElement("div");
      view.root.id = "gamedata-root";
      app.replaceChildren(view.root);
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("input", view.onInput);
      view.paint();
      await view.load();
    }
  };
}
