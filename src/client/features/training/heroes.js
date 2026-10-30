// Training, the heroes: a cockpit of three panes. On the left the roster to tick the heroes one works on, in
// the middle their cards (what the teams ask of each, the combos to check) and the workspace of the one that
// is open (skills, combos acquired in two forms, base stats), on the right what to do today (the heroes the
// teams ask for, the combos to check, the combos to learn).
import { icon } from "../../../shared/icons.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";
import { zoneHead } from "./training-shared.js";
import { paintFeatured } from "./showcase.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as heroesCards } from "./heroes-cards.js";
import { onView as heroesToday } from "./heroes-today.js";
import { onView as heroesWorkspace } from "./heroes-workspace.js";
import { onView as heroesPick } from "./heroes-pick.js";
import { onView as heroesActions } from "./heroes-actions.js";

export function createHeroesPage(kit) {
  const { api, tell, state, heroOf, heroName, portrait, sheetOf, skillsOf, skillIcon } = kit;

  async function show() {
    const view = {
      heroOf,
      heroName,
      portrait,
      state,
      kit,
      api,
      tell,
      sheetOf,
      skillsOf,
      skillIcon
    };
    bindTo(view, heroesCards, heroesToday, heroesWorkspace, heroesPick, heroesActions);
    view.root = kit.root();
    view.overview = kit.overview;
    view.focus = view.overview.focus;
    view.assigned = view.overview.assigned; // what the teams of the player ask about heroes, and how far they are
    view.review = view.overview.review; // the combos to check today and the ones still to learn
    // a link from the page of a hero opens that hero, whether it is in the roster of the player or not
    const asked = new URLSearchParams(location.search).get("hero");
    view.opened = heroOf(asked) ? asked : (view.focus[0] ?? null);
    view.combos = []; // the combos of the hero that is open
    view.progress = {}; // combo id → { normal, animationCancel }: what this player has acquired
    view.filter = { search: "", lane: "All" };

    // ---- the page ---------------------------------------------------------------------------------------
    const today = view.cards();
    view.root.innerHTML = `${kit.chrome({
      zone: "heroes",
      hero: heroOf(view.opened),
      ...zoneHead("heroes")
    })}
      <div class="trn-work${today.trim() ? " has-today" : ""}" id="trn-heroes">
        <div id="train-cards" class="trn-today"${today.trim() ? "" : " hidden"}>${today}</div>
        <div class="trn-main">
          <div id="trn-mine">${view.mine()}</div>
          <div id="focus-details" class="trn-details"></div>
        </div>
        <aside class="trn-pick card${view.focus.length ? "" : " is-open"}" id="trn-pick">
          <div class="trn-pick__head"><h2>${t("Choose your heroes")}</h2><span class="pill pill--blue" id="focus-count">${esc(view.countText())}</span><button type="button" class="btn btn--ghost btn--icon btn--sm trn-pick__toggle" data-pick-toggle aria-expanded="${view.focus.length ? "false" : "true"}" aria-controls="trn-pick-body" aria-label="${esc(t("Choose your heroes"))}">${icon("chevron", "i--sm")}</button></div>
          <div class="trn-pick__body" id="trn-pick-body">
            <label class="field field--search">${icon("search", "i--sm")}<input id="focus-search" type="search" placeholder="${t("Search hero")}" aria-label="${t("Search hero")}" value="" autocomplete="off"></label>
            <div class="trn-lanes" role="group" aria-label="${t("Filter by lane")}" id="focus-lane">${view.laneButtons()}</div>
            <ul class="trn-pick__list" id="focus-list">${view.pickTiles()}</ul>
          </div>
        </aside>
      </div>`;
    kit.paintChrome();
    paintFeatured(view.root);
    view.paintWorkspace();

    view.root.onclick = view.onClick;

    view.root.onchange = view.onChange;

    view.root.oninput = view.onInput;
  }

  return { show };
}
