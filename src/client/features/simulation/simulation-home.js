// The Recall and Recovery buttons of the player, left of the summoner spell (owner, 2026-11-03: "fais tout ce qui
// n'est pas encore fait"; the proposal of 2026-11-02). Recall: the hero heads home after 8 s unless he moves,
// aims or is hit; a ring fills around the button meanwhile. Recovery: health comes back over a few seconds, stops
// at a hit, then the button cools down as the spell does. The bots server sends `recallLeft`, `recoveryLeft` and
// `recovering` on the player's hero.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { coolState } from "./simulation-skills.js";

const button = (kind, glyph, name) =>
  `<button type="button" class="sim-home sim-home--${kind}" data-sim="${kind}" aria-label="${name}" title="${name}">${icon(glyph)}<span class="sim-home__name">${name}</span><b class="sim-home__time" hidden></b></button>`;

/** The two buttons, Recall then Recovery, for the tools row. */
export const homeToolsHtml = () =>
  button("recall", "home", t("Recall")) + button("recover", "heart", t("Recovery"));

/** Keeps the two buttons and their seconds on `run.home`, once the board is drawn. */
export function bindHome(run, layer) {
  const one = kind => {
    const element = layer.querySelector(`[data-sim="${kind}"]`);
    return element && { element, time: element.querySelector(".sim-home__time"), state: null };
  };
  run.home = { recall: one("recall"), recover: one("recover") };
}

function paintTime(time, label) {
  time.hidden = !label;
  if (time.textContent !== label) {
    time.textContent = label;
  }
}

/**
 * Each frame. Recall: the ring's `--fill` is the share of the 8 s gone, the seconds left in the middle. Recovery:
 * `is-recovering` while it gives health back, then a dark sweep and the seconds of its cooldown.
 */
export function paintHome(run, me) {
  const { recall, recover } = run.home ?? {};
  if (!recall || !recover || !me) {
    return;
  }
  const alive = Boolean(me.alive);
  const left = alive ? (me.recallLeft ?? 0) : 0;
  recall.state = coolState(recall.state, left);
  recall.element.classList.toggle("is-recalling", left > 0);
  recall.element.style.setProperty("--fill", String(left > 0 ? 1 - recall.state.share : 0));
  recall.element.disabled = !alive;
  paintTime(recall.time, recall.state.label);

  const cooling = alive && !me.recovering ? (me.recoveryLeft ?? 0) : 0;
  recover.state = coolState(recover.state, cooling);
  recover.element.classList.toggle("is-recovering", alive && Boolean(me.recovering));
  recover.element.classList.toggle("is-cooling", cooling > 0);
  recover.element.style.setProperty("--sweep", String(recover.state.share));
  recover.element.disabled = !alive || Boolean(me.recovering) || cooling > 0;
  paintTime(recover.time, recover.state.label);
}
