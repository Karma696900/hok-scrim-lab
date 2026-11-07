// casino page, the reels: the lanes a spin drew scroll like a slot machine (other heroes passing by, slowing down,
// stopping on the one drawn) for about 1.5 s; the lanes not drawn stay still. The hero drawn is already in the page
// before the reel moves, so the result is there even when the animation is cut short. Transform and opacity only
// (casino.css); nothing moves when the person asked for reduced motion.
import { heroCard } from "./casino-markup.js";
import { escapeHtml } from "../../lib/escape.js";

const FILLERS = 7;
export const SPIN_MS = 1500;
const running = new WeakMap();

const shuffled = (items, count) => {
  const pool = [...items];
  const out = [];
  while (pool.length && out.length < count) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
};

/** Spins the reels of `lanes` in `root`; resolves when they stop (at once with `reduced`). */
export function spinReels(root, lanes, heroes, { reduced }) {
  running.get(root)?.();
  if (reduced || !lanes?.length) {
    return Promise.resolve();
  }
  const view = { esc: escapeHtml };
  const ids = [...heroes.keys()];
  const reels = lanes
    .map(lane => root.querySelector(`.casino-reel[data-lane="${lane}"]`))
    .filter(Boolean);
  const finals = reels.map(reel => reel.innerHTML);
  reels.forEach((reel, index) => {
    const passing = shuffled(ids, FILLERS)
      .map(id => heroCard(view, heroes, id))
      .join("");
    reel.innerHTML = `<span class="casino-strip">${passing}${finals[index]}</span>`;
    reel.classList.add("is-spinning");
    reel.style.setProperty("--casino-stops", String(FILLERS));
    reel.style.setProperty("--casino-delay", `${index * 90}ms`);
  });
  return new Promise(resolve => {
    let timer = null;
    const end = () => {
      clearTimeout(timer);
      running.delete(root);
      reels.forEach((reel, index) => {
        reel.classList.remove("is-spinning");
        reel.innerHTML = finals[index];
      });
      resolve();
    };
    running.set(root, end);
    timer = setTimeout(end, SPIN_MS + reels.length * 90);
  });
}
