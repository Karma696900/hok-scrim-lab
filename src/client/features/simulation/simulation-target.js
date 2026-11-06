// The target's box at the top middle of the screen, as the game's "Show Target Info": the enemy hero the player
// locked (the attack button, a portrait of the enemies in sight, or the keys 1 to 5), with its portrait, its name and
// its health. It shows while that hero is alive and in the frame (seen by the side), and is redrawn only when the
// target changes; its health bar follows every frame.
import { fillBar, healthBar, share } from "./simulation-hud.js";
import { esc, heroName, portrait } from "./simulation-shared.js";

/** The locked enemy hero as the box shows it, or null (no target, not a hero, dead or out of sight). */
export function targetInfo(state, view, heroes) {
  const target = state.target;
  if (target?.kind !== "hero") {
    return null;
  }
  const hero = view.heroes.find(h => h.id === target.id);
  if (!hero?.alive) {
    return null;
  }
  const maxHp = hero.maxHp ?? 1;
  const hp = Math.max(0, Math.round(hero.hp ?? maxHp));
  return {
    id: hero.id,
    heroId: hero.heroId,
    name: heroName(heroes, hero.heroId),
    hp,
    maxHp,
    share: share(hp, maxHp)
  };
}

/** The inside of the box for `info` (from targetInfo). */
export const targetHtml = (heroes, info) =>
  `<span class="sim-target__face">${portrait(heroes, info.heroId, 40)}</span><span class="sim-target__body"><b class="sim-target__name">${esc(info.name)}</b>${healthBar("sim-target__bar")}<small class="sim-target__hp">${info.hp} / ${info.maxHp}</small></span>`;

/** Every frame: the box of the locked hero (run.layerOf.target), drawn again only when the target changes. */
export function paintTarget(run, state, view) {
  const box = run.layerOf?.target;
  if (!box) {
    return;
  }
  const info = targetInfo(state, view, run.heroes);
  if (box.hidden !== (info === null)) {
    box.hidden = info === null;
  }
  if (!info) {
    run.targetBox = null;
    return;
  }
  if (run.targetBox !== info.id) {
    run.targetBox = info.id;
    box.innerHTML = targetHtml(run.heroes, info);
  }
  fillBar(box.querySelector(".sim-bar"), info.share, info.maxHp);
  const numbers = box.querySelector(".sim-target__hp");
  const text = `${info.hp} / ${info.maxHp}`;
  if (numbers.textContent !== text) {
    numbers.textContent = text;
  }
}
