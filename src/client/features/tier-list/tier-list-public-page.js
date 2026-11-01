// The public tier list (/tier-list, /tier-list/{lane}): the heroes of each lane from SS to D, as
// the server computes them (server/features/tier-lists/public-tier-list.js): tournament games of
// the last three months first, the editors' ratings for the heroes played too little. The server
// draws the page for search engines; this module draws it again with the same answer and keeps the
// lane tabs on their own addresses.
import { pageRoot } from "../../app/view-wrapper.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as markup } from "./tier-list-public-markup.js";

export function createPublicTierList({ hydration, api, tell, state }) {
  const view = { state, api, tell };
  bindTo(view, markup);
  view.esc = escapeHtml;
  view.root = null;
  view.data = null; // the answer of /api/tier-list (the same for every lane)
  view.slug = ""; // "" (every lane) or "jungle"...
  view.problem = "";
  view.heroOf = id => state.heroes.find(hero => hero.id === id) ?? null;
  view.nameOf = id => {
    const hero = view.heroOf(id);
    return hero ? hero.displayName || hero.name : id;
  };

  return {
    /** Draws the page into `app`: `section` is "" (every lane) or "/jungle" (one lane). */
    async show(app, section = "") {
      view.slug = (section ?? "").replace(/^\//, "");
      view.root = pageRoot(app, hydration, "tier-list-root");
      if (view.data) {
        view.paint();
        return;
      }
      view.problem = "";
      try {
        view.data = await api("/api/tier-list");
      } catch (error) {
        view.problem = error.message;
        tell(error.message);
      }
      if (view.root?.isConnected) {
        view.paint();
      }
    }
  };
}
