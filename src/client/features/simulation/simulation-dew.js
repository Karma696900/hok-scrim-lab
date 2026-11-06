// The Healing Dews on the board (owner, 2026-11-06: D of the bots plan): a green drop just behind each outer tower of
// the player's side, full while it is out, pale while it grows back, gone with its tower. The bots server sends them
// in the side's view (`view.dews`: id, at, ready); walking onto one is enough, the bots server heals the hero.
import { placeAt } from "./simulation-hud.js";
import { setHidden } from "./simulation-shared.js";

/** One frame of the Dews: a drop per Dew the view lists, hidden once it is no longer listed (its tower fell). */
export function paintDews(run, view) {
  run.dews ??= new Map();
  const listed = new Set();
  for (const dew of view.dews ?? []) {
    listed.add(dew.id);
    let drop = run.dews.get(dew.id);
    if (!drop) {
      drop = document.createElement("span");
      drop.className = "sim-dew";
      drop.setAttribute("aria-hidden", "true");
      run.layerOf.dots.append(drop);
      run.dews.set(dew.id, drop);
      placeAt(drop, dew.at, run.side);
    }
    setHidden(drop, false);
    if (drop.classList.contains("is-growing") === Boolean(dew.ready)) {
      drop.classList.toggle("is-growing", !dew.ready);
    }
  }
  for (const [id, drop] of run.dews) {
    if (!listed.has(id)) {
      setHidden(drop, true);
    }
  }
}
