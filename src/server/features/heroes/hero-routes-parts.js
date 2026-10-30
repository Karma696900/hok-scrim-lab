// hero routes, small helpers: minGames.
import { badRequest } from "../../platform/errors.js";

export function minGames(ctx, request) {
  if (request.query.minGames === undefined) {
    return ctx.config.minSampleGames;
  }
  const value = Number(request.query.minGames);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw badRequest("minGames must be a whole number between 1 and 1000.", "invalid_query");
  }
  return value;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { minGames };
