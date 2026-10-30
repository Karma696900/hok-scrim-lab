import { bindTo } from "../../../shared/bind-to.js";
import { onView as comboStoreParts } from "./combo-store-parts.js";
import { onView as comboStoreTeamAsks } from "./combo-store-team-asks.js";
import { onView as comboStorePlayerHas } from "./combo-store-player-has.js";
import { onView as comboStoreDailyCheck } from "./combo-store-daily-check.js";

/** Database access for the combos of the heroes and for what each player has acquired of them. */
export function createComboStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, comboStoreParts, comboStoreTeamAsks, comboStorePlayerHas, comboStoreDailyCheck);

  return {
    comboCounts: ctx.comboCounts,
    listCombos: ctx.listCombos,
    createCombo: ctx.createCombo,
    updateCombo: ctx.updateCombo,
    deleteCombo: ctx.deleteCombo,
    comboIds: ctx.comboIds,
    reorderCombos: ctx.reorderCombos,

    listHeroGoals: ctx.listHeroGoals,
    createHeroGoal: ctx.createHeroGoal,
    deleteHeroGoal: ctx.deleteHeroGoal,
    heroGoalProgress: ctx.heroGoalProgress,

    comboProgress: ctx.comboProgress,
    setComboProgress: ctx.setComboProgress,
    dueReviews: ctx.dueReviews,
    combosToLearn: ctx.combosToLearn,
    answerReview: ctx.answerReview,
    comboExists: ctx.comboExists
  };
}
