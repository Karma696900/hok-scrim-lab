// The ranking of the teams of a player, on the page of the reflex exercises: shown when the staff of a team
// opened it to its players (or when the player is staff). The best score of each player who is asked to
// train, in the exercise one chooses, this week or ever. A page that cannot show it says nothing.
import { EXERCISES } from "../../../../shared/reflex-model.js";
import { bindTo } from "../../../../shared/bind-to.js";
import { onView as rankingParts } from "./ranking-parts.js";

export function createRanking({ api, esc, state }) {
  const view = { api, esc, state };
  bindTo(view, rankingParts);
  view.choice = { team: "", exercise: EXERCISES[0].id, period: "week" };

  return { fill: view.fill };
}
