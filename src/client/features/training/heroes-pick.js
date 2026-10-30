// The roster to choose from: the tiles, the lanes, saving the heroes one works on.
import { FOCUS_MAX } from "./training-shared.js";
import { PICK_LANES } from "../../../shared/draft-model.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { t } from "../../app/browser-i18n.js";

// ---- the roster to choose from ----------------------------------------------------------------------
export function pickTiles(view) {
  const needle = view.filter.search.trim().toLocaleLowerCase();
  return (
    view.state.heroes
      .filter(
        hero =>
          hero.availableGlobal !== false &&
          (view.filter.lane === "All" || hero.lanes.includes(view.filter.lane)) &&
          (!needle || (hero.displayName || hero.name).toLocaleLowerCase().includes(needle))
      )
      .map(hero => {
        const on = view.focus.includes(hero.id);
        const name = hero.displayName || hero.name;
        return `<li><label class="trn-tile" title="${esc(name)}"><input type="checkbox" data-toggle="${esc(hero.id)}"${on ? " checked" : ""}${!on && view.focus.length >= FOCUS_MAX ? " disabled" : ""}><span class="trn-tile__img">${view.portrait(hero.id, 84)}<span class="trn-tile__check" aria-hidden="true">${icon("check", "i--sm")}</span></span><b class="trn-tile__name">${esc(name)}</b></label></li>`;
      })
      .join("") || `<li class="trn-pick__none muted">${t("No hero")}</li>`
  );
}

export const laneButtons = view =>
  ["All", ...PICK_LANES]
    .map(
      lane =>
        `<button type="button" class="trn-lane${lane === view.filter.lane ? " on" : ""}" data-lane="${esc(lane)}" aria-pressed="${lane === view.filter.lane}" title="${esc(lane === "All" ? t("All lanes") : laneLabel(lane))}" aria-label="${esc(lane === "All" ? t("All lanes") : laneLabel(lane))}">${lane === "All" ? esc(t("All")) : laneLogos([lane], 22, { decorative: true })}</button>`
    )
    .join("");

/** The ticks, the count and the limit follow `focus` (the list itself is not drawn again). */
export function paintPickState(view) {
  view.root.querySelector("#focus-count").textContent = view.countText();
  for (const input of view.root.querySelectorAll("#focus-list input[data-toggle]")) {
    input.checked = view.focus.includes(input.dataset.toggle);
    input.disabled = !input.checked && view.focus.length >= FOCUS_MAX;
  }
}

export const save = async (view, next) => {
  const was = view.opened ? view.focus.includes(view.opened) : false;
  try {
    view.focus = (
      await view.api("/api/training/focus", { method: "PUT", body: { heroIds: next } })
    ).heroIds;
  } catch (error) {
    view.tell(error.message);
  }
  view.overview.focus = view.focus;
  const before = view.opened;
  if (view.opened && was && !view.focus.includes(view.opened)) {
    view.opened = view.focus[0] ?? null;
  }
  view.paintMine();
  view.paintPickState();
  if (view.opened !== before || (view.opened && view.focus.includes(view.opened) !== was)) {
    view.paintWorkspace();
  }
  view.kit.refreshChrome(view.opened ? view.heroOf(view.opened) : null);
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { pickTiles, laneButtons, paintPickState, save };
