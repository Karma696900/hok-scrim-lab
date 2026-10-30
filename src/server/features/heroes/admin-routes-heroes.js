// admin routes, heroes: registerHeroesRoutes.
import { LANES, parseHeroAlias, parseLaneAddition } from "./hero-domain.js";
import { badRequest, notFound } from "../../platform/errors.js";
import { heroNameKey } from "../../../shared/vod-model.js";
import { wrap } from "../../platform/http/async.js";

export function registerHeroesRoutes(ctx) {
  // Camp gives one lane per hero. An admin can add more (Flowborn forms included; they are marked
  // "manual" and survive roster syncs) and take any lane away again, Camp's included (the removal
  // is remembered), but a hero always keeps one. The change shows everywhere at once: the roster,
  // the lane filters, the hero pool of a draft, the auto-pick and the tier lists of that lane all
  // read the hero's lanes.
  ctx.router.post(
    "/admin/heroes/:id/lanes",
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      const { lane, note } = parseLaneAddition(request.body);
      if (hero.lanes.includes(lane)) {
        throw badRequest("This hero already has that lane.", "rule_violation");
      }
      await ctx.store.addHeroLane(hero.id, lane, note, request.user.id);
      ctx.prerender?.invalidate();
      const source =
        (await ctx.store.readHeroes()).find(item => item.id === hero.id)?.laneSources?.[lane] ??
        "manual";
      return { heroId: hero.id, lane, source };
    })
  );

  ctx.router.delete(
    "/admin/heroes/:id/lanes/:lane",
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      if (!LANES.includes(request.params.lane)) {
        throw notFound("Lane not found.");
      }
      const outcome = await ctx.store.removeHeroLane(hero.id, request.params.lane, request.user.id);
      if (outcome === "last") {
        throw badRequest(
          "A hero keeps at least one lane: add another one before removing this one.",
          "rule_violation"
        );
      }
      if (outcome === "missing") {
        throw notFound("This hero does not have that lane.");
      }
      ctx.prerender?.invalidate();
      return { removed: true };
    })
  );

  // The other names of a hero (what a broadcast or a Liquipedia page calls it): the automatic import reads them to find
  // the hero in a title or a table. One key names one hero only.
  ctx.router.get(
    "/admin/heroes/:id/aliases",
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      const aliases = await ctx.store.listHeroAliases(hero.id);
      return {
        heroId: hero.id,
        key: heroNameKey(hero.name),
        aliases: aliases.map(({ alias, key }) => ({ alias, key }))
      };
    })
  );

  ctx.router.post(
    "/admin/heroes/:id/aliases",
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      const { alias, key } = parseHeroAlias(request.body);
      const heroes = await ctx.store.readHeroes();
      const own = heroes.find(item => heroNameKey(item.name) === key);
      if (own) {
        throw badRequest(
          own.id === hero.id
            ? "That is already the name of this hero."
            : "That is the name of another hero.",
          "rule_violation"
        );
      }
      const result = await ctx.store.addHeroAlias(hero.id, alias, key, request.user.id);
      if (result.outcome === "taken") {
        throw badRequest(
          result.heroId === hero.id
            ? "This hero already has that name."
            : "Another hero already has that name.",
          "rule_violation"
        );
      }
      return { heroId: hero.id, alias, key };
    })
  );

  ctx.router.delete(
    "/admin/heroes/:id/aliases/:key",
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      if (!(await ctx.store.removeHeroAlias(hero.id, request.params.key))) {
        throw notFound("This hero does not have that name.");
      }
      return { removed: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerHeroesRoutes };
