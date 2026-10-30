// reflex routes, small helpers: assignedTo.
import { TRAINEE_ROLES, periodWindow } from "./reflex-domain.js";
import { offsetMinutes } from "../community/community-domain.js";

/** The goals of the teams a player trains with, with how far they are in each one. */
export async function assignedTo(ctx, user, now) {
  const result = [];
  for (const team of await ctx.store.teamsOfUser(user.id)) {
    if (!TRAINEE_ROLES.includes(team.myRole)) {
      continue;
    }
    const goals = await ctx.store.listTrainingGoals(team.id);
    if (!goals.length) {
      continue;
    }
    const offset = offsetMinutes(team.timezone);
    const progress = (await ctx.store.trainingProgress(goals, [user.id], offset, now)).get(user.id);
    result.push({
      team: { id: team.id, name: team.name, tag: team.tag },
      goals: goals.map(goal => ({
        ...goal,
        ...periodWindow(now, offset, goal.period),
        progress: progress[goal.id]
      }))
    });
  }
  return result;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { assignedTo };
