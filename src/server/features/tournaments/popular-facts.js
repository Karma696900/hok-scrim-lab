// What weighs a hero's tournament games: the day of its last balance change (from its Camp sheet),
// and the lanes it can play. Shared by the popular pages and the public tier list.
import { lastChanges } from "./popular-score.js";

/** { lastChange: { heroId: "YYYY-MM-DD" }, heroLanes: { heroId: [lane...] } } as of `today`. */
export async function heroFacts(store, today) {
  const days = await store.heroChangeDays();
  const lastChange = lastChanges(
    Object.fromEntries(
      Object.entries(days).map(([id, list]) => [
        id,
        { adjustments: list.map(day => ({ publishedAt: day })) }
      ])
    ),
    today
  );
  const heroLanes = Object.fromEntries(
    (await store.readHeroes()).map(hero => [hero.id, hero.lanes ?? []])
  );
  return { lastChange, heroLanes };
}
