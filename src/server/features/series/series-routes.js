import { Router } from "express";
import { finishGameTimer, pauseGameTimer, startGameTimer } from "./series.js";
import { registerSharingRoutes } from "../sharing/sharing-routes.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as seriesRoutesParts } from "./series-routes-parts.js";
import { onView as seriesRoutesMain } from "./series-routes-main.js";
import { onView as seriesRoutesTeams } from "./series-routes-teams.js";
import { onView as seriesRoutesTeamsSeries } from "./series-routes-teams-series.js";
import { onView as seriesRoutesGame } from "./series-routes-game.js";

export function createSeriesRouter({ store, identity, limiters }) {
  const env = { store, limiters, identity };
  bindTo(
    env,
    seriesRoutesParts,
    seriesRoutesMain,
    seriesRoutesTeams,
    seriesRoutesTeamsSeries,
    seriesRoutesGame
  );
  env.router = Router();

  env.registerMainRoutes();

  env.registerTeamsRoutes();

  env.registerMainRoutes2();

  env.registerGameRoutes();

  env.TIMER_OPERATIONS = {
    start: startGameTimer,
    pause: pauseGameTimer,
    finish: finishGameTimer
  };

  env.registerGameRoutes2();

  registerSharingRoutes(env.router, {
    store: env.store,
    kind: "series",
    path: "/series",
    limiters: env.limiters
  });

  return env.router;
}
