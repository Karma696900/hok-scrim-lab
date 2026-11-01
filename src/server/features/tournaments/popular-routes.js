import { Router } from "express";
import { badRequest } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parseQueryChoice } from "../../platform/validation.js";
import {
  MIN_PERIOD_MONTHS,
  defaultPeriod,
  earliestEnd,
  spansEnough
} from "../../../shared/period.js";
import { publicFor } from "../../platform/http/cache-control.js";
import { parseDay } from "./tournament-domain.js";
import { popularDrafts, popularHeroes } from "./popular.js";
import { popularDuos } from "./popular-duos.js";
import { heroFacts } from "./popular-facts.js";

const RULES = ["classic", "free-for-all", "global-ban-pick"];

/**
 * The popularity pages: the drafts and the heroes that are played most and that win most, over a
 * period of at least three months that never starts before the first tournament game that was
 * entered. Public. Only tournament games count, never the scrims.
 */
export function createPopularRouter({ store }) {
  const router = Router();

  /** The period asked for (or the usual one), and what the data covers. */
  async function periodOf(request) {
    const summary = await store.competitiveSummary();
    const today = new Date().toISOString().slice(0, 10);
    const usual = defaultPeriod({ today, first: summary.first });
    const asked = name =>
      request.query[name] === undefined ? null : parseDay(String(request.query[name]), name);
    let from = asked("from") ?? usual.from;
    const to = asked("to") ?? (today >= earliestEnd(from) ? today : earliestEnd(from));
    // the three months are the ones that were asked for...
    if (!spansEnough(from, to)) {
      throw badRequest("The period must span at least {months} months.", "invalid_query", {
        months: MIN_PERIOD_MONTHS
      });
    }
    // ...and the first game that was entered only trims the start: nothing is looked for before it
    if (summary.first && from < summary.first) {
      from = summary.first;
    }
    const rule = parseQueryChoice(request.query, "rule", ["", ...RULES], "");
    const minGames = Number(request.query.minGames ?? 1);
    if (!Number.isInteger(minGames) || minGames < 1 || minGames > 50) {
      throw badRequest("minGames must be a whole number between 1 and 50.", "invalid_query");
    }
    return {
      from,
      to,
      rule,
      minGames,
      meta: {
        period: {
          from,
          to,
          first: summary.first,
          last: summary.last,
          minMonths: MIN_PERIOD_MONTHS
        },
        rule,
        rules: RULES,
        minGames
      }
    };
  }

  /** The games of the period (the date is the start of it: the store keeps them for 30 s). */
  async function gamesIn({ from, to, rule }) {
    return (await store.competitiveGames(from)).filter(
      game => game.playedOn <= to && (!rule || game.rule === rule)
    );
  }

  /**
   * The answer for a period, computed once per 30 s whatever the number of visitors (it reads every
   * game of the period, 20 to 55 ms of the one thread on 2 800 games) and handed to browsers and CDNs
   * for a minute. The key names everything the answer depends on, and any tournament edit drops it.
   */
  async function answer(kind, request, response, build) {
    const period = await periodOf(request);
    const key = `${kind}|${period.from}|${period.to}|${period.rule}|${period.minGames}`;
    const body = await store.rememberCompetitive(key, async () => {
      const games = await gamesIn(period);
      // the weights of the games count from the end of the period, or today when it is not over
      const today = new Date().toISOString().slice(0, 10);
      const day = period.to < today ? period.to : today;
      return {
        ...period.meta,
        totalGames: games.length,
        ...(await build(games, period.minGames, day))
      };
    });
    publicFor(response);
    return body;
  }

  router.get(
    "/popular/drafts",
    wrap((request, response) =>
      answer("drafts", request, response, (games, minGames, today) => ({
        sides: popularDrafts(games, { minGames, today }),
        duos: popularDuos(games, { minGames, today })
      }))
    )
  );

  router.get(
    "/popular/heroes",
    wrap((request, response) =>
      answer("heroes", request, response, async (games, minGames, today) =>
        popularHeroes(games, { minGames, today, ...(await heroFacts(store, today)) })
      )
    )
  );

  return router;
}
