import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as trainingRoutesParts } from "./training-routes-parts.js";
import { onView as trainingRoutesNotes } from "./training-routes-notes.js";
import { onView as trainingRoutesScenarios } from "./training-routes-scenarios.js";

/**
 * Training. The notebook, the focus heroes and the answers belong to the signed-in player and are
 * never visible to anybody else. The maps and the prepared situations are written by
 * administrators; everybody reads the published situations.
 */
export function createTrainingRouter({ store, limiters }) {
  const ctx = { store, limiters };
  bindTo(ctx, trainingRoutesParts, trainingRoutesNotes, trainingRoutesScenarios);
  ctx.router = Router();

  ctx.registerNotesRoutes();

  ctx.registerScenariosRoutes();

  return ctx.router;
}
