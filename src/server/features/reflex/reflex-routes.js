import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as reflexRoutesParts } from "./reflex-routes-parts.js";
import { onView as reflexRoutesTrainingTeam } from "./reflex-routes-training-team.js";
import { onView as reflexRoutesTraining } from "./reflex-routes-training.js";
import { onView as reflexRoutesTeams } from "./reflex-routes-teams.js";

/**
 * The reflex exercises. They are played in the browser and send nothing while they run: the result
 * is kept once the run is over. A team can ask its players for a number of runs, or of minutes, each
 * day or each week; the owner, the managers and the coaches set it, every player sees their own
 * progress and the staff sees everybody's.
 */
export function createReflexRouter({ store, limiters }) {
  const ctx = { store, limiters };
  bindTo(ctx, reflexRoutesParts, reflexRoutesTrainingTeam, reflexRoutesTraining, reflexRoutesTeams);
  ctx.router = Router();

  ctx.registerTrainingRoutes();

  ctx.registerTeamsRoutes();

  ctx.registerTeamsRoutes2();

  return ctx.router;
}
