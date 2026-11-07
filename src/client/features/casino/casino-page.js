// The composition roulette (/casino and /casino/<id>, spec 2026-11-07 casino): no account. The landing makes a
// roulette; a roulette's page shows its five lanes to everyone, refreshed live, and its controls to the browser that
// holds its key (casino-key.js). The server draws; this module only shows and asks.
import { pageRoot } from "../../app/view-wrapper.js";
import { escapeHtml } from "../../lib/escape.js";
import { landingMarkup, missingMarkup, rollMarkup } from "./casino-markup.js";
import { onAction, onChange, searchPools } from "./casino-actions.js";
import { readBasket } from "./casino-basket.js";
import { closeBasket } from "./casino-basket-panel.js";
import { fillSceneArt, sceneHero } from "../../domain/scene-art.js";
import { poolsMarkup } from "./casino-pools.js";
import { readKey, takeKeyFromHash } from "./casino-key.js";
import { startLive } from "./casino-live.js";
import { spinReels } from "./casino-reels.js";
import { creatorSpun, shownState } from "./casino-local.js";

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// one ask of the live view: 200 with the state, 304 when nothing changed, 404 when the roulette is gone
const fetchRoll = async (id, since) => {
  const response = await fetch(`/api/casino/${encodeURIComponent(id)}?since=${since}`);
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
};

export function createCasinoPage({ hydration, api, tell, go, state }) {
  const view = {
    state,
    api,
    tell,
    go,
    esc: escapeHtml,
    root: null,
    roll: null,
    id: null,
    key: null,
    // a spectator's own spin, shown on this screen only (casino-local.js)
    local: null
  };
  view.stop = () => {};
  view.heroes = () => new Map((state.heroes ?? []).map(hero => [hero.id, hero]));
  /** Spins the reels of the `lanes` just drawn (the creator's spin, or a spectator's own). */
  view.reel = lanes =>
    spinReels(view.root, lanes, view.heroes(), { reduced: reducedMotion() }).catch(() => {});

  /** Draws the whole roulette again (a new state from the server, or a change of who controls it). */
  view.paint = () => {
    if (!view.root) {
      return;
    }
    const heroes = view.heroes();
    const basket = readBasket().length;
    if (!view.roll) {
      const art = sceneHero(3);
      view.root.innerHTML = view.id
        ? missingMarkup(view, { art })
        : landingMarkup(view, { art, basket });
      fillSceneArt(view.root.querySelector(".cs-stage__art"), art);
      return;
    }
    const control = Boolean(view.key);
    const shown = shownState(view.roll, control ? null : view.local);
    const local =
      !control && view.local ? { creatorSpun: creatorSpun(view.roll, view.local) } : null;
    // a change of the pools not saved yet stays on screen when another change of the roulette arrives
    const pools = view.pendingPools ?? view.roll.pools;
    const extra = control ? poolsMarkup(view, state.heroes ?? [], pools) : "";
    const art = heroes.get(shown.result?.mid ?? "") ?? sceneHero(3);
    view.root.innerHTML = rollMarkup(view, shown, heroes, { control, extra, basket, art, local });
    fillSceneArt(view.root.querySelector(".cs-stage__art"), art);
    if (view.search) {
      const box = view.root.querySelector('input[name="casino-search"]');
      if (box) {
        box.value = view.search;
        searchPools(view, view.search);
      }
    }
  };

  /** Takes a state from the server: paints it, and spins the reels of the lanes it drew when it is new. */
  view.take = (roll, { animate = true } = {}) => {
    // a spectator on their own spin keeps their heroes: the creator's new spin is only announced
    const fresh = animate && !view.local && view.roll && roll && roll.version !== view.roll.version;
    view.roll = roll;
    view.paint();
    if (fresh && view.root) {
      view.reel(roll.drawn);
    }
  };

  return {
    /** Draws the landing (`casinoId` null) or one roulette. */
    async show(app, casinoId = null) {
      view.stop();
      closeBasket();
      view.pendingPools = null;
      view.search = "";
      view.local = null;
      view.root = pageRoot(app, hydration, "casino-root");
      view.root.addEventListener("click", event => onAction(view, event));
      view.root.addEventListener("input", event => onChange(view, event));
      view.id = casinoId;
      view.roll = null;
      view.key = casinoId
        ? (takeKeyFromHash(casinoId, location, history) ?? readKey(casinoId))
        : null;
      if (!casinoId) {
        view.paint();
        return;
      }
      try {
        view.take(await api(`/api/casino/${encodeURIComponent(casinoId)}`), { animate: false });
      } catch {
        view.roll = null;
        view.paint();
        return;
      }
      view.stop = startLive({
        id: casinoId,
        version: () => view.roll?.version ?? -1,
        // the page was left: no more asking
        fetchState: since => {
          if (!view.root?.isConnected) {
            view.stop();
            return { status: 304, body: null };
          }
          return fetchRoll(casinoId, since);
        },
        onState: roll => {
          if (roll === null) {
            view.roll = null;
            view.paint();
            return;
          }
          view.take(roll);
        }
      });
    }
  };
}
