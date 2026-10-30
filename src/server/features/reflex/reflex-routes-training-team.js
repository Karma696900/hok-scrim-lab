// reflex routes, training team: member, staffOnly, registerTeamsRoutes2.
import { MAX_GOALS_PER_TEAM } from "../../../shared/reflex-model.js";
import {
  TRAINEE_ROLES,
  canAssignTraining,
  parseGoal,
  parseRankingQuery,
  periodWindow,
  rankPlayers
} from "./reflex-domain.js";
import { forbidden, notFound } from "../../platform/errors.js";
import { offsetMinutes } from "../community/community-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./reflex-routes-shared.js";

// ---- the training of a team ---------------------------------------------------------------------
/** A member of the team, with their role; 404 for an unknown team, 403 for somebody else. */
export async function member(ctx, request) {
  const user = account(request);
  const team = await ctx.store.getTeam(parseUuid(request.params.id, "team id"));
  if (!team) {
    throw notFound("Team not found.");
  }
  const me = team.members.find(entry => entry.userId === user.id);
  if (!me) {
    throw forbidden("Only the members of the team can see its training.");
  }
  return { user, team, role: me.role };
}

export const staffOnly = role => {
  if (!canAssignTraining(role)) {
    throw forbidden(
      "Only the owner, the managers and the coaches can set the training of the team."
    );
  }
};

export function registerTeamsRoutes2(ctx) {
  ctx.router.get(
    "/teams/:id/training/ranking",
    wrap(async request => {
      const { team, role } = await ctx.member(request);
      const settings = await ctx.store.getTrainingSettings(team.id);
      if (!canAssignTraining(role) && !settings.leaderboard) {
        throw forbidden("The staff has not opened the ranking to the players.");
      }
      const { exercise, period } = parseRankingQuery(request.query);
      const now = Date.now();
      const window =
        period === "week"
          ? periodWindow(now, offsetMinutes(team.timezone), "week")
          : { from: 0, to: now + 1 };
      const trainees = team.members.filter(entry => TRAINEE_ROLES.includes(entry.role));
      const scores = new Map(
        (
          await ctx.store.rankingScores(
            trainees.map(entry => entry.userId),
            exercise.id,
            window
          )
        ).map(entry => [entry.userId, entry])
      );
      return {
        exercise: exercise.id,
        period,
        rows: rankPlayers(
          exercise,
          trainees
            .filter(entry => scores.has(entry.userId))
            .map(entry => ({
              userId: entry.userId,
              name: entry.name,
              tag: entry.tag,
              picture: entry.picture,
              role: entry.role,
              best: scores.get(entry.userId).best,
              runs: scores.get(entry.userId).runs
            }))
        )
      };
    })
  );

  ctx.router.post(
    "/teams/:id/training/goals",
    ctx.limiters.write,
    wrap(async request => {
      const { user, team, role } = await ctx.member(request);
      staffOnly(role);
      return ctx.store.createTrainingGoal(
        team.id,
        parseGoal(request.body),
        user.id,
        MAX_GOALS_PER_TEAM
      );
    })
  );
  ctx.router.put(
    "/teams/:id/training/goals/:goalId",
    ctx.limiters.write,
    wrap(async request => {
      const { team, role } = await ctx.member(request);
      staffOnly(role);
      const goal = await ctx.store.updateTrainingGoal(
        team.id,
        parseUuid(request.params.goalId, "goal id"),
        parseGoal(request.body)
      );
      if (!goal) {
        throw notFound("Goal not found.");
      }
      return goal;
    })
  );
  ctx.router.delete(
    "/teams/:id/training/goals/:goalId",
    ctx.limiters.write,
    wrap(async request => {
      const { team, role } = await ctx.member(request);
      staffOnly(role);
      if (
        !(await ctx.store.deleteTrainingGoal(team.id, parseUuid(request.params.goalId, "goal id")))
      ) {
        throw notFound("Goal not found.");
      }
      return { removed: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { member, registerTeamsRoutes2 };
