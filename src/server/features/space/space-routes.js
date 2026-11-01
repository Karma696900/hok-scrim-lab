import { Router } from "express";
import { notFound, unauthorized } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parseUuid } from "../../platform/validation.js";
import {
  BUILDS_IN_ALL_MAX,
  BUILDS_PER_HERO_MAX,
  LINKS_MAX,
  LINK_DAYS,
  SECTIONS,
  parseBuild,
  parseLink,
  parseToken
} from "./space-domain.js";

const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use your space.");
  }
  return request.user;
};

/**
 * The personal space: the builds a person keeps on their account (next to their tier lists and their
 * training sheet, which have their own pages), and the links with which they share all of it. A link
 * shares the parts its owner chose, read only, with whoever has it and without an account; it is the
 * only way a space is shared. The token travels in the body of a request, never in an address, so
 * that no log keeps it.
 */
/** The training part of a space: heroes worked on, notes, combos, reflex bests, last simulation games. */
async function trainingOf(store, userId) {
  const [focus, notes, combos, reflex, simulation] = await Promise.all([
    store.getTrainingFocus(userId),
    store.listTrainingNotes(userId),
    store.acquiredCombos(userId),
    store.reflexSummary(userId, { now: Date.now(), offset: 0 }),
    store.listSimulationGames(userId, 5)
  ]);
  return {
    focus,
    notes,
    combos,
    simulation,
    reflex: {
      streak: reflex.streak,
      best: Object.fromEntries(
        Object.entries(reflex.exercises)
          .filter(([, stats]) => stats.best !== null)
          .map(([id, stats]) => [id, stats.best])
      )
    }
  };
}

export function createSpaceRouter({ store, limiters }) {
  const router = Router();
  const knownHeroIds = async () =>
    new Set(
      (await store.readHeroes()).filter(hero => hero.availableGlobal !== false).map(hero => hero.id)
    );

  /** What a space shows for some of its parts: the same for its owner and for the people it is shared with. */
  async function contentOf(userId, sections) {
    const shown = {};
    if (sections.includes("tierLists")) {
      shown.tierLists = await store.ownedTierLists(userId);
    }
    if (sections.includes("builds")) {
      shown.builds = await store.listSpaceBuilds(userId);
    }
    if (sections.includes("training")) {
      shown.training = await trainingOf(store, userId);
    }
    return shown;
  }

  router.get(
    "/space",
    wrap(async request => {
      const user = account(request);
      return {
        ...(await contentOf(user.id, SECTIONS)),
        links: await store.listSpaceLinks(user.id),
        limits: {
          builds: BUILDS_IN_ALL_MAX,
          buildsPerHero: BUILDS_PER_HERO_MAX,
          links: LINKS_MAX,
          days: LINK_DAYS
        }
      };
    })
  );

  // ---- the builds kept on the account -----------------------------------------------------------
  router.post(
    "/space/builds",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      return store.addSpaceBuild(user.id, parseBuild(request.body, await knownHeroIds()));
    })
  );
  router.delete(
    "/space/builds/:id",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      if (!(await store.deleteSpaceBuild(user.id, parseUuid(request.params.id, "build id")))) {
        throw notFound("Build not found.");
      }
      return { removed: true };
    })
  );

  // ---- the links ------------------------------------------------------------------------------------
  router.post(
    "/space/links",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      // the token is given now and never again: only its hash is kept
      return store.createSpaceLink(user.id, parseLink(request.body, Date.now()));
    })
  );
  router.delete(
    "/space/links/:id",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      if (!(await store.deleteSpaceLink(user.id, parseUuid(request.params.id, "link id")))) {
        throw notFound("Link not found.");
      }
      return { removed: true };
    })
  );

  // ---- opening a link (no account) ------------------------------------------------------------------
  router.post(
    "/space/open",
    limiters.write,
    wrap(async request => {
      const link = await store.openSpaceLink(parseToken(request.body), Date.now());
      if (!link) {
        throw notFound("This link does not exist or has ended.");
      }
      return {
        owner: link.owner,
        sections: link.sections,
        ...(await contentOf(link.userId, link.sections))
      };
    })
  );

  return router;
}
