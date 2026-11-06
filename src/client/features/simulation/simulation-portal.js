// The Space Sprite's teleport portal on the play view (owner, 2026-11-06: A of the bots plan; lessons L2, L3, L9). The
// circle lies on the ground in the clash-lane corner and lights up while the player's side holds it open (a Sprite
// kill, never after 10:00). Standing in it, the player gets a purple button; it opens the three lanes, and a lane
// sends `{ type: "portal", lane }`: the hero channels down to that lane's first standing tower. The stick cancels it
// (the bots server does). The bots server sends `state.portal = { open, here }` in each frame.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { setHidden } from "./simulation-shared.js";

// the clash lane is the top one and the farm lane the bottom one, for both sides (the bots server's map)
const LANES = [
  ["top", "Clash Lane"],
  ["mid", "Mid Lane"],
  ["bottom", "Farm Lane"]
];

/** The circle on the ground, in the map's own pixels; "" for a map without a portal. */
export const portalRingSvg = portal =>
  portal
    ? `<circle class="sim-portal-ring" data-portal cx="${Math.round(portal.at[0])}" cy="${Math.round(portal.at[1])}" r="${Math.round(portal.radius)}"></circle>`
    : "";

/** The purple button and its lanes, for the tools row; hidden until the player stands in his open portal. */
export function portalToolsHtml() {
  const name = t("Teleport");
  const lanes = LANES.map(
    ([lane, label]) =>
      `<button type="button" class="sim-portal__lane" data-sim="portal" data-lane="${lane}">${t(label)}</button>`
  ).join("");
  return `<div class="sim-portal" data-portal-tools hidden>
    <div class="sim-portal__lanes" role="group" aria-label="${name}" hidden>${lanes}</div>
    <button type="button" class="sim-portal__go" data-sim="portal-menu" aria-label="${name}" title="${name}" aria-expanded="false">${icon("map")}<span class="sim-portal__name">${name}</span></button>
  </div>`;
}

/** Keeps the circle and the button on `run.portal`, once the board is drawn. */
export function bindPortal(run, layer) {
  const box = layer.querySelector("[data-portal-tools]");
  run.portal = {
    box,
    lanes: box?.querySelector(".sim-portal__lanes") ?? null,
    go: box?.querySelector(".sim-portal__go") ?? null,
    ring: layer.querySelector(".sim-map [data-portal]")
  };
}

/** Opens or closes the lanes of the button. */
export function togglePortalLanes(run, open = run.portal?.lanes?.hidden) {
  const { lanes, go } = run.portal ?? {};
  if (!lanes || !go) {
    return;
  }
  setHidden(lanes, !open);
  const expanded = String(Boolean(open));
  if (go.getAttribute("aria-expanded") !== expanded) {
    go.setAttribute("aria-expanded", expanded);
  }
}

/** One frame: the circle lit while open, the button shown while the player stands in it alive. */
export function paintPortal(run, state, me) {
  const portal = run.portal;
  if (!portal) {
    return;
  }
  const open = Boolean(state.portal?.open);
  if (portal.ring && portal.ring.classList.contains("is-open") !== open) {
    portal.ring.classList.toggle("is-open", open);
  }
  const shown = open && Boolean(state.portal?.here) && Boolean(me?.alive) && !state.hidden;
  setHidden(portal.box, !shown);
  if (!shown) {
    togglePortalLanes(run, false);
  }
}
