// The addresses between the site and the bots server (bots-link.js). For a signed-in player: the ticket of a live
// game. For the bots server only, behind the shared secret (`x-bots-secret`): whether an API key of /me/api is
// live and whose it is, and the end of a live game, kept for the player's history. The page no longer sends the
// end of a game itself: the game runs on the bots server, which alone knows how it ended.
import { Router } from "express";
import {
  forbidden,
  HttpError,
  message,
  notFound,
  tooMany,
  unauthorized
} from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parseUuid, plainObject, text } from "../../platform/validation.js";
import { hashKey } from "../api-keys/api-key-domain.js";
import { GAMES_PER_DAY, parseChoice, parseGame } from "./simulation-domain.js";

const DAY = 86_400_000;
const KEY_MAX = 200;
const POOL_KEPT_MS = 10 * 60_000;

// the bots server is not set, or does not answer: the page says so and offers to try later
const closed = () =>
  new HttpError(
    503,
    "unavailable",
    message("The games against the bots are not open right now. Try again later."),
    { retryAfterSeconds: 600 }
  );

/** The heroes the bots can play, asked of the bots server and kept 10 minutes. */
function poolOf(bots) {
  let kept = null;
  return async () => {
    if (kept && kept.until > Date.now()) {
      return kept.heroes;
    }
    const answer = await fetch(`${bots.url}/v1/heroes`, { signal: AbortSignal.timeout(5000) });
    if (!answer.ok) {
      throw new Error(`bots server: ${answer.status}`);
    }
    const { heroes } = await answer.json();
    kept = { heroes, until: Date.now() + POOL_KEPT_MS };
    return heroes;
  };
}

const player = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to continue.");
  }
  return request.user;
};

/** The bots server only: without the shared secret (or with no link set) every caller is refused, 403. */
const botsOnly = bots => (request, _response, next) =>
  next(bots?.secretMatches(request.get("x-bots-secret")) ? undefined : forbidden());

const knownHeroes = async store => new Set((await store.readHeroes()).map(hero => hero.id));

export function createBotsRouter({ store, limiters, bots }) {
  const router = Router();
  const pool = bots ? poolOf(bots) : null;

  router.get(
    "/simulation/pool",
    wrap(async () => {
      if (!pool) {
        throw closed();
      }
      try {
        return { heroes: await pool() };
      } catch {
        throw closed();
      }
    })
  );

  router.post(
    "/simulation/ticket",
    limiters.write,
    wrap(async request => {
      const user = player(request);
      if (!bots) {
        throw closed();
      }
      const { choice, limit } = parseChoice(request.body, await knownHeroes(store));
      const ticket = bots.ticketFor({ userId: user.id, choice, ...(limit ? { limit } : {}) });
      // the end of the game comes back from the bots server (POST /internal/simulation/games)
      return { url: `${bots.socketOrigin}/v1/play?ticket=${encodeURIComponent(ticket)}` };
    })
  );

  router.post(
    "/internal/api-keys/verify",
    botsOnly(bots),
    wrap(async request => {
      const key = text(plainObject(request.body).key, "key", { min: 8, max: KEY_MAX });
      const found = await store.findApiKey(hashKey(key));
      if (!found || found.user.isGuest) {
        throw notFound();
      }
      await store.touchApiKey(found.key.id);
      return { userId: found.user.id, keyId: found.key.id, scopes: found.key.scopes };
    })
  );

  router.post(
    "/internal/simulation/games",
    botsOnly(bots),
    wrap(async (request, response) => {
      const body = plainObject(request.body);
      const userId = parseUuid(body.userId, "user id");
      if (!(await store.getAuthUser(userId))) {
        throw notFound();
      }
      const game = parseGame(body.game, await knownHeroes(store));
      const now = Date.now();
      if ((await store.simulationGamesSince(userId, now - DAY)) >= GAMES_PER_DAY) {
        throw tooMany("That is a lot of games for one day: come back later.", 3600);
      }
      await store.addSimulationGame(userId, game, now);
      response.status(201);
      return { saved: true };
    })
  );

  return router;
}
