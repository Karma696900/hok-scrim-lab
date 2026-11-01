import { Router } from "express";
import { notFound, unauthorized } from "../../platform/errors.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";
import { revalidate } from "../../platform/http/cache-control.js";
import { parseUuid } from "../../platform/validation.js";
import { botsLinkFrom } from "./bots-link.js";
import { createBotsRouter } from "./bots-routes.js";
import { HISTORY_SIZE } from "./simulation-domain.js";

// the training map whose picture is the board (metadata), traced on the same frame as the map of the bots server
const MAP_KEY = "simulationMapId";

const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to keep your games.");
  }
  return request.user;
};

/**
 * What the site keeps of the Game Simulation, whose game runs on the bots server (private repository
 * hok-bots): the picture of the board, the history of a signed-in player's games (grade, difficulty,
 * hero, date) for the personal space, and the addresses shared with the bots server (bots-routes.js).
 */
export function createSimulationRouter({ store, limiters, bots = botsLinkFrom() }) {
  const router = Router();
  router.use(createBotsRouter({ store, limiters, bots }));

  mapRoutes(router, { store, limiters });

  router.get(
    "/simulation/games",
    wrap(async request => {
      const user = account(request);
      return { games: await store.listSimulationGames(user.id, HISTORY_SIZE) };
    })
  );

  return router;
}

/**
 * The picture of the board: one of the maps of the training, chosen by an administrator. None (or a map
 * deleted since): the board is drawn from the vector of the map.
 */
function mapRoutes(router, { store, limiters }) {
  router.get(
    "/simulation/map",
    wrap(async (request, response) => {
      revalidate(response, { shared: true });
      const id = await store.readMetadata(MAP_KEY);
      const known = id && (await store.listTrainingMaps()).some(map => map.id === id);
      return { image: known ? `/training-maps/${id}` : null };
    })
  );

  router.put(
    "/simulation/map",
    limiters.write,
    wrap(async request => {
      requireAdmin(request);
      const mapId = request.body?.mapId ? parseUuid(request.body.mapId, "map id") : "";
      if (mapId && !(await store.listTrainingMaps()).some(map => map.id === mapId)) {
        throw notFound("This map does not exist.");
      }
      await store.writeMetadata(MAP_KEY, mapId);
      return { image: mapId ? `/training-maps/${mapId}` : null };
    })
  );
}
