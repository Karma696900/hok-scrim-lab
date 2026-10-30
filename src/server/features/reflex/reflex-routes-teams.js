// reflex routes, teams: registerTeamsRoutes.
import { MAX_HERO_GOALS_PER_TEAM } from "../../../shared/combo-model.js";
import {
  TRAINEE_ROLES,
  canAssignTraining,
  parseHeroGoal,
  parseTrainingSettings,
  periodWindow
} from "./reflex-domain.js";
import { notFound } from "../../platform/errors.js";
import { offsetMinutes } from "../community/community-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./reflex-routes-shared.js";
import { staffOnly } from "./reflex-routes-training-team.js";

export function registerTeamsRoutes(ctx) {
  ctx.router.get(
    "/teams/:id/training",
    wrap(async request => {
      const { user, team, role } = await ctx.member(request);
      const now = Date.now();
      const offset = offsetMinutes(team.timezone);
      const goals = await ctx.store.listTrainingGoals(team.id);
      const trainees = team.members.filter(entry => TRAINEE_ROLES.includes(entry.role));
      // the staff sees every player; a player sees their own line only
      const shown = canAssignTraining(role)
        ? trainees
        : trainees.filter(entry => entry.userId === user.id);
      const progress = await ctx.store.trainingProgress(
        goals,
        shown.map(entry => entry.userId),
        offset,
        now
      );
      const settings = await ctx.store.getTrainingSettings(team.id);
      const heroGoals = await ctx.store.listHeroGoals(team.id);
      const heroProgress = await ctx.store.heroGoalProgress(
        heroGoals,
        shown.map(entry => entry.userId)
      );
      const targets = new Map();
      for (const goal of heroGoals) {
        targets.set(goal.heroId, (await ctx.store.listCombos(goal.heroId)).length);
      }
      return {
        canAssign: canAssignTraining(role),
        // for the form of the staff: the heroes that have combos, and how many
        heroesWithCombos: canAssignTraining(role) ? await ctx.store.comboCounts() : {},
        heroGoals: heroGoals.map(goal => ({ ...goal, target: targets.get(goal.heroId) ?? 0 })),
        // the staff always sees the ranking; the players when the staff opened it to them
        settings,
        canSeeRanking: canAssignTraining(role) || settings.leaderboard,
        timezone: team.timezone || "UTC",
        goals: goals.map(goal => ({ ...goal, ...periodWindow(now, offset, goal.period) })),
        players: shown.map(entry => ({
          userId: entry.userId,
          name: entry.name,
          tag: entry.tag,
          picture: entry.picture,
          role: entry.role,
          progress: progress.get(entry.userId),
          heroProgress: heroProgress.get(entry.userId)
        }))
      };
    })
  );

  ctx.router.put(
    "/teams/:id/training/settings",
    ctx.limiters.write,
    wrap(async request => {
      const { team, role } = await ctx.member(request);
      staffOnly(role);
      return ctx.store.saveTrainingSettings(team.id, parseTrainingSettings(request.body));
    })
  );

  ctx.router.post(
    "/teams/:id/training/hero-goals",
    ctx.limiters.write,
    wrap(async request => {
      const { user, team, role } = await ctx.member(request);
      staffOnly(role);
      const known = new Set(
        (await ctx.store.readHeroes())
          .filter(hero => hero.availableGlobal !== false)
          .map(hero => hero.id)
      );
      return ctx.store.createHeroGoal(
        team.id,
        parseHeroGoal(request.body, known),
        user.id,
        MAX_HERO_GOALS_PER_TEAM
      );
    })
  );
  ctx.router.delete(
    "/teams/:id/training/hero-goals/:goalId",
    ctx.limiters.write,
    wrap(async request => {
      const { team, role } = await ctx.member(request);
      staffOnly(role);
      if (!(await ctx.store.deleteHeroGoal(team.id, parseUuid(request.params.goalId, "goal id")))) {
        throw notFound("Goal not found.");
      }
      return { removed: true };
    })
  );

  /** What the teams of a player ask them about heroes, with how far they are (their own line only). */
  ctx.router.get(
    "/training/assigned",
    wrap(async request => {
      const user = account(request);
      const teams = [];
      for (const team of await ctx.store.teamsOfUser(user.id)) {
        if (!TRAINEE_ROLES.includes(team.myRole)) {
          continue;
        }
        const goals = await ctx.store.listHeroGoals(team.id);
        if (!goals.length) {
          continue;
        }
        const progress = (await ctx.store.heroGoalProgress(goals, [user.id])).get(user.id);
        teams.push({
          team: { id: team.id, name: team.name, tag: team.tag },
          heroGoals: goals.map(goal => ({ ...goal, progress: progress[goal.id] }))
        });
      }
      return { teams };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsRoutes };
