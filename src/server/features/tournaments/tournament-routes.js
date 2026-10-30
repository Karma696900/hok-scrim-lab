import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as tournamentRoutesParts } from "./tournament-routes-parts.js";
import { onView as tournamentRoutesMain } from "./tournament-routes-main.js";
import { onView as tournamentRoutesCompetitiveImportsMain } from "./tournament-routes-competitive-imports-main.js";
import { onView as tournamentRoutesTournaments } from "./tournament-routes-tournaments.js";

/**
 * The competitive data under /api/admin: aggregate numbers imported from others, and real
 * tournament series entered by hand.
 */
export function createTournamentRouter({ store, limiters }) {
  const ctx = { store, limiters };
  bindTo(
    ctx,
    tournamentRoutesParts,
    tournamentRoutesMain,
    tournamentRoutesCompetitiveImportsMain,
    tournamentRoutesTournaments
  );
  ctx.router = Router();

  ctx.registerMainRoutes();

  ctx.registerCompetitiveImportsMainRoutes();

  ctx.registerTournamentsRoutes();

  return ctx.router;
}
