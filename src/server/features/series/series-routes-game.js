// series routes, game: registerGameRoutes.
import { DomainError, badRequest, notFound } from "../../platform/errors.js";
import { HERO_ID_PATTERN, plainObject } from "../../platform/validation.js";
import { advanceDraft, applyDraftAction, markDraftReady, stepsOf } from "./series-draft.js";
import { usedHeroes } from "../../../shared/draft-model.js";
import { editGameDraft, startNextGame } from "./series.js";
import { draftEdit } from "./series-routes-teams-series.js";
import { flowbornIdsOf } from "./series-routes-shared.js";

export function registerGameRoutes(env) {
  env.router.patch(
    "/series/:id/games/:index/draft",
    ...env.mutation(
      "editDraft",
      ({ series, body, params, heroes }) => {
        const index = Number(params.index);
        if (!Number.isInteger(index) || index < 0 || index >= series.games.length) {
          throw notFound("This game does not exist.");
        }
        editGameDraft(series, series.games[index], draftEdit(plainObject(body)), {
          heroes,
          flowbornIds: flowbornIdsOf(heroes)
        });
      },
      { needsHeroes: true }
    )
  );
  env.router.patch(
    "/series/:id/game/draft",
    ...env.mutation(
      "editDraft",
      ({ series, body, heroes }) => {
        editGameDraft(series, requireGame(series), draftEdit(plainObject(body)), {
          heroes,
          flowbornIds: flowbornIdsOf(heroes)
        });
      },
      { needsHeroes: true }
    )
  );

  env.router.post(
    "/series/:id/game",
    ...env.mutation("startGame", ({ series, body }) => {
      const blueTeam = body.blueTeam;
      if (blueTeam !== undefined && blueTeam !== null && typeof blueTeam !== "string") {
        throw badRequest("blueTeam must be a string.", "invalid_body");
      }
      return { json: startNextGame(series, blueTeam || undefined) };
    })
  );

  env.router.post(
    "/series/:id/game/ready",
    ...env.mutation("ready", ({ series, ctx }) => {
      const game = requireGame(series);
      if (ctx.online) {
        const teamName = ctx.side === "A" ? series.teamA.name : series.teamB.name;
        markDraftReady(game.draft, teamName === game.blueTeam ? "blue" : "red");
      } else {
        markDraftReady(game.draft, null, { localStart: true });
      }
    })
  );

  env.router.post(
    "/series/:id/game/action",
    ...env.mutation(
      "action",
      ({ series, body, heroes }) => {
        const game = requireGame(series);
        if (typeof body.heroId !== "string" || !HERO_ID_PATTERN.test(body.heroId)) {
          throw badRequest("heroId is required.", "invalid_body");
        }
        applyDraftAction(game.draft, body.heroId, {
          teamAUsed: usedHeroes(series, series.teamA.name),
          teamBUsed: usedHeroes(series, series.teamB.name),
          flowbornIds: flowbornIdsOf(heroes),
          heroes
        });
      },
      { needsHeroes: true, actingSide: actingSideOf, middleware: [env.limiters.draftAction] }
    )
  );

  env.router.post(
    "/series/:id/game/advance",
    ...env.mutation(
      "advance",
      ({ series, heroes }) => {
        const game = requireGame(series);
        const now = Date.now();
        const expired = game.draft.deadline !== null && now >= game.draft.deadline;
        if (!expired) {
          return { noChange: true };
        }
        advanceDraft(game.draft, now, {
          heroes,
          teamAUsed: usedHeroes(series, series.teamA.name),
          teamBUsed: usedHeroes(series, series.teamB.name),
          flowbornIds: flowbornIdsOf(heroes)
        });
      },
      { needsHeroes: true, middleware: [env.limiters.draftAction] }
    )
  );
}

function requireGame(series) {
  if (!series.currentGame) {
    throw new DomainError("There is no game in progress.");
  }
  return series.currentGame;
}

/** Which online player (A or B) must act on the draft's current step. */
function actingSideOf(series) {
  const game = series.currentGame;
  const step = game && stepsOf(game.draft)[game.draft.stepIndex];
  if (!step) {
    return null;
  }
  return (step.team === "blue" ? game.blueTeam : game.redTeam) === series.teamA.name ? "A" : "B";
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerGameRoutes };
