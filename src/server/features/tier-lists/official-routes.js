import { Router } from "express";
import { notFound } from "../../platform/errors.js";
import { requireEditor, wrap } from "../../platform/http/async.js";
import { parseExpectedVersion } from "../../platform/validation.js";
import { LANES } from "../heroes/hero-domain.js";
import { publicFor } from "../../platform/http/cache-control.js";
import { OFFICIAL_TIERS, officialList, parseOfficialInput } from "./official.js";
import { computedTiers, currentTierList } from "./public-tier-list-service.js";

/**
 * The official ratings of the heroes: a tier list per lane, from SS to D. Only the editors read and
 * write the lists; everybody sees the result as the rating next to each lane on the page of a hero
 * (see the hero routes). The public tier list (/api/tier-list) puts the tournaments first and these
 * ratings next, for the heroes played too little.
 */
export function createOfficialRatingsRouter({ store, limiters }) {
  const router = Router();
  const present = (lane, saved, heroes) => ({
    ...officialList(lane, saved, heroes),
    version: saved?.version ?? null,
    updatedAt: saved?.updatedAt ?? null
  });

  router.get(
    "/tier-list",
    wrap(async (request, response) => {
      const list = await currentTierList(store);
      publicFor(response);
      return list;
    })
  );

  router.get(
    "/official-tiers",
    wrap(async request => {
      requireEditor(request);
      const [saved, heroes, list] = await Promise.all([
        store.listOfficialTierLists(),
        store.readHeroes(),
        currentTierList(store)
      ]);
      return {
        tiers: OFFICIAL_TIERS,
        lanes: LANES.map(lane => ({
          ...present(lane, saved.get(lane), heroes),
          // the heroes the tournaments already rank, with their tier: their rating here does not count
          computed: computedTiers(list, lane)
        }))
      };
    })
  );

  router.put(
    "/official-tiers/:lane",
    limiters.write,
    wrap(async request => {
      const editor = requireEditor(request);
      if (!LANES.includes(request.params.lane)) {
        throw notFound("Lane not found.");
      }
      const tiers = parseOfficialInput(request.body);
      const expected = parseExpectedVersion(request.body);
      const heroes = await store.readHeroes();
      const document = officialList(
        request.params.lane,
        { tiers: tiers.map(tier => ({ ...tier, id: tier.label })) },
        heroes
      );
      const { version, updatedAt } = await store.saveOfficialTierList(
        request.params.lane,
        { tiers: document.tiers, unranked: document.unranked },
        expected,
        editor.id
      );
      const list = await currentTierList(store);
      return {
        ...document,
        version,
        updatedAt,
        computed: computedTiers(list, request.params.lane)
      };
    })
  );

  return router;
}
