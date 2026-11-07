// The composition roulette (/casino and /casino/<id>, spec 2026-11-07 casino): no account. The landing makes a
// roulette; a roulette's page shows its five lanes to everyone, refreshed live, and its controls to the browser that
// holds its key (casino-key.js). The server draws; this module only shows and asks.
import { pageRoot } from "../../app/view-wrapper.js";
import { escapeHtml } from "../../lib/escape.js";
import { landingMarkup, missingMarkup, rollMarkup } from "./casino-markup.js";
import { onAction, onChange } from "./casino-actions.js";
import { poolsMarkup } from "./casino-pools.js";
import { readKey, takeKeyFromHash } from "./casino-key.js";
import { startLive } from "./casino-live.js";
import { spinReels } from "./casino-reels.js";

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
    key: null
  };
  view.stop = () => {};
  view.heroes = () => new Map((state.heroes ?? []).map(hero => [hero.id, hero]));

  /** Draws the whole roulette again (a new state from the server, or a change of who controls it). */
  view.paint = () => {
    if (!view.root) {
      return;
    }
    const heroes = view.heroes();
    if (!view.roll) {
      view.root.innerHTML = view.id ? missingMarkup(view) : landingMarkup(view);
      return;
    }
    const control = Boolean(view.key);
    const extra = control ? poolsMarkup(view, state.heroes ?? [], view.roll.pools) : "";
    view.root.innerHTML = rollMarkup(view, view.roll, heroes, { control, extra });
  };

  /** Takes a state from the server: paints it, and spins the reels of the lanes it drew when it is new. */
  view.take = (roll, { animate = true } = {}) => {
    const fresh = animate && view.roll && roll && roll.version !== view.roll.version;
    view.roll = roll;
    view.paint();
    if (fresh && view.root) {
      spinReels(view.root, roll.drawn, view.heroes(), { reduced: reducedMotion() }).catch(() => {});
    }
  };

  return {
    /** Draws the landing (`casinoId` null) or one roulette. */
    async show(app, casinoId = null) {
      view.stop();
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
