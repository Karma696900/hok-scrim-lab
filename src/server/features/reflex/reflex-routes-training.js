// reflex routes, training: registerTrainingRoutes.
import { MAX_RUNS_PER_DAY, parseOffset, parseRun } from "./reflex-domain.js";
import { exerciseOf, isBetter } from "../../../shared/reflex-model.js";
import { tooMany } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./reflex-routes-shared.js";

export function registerTrainingRoutes(ctx) {
  ctx.router.get(
    "/training/reflex",
    wrap(async request => {
      const user = account(request);
      const now = Date.now();
      return {
        ...(await ctx.store.reflexSummary(user.id, {
          now,
          offset: parseOffset(request.query.offset)
        })),
        teams: await ctx.assignedTo(user, now)
      };
    })
  );

  ctx.router.post(
    "/training/reflex/runs",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      const run = parseRun(request.body);
      const now = Date.now();
      if ((await ctx.store.reflexRunsSince(user.id, now - DAY)) >= MAX_RUNS_PER_DAY) {
        throw tooMany("That is a lot of training for one day: come back later.", 3600);
      }
      const before = await ctx.store.reflexExerciseStats(user.id, run.exercise);
      await ctx.store.addReflexRun(user.id, run, now);
      const exercise = exerciseOf(run.exercise);
      return {
        saved: true,
        exercise: {
          id: exercise.id,
          runs: before.runs + 1,
          previousBest: before.best,
          best: isBetter(exercise, run.score, before.best) ? run.score : before.best,
          isBest: isBetter(exercise, run.score, before.best)
        },
        teams: await ctx.assignedTo(user, now)
      };
    })
  );
}

const DAY = 86_400_000;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTrainingRoutes };
