import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as comboRoutesParts } from "./combo-routes-parts.js";
import { onView as comboRoutesCombos } from "./combo-routes-combos.js";
import { onView as comboRoutesTraining } from "./combo-routes-training.js";

/**
 * The combos of the heroes. The editors (administrators and Contributors) write them, everybody
 * reads them on the page of the hero (see the hero routes); a signed-in player says which ones they
 * have acquired, in two forms: as they are and with the animation cancelled.
 */
export function createComboRouter({ store, limiters }) {
  const ctx = { store, limiters };
  bindTo(ctx, comboRoutesParts, comboRoutesCombos, comboRoutesTraining);
  ctx.router = Router();

  ctx.registerCombosRoutes();

  ctx.registerTrainingRoutes();

  return ctx.router;
}
