import { Router } from "express";
import { notFound } from "../../platform/errors.js";
import { requireEditor, wrap } from "../../platform/http/async.js";
import { parseExpectedVersion } from "../../platform/validation.js";
import { LANES } from "../heroes/hero-domain.js";
import { OFFICIAL_TIERS, officialList, parseOfficialInput } from "./official.js";

/**
 * The official ratings of the heroes: a tier list per lane, from SS to D. Only the editors read and
 * write the lists; everybody sees the result as the rating next to each lane on the page of a hero
 * (see the hero routes).
 */
export function createOfficialRatingsRouter({ store, limiters }) {
  const router = Router();
  const present = (lane, saved, heroes) => ({
    ...officialList(lane, saved, heroes),
    version: saved?.version ?? null,
    updatedAt: saved?.updatedAt ?? null
  });

  router.get(
    "/official-tiers",
    wrap(async request => {
      requireEditor(request);
      const [saved, heroes] = await Promise.all([
        store.listOfficialTierLists(),
        store.readHeroes()
      ]);
      return {
        tiers: OFFICIAL_TIERS,
        lanes: LANES.map(lane => present(lane, saved.get(lane), heroes))
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
      return { ...document, version, updatedAt };
    })
  );

  return router;
}
