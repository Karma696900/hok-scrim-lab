import { needsOf } from "../../shared/view-registry.js";
import { api, fetchSeries, fetchTierLists } from "./api-client.js";
import { state } from "./app-state.js";

export function currentSeries() {
  return state.series.find(item => item.id === state.activeSeriesId) || null;
}

export function currentHero(heroId) {
  return (
    state.heroes.find(hero => hero.id === heroId) || {
      id: heroId,
      name: heroId,
      image: "",
      lanes: [],
      roles: []
    }
  );
}

// The roster, the series and the tier lists are loaded when a page needs them (shared/view-registry.js), each in its own
// request and all at once: a page waits for what it reads and for nothing else, and the account pages (sign in,
// register, codes) need none of it, so they are drawn as soon as the session is known.
const loaders = {
  async heroes() {
    const roster = await api("/api/heroes");
    state.roster = roster;
    state.heroes = roster.heroes || [];
  },
  async series() {
    state.series = await fetchSeries();
  },
  async tierLists() {
    state.tierLists = await fetchTierLists();
  }
};

const started = new Map();
const loaded = new Set();

/** Starts loading what a view needs (once: what is loaded or on its way is not asked again). */
export function startData(names) {
  for (const name of names) {
    if (!started.has(name)) {
      started.set(
        name,
        loaders[name]().then(
          () => {
            loaded.add(name);
            return null;
          },
          error => {
            started.delete(name); // the next page that needs it asks again
            return error;
          }
        )
      );
    }
  }
}

/** Is everything the view reads in memory? (An action that opens a page from another one asks before it draws it.) */
export const dataLoaded = view => needsOf(view).every(name => loaded.has(name));

/**
 * Resolves when the data a view needs is loaded (it starts it first): with null, or with the error of the first
 * request that failed (the page then says so).
 */
export async function dataFor(view) {
  const names = needsOf(view);
  startData(names);
  const failures = await Promise.all(names.map(name => started.get(name)));
  return failures.find(Boolean) ?? null;
}

/** The roster alone (the sign-in pages only want it for the picture of their cover). */
export const heroesReady = () => dataFor("login");

/** The tier lists of the person again (after a change the server made to them); the open one stays open when it is still there. */
export async function reloadTierLists() {
  state.tierLists = await fetchTierLists();
  if (!state.activeTierId || !state.tierLists.some(list => list.id === state.activeTierId)) {
    state.activeTierId = state.tierLists[0]?.id || null;
  }
}
