// combo routes, small helpers: player, requireHero, skillIdsOf.
import { badRequest, unauthorized } from "../../platform/errors.js";
import { requireHero } from "../heroes/require-hero.js";

export { requireHero };

export const player = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use the training area.");
  }
  return request.user;
};

/** The skills a step may use: the ones on the sheet of the hero (a combo shows their pictures). */
export async function skillIdsOf(ctx, heroId) {
  const stored = await ctx.store.getHeroDetails(heroId, "en");
  const ids = (stored?.details?.skills ?? []).filter(skill => skill.id).map(skill => skill.id);
  if (!ids.length) {
    throw badRequest("The skills of this hero have not been fetched yet.", "invalid_body");
  }
  return new Set(ids);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { requireHero, skillIdsOf };
