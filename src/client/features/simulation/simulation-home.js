// The Recall and Recovery buttons of the player, left of the summoner spell (owner, 2026-11-03: "fais tout ce qui
// n'est pas encore fait"; the proposal of 2026-11-02). Recall: the hero heads home after 8 s unless he moves,
// aims or is hit; a ring fills around the button meanwhile. Recovery: health comes back over a few seconds, stops
// at a hit, then the button cools down as the spell does. The bots server sends `recallLeft`, `recoveryLeft` and
// `recovering` on the player's hero.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { catalogImageAttrs } from "../../domain/catalog-display.js";
import { artOf } from "./simulation-shared.js";
import { coolState } from "./simulation-cooldown.js";

// the game's icon the bots server sends (`ui-recall`, `ui-recover`), else our glyph
const button = (kind, glyph, name, art) => {
  const picture = artOf(art, `ui-${kind}`);
  const face = picture ? `<img class="sim-home__art" src="${picture}" alt="">` : icon(glyph);
  return `<button type="button" class="sim-home sim-home--${kind}${picture ? " has-art" : ""}" data-sim="${kind}" aria-label="${name}" title="${name}">${face}<span class="sim-home__name">${name}</span><b class="sim-home__time" hidden></b></button>`;
};

/** The two buttons, Recall then Recovery, for the tools row; `art` the pictures of the bots server's start. */
export const homeToolsHtml = (art = {}) =>
  button("recall", "home", t("Recall"), art) + button("recover", "heart", t("Recovery"), art);

// the catalogue names the engine's Punish "Smite"; the other spells keep their name
const CATALOGUE_NAME = { punish: "smite" };

/**
 * The picture of the summoner spell `key` (the engine's name) from the Catalogue (`/api/catalog`), for its button:
 * "" when the catalogue has none, and the button keeps its glyph.
 */
export function spellArtHtml(catalog, key) {
  const name = CATALOGUE_NAME[key] ?? key;
  const spell = (catalog?.spells ?? []).find(entry => String(entry.name).toLowerCase() === name);
  return spell?.imageId
    ? `<img class="sim-spell__art" ${catalogImageAttrs(spell.imageId, 56)} alt="" width="56" height="56" decoding="async">`
    : "";
}

/** Keeps the two buttons and their seconds on `run.home`, once the board is drawn. */
export function bindHome(run, layer) {
  const one = kind => {
    const element = layer.querySelector(`[data-sim="${kind}"]`);
    return element && { element, time: element.querySelector(".sim-home__time"), state: null };
  };
  run.home = { recall: one("recall"), recover: one("recover") };
}

function paintTime(time, label) {
  if (time.hidden !== !label) {
    time.hidden = !label;
  }
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
