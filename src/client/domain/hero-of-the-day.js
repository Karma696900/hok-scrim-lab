import { api } from "../app/api-client.js";
import { state } from "../app/app-state.js";

// The hero of the day and its cover art, shared by the overview banner and the hero index.

/** The hero of the day: one hero, the same all day, chosen among the Global roster. */
export function heroOfTheDay() {
  const pool = state.heroes.filter(hero => hero.availableGlobal !== false && !hero.isFlowborn);
  if (!pool.length) {
    return null;
  }
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  return pool[day % pool.length];
}

const sheets = new Map();

/** The stored Camp sheet of a hero (cover art, skills), or null: without it nothing is made up. */
export async function heroSheet(hero) {
  if (!sheets.has(hero.id)) {
    sheets.set(
      hero.id,
      api(`/api/heroes/${encodeURIComponent(hero.id)}`)
        .then(({ details }) => details ?? null)
        .catch(() => null)
    );
  }
  return sheets.get(hero.id);
}
