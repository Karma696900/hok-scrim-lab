// tournament routes, small helpers: pageOf, account, heroIds, flowbornIds.
import { isFlowborn } from "../heroes/hero-domain.js";
import { unauthorized } from "../../platform/errors.js";

export const pageOf = value => Math.max(1, Math.min(10_000, Number.parseInt(value, 10) || 1));

// The tournament series and their games, to read (for the people who have an account, and so for the API
// keys): real games entered by the staff, nothing about who entered them.
export const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to continue.");
  }
};

// Tournaments: real series entered by hand. Writing replaces the whole series, so renaming and
// correcting are the same call.
export const heroIds = async ctx =>
  new Set((await ctx.store.readHeroes()).filter(hero => hero.availableGlobal).map(hero => hero.id));

export const flowbornIds = async ctx =>
  (await ctx.store.readHeroes()).filter(isFlowborn).map(hero => hero.id);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroIds, flowbornIds };
