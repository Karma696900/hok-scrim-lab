import { bindTo } from "../../../shared/bind-to.js";
import { onView as reflexStoreRuns } from "./reflex-store-runs.js";
import { onView as reflexStoreStaffDecided } from "./reflex-store-staff-decided.js";
import { onView as reflexStoreTeamAsks } from "./reflex-store-team-asks.js";

/** Database access for the runs of the reflex exercises and for what teams ask of their players. */
export function createReflexStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, reflexStoreRuns, reflexStoreStaffDecided, reflexStoreTeamAsks);

  return {
    addReflexRun: ctx.addReflexRun,
    reflexRunsSince: ctx.reflexRunsSince,
    reflexExerciseStats: ctx.reflexExerciseStats,
    reflexSummary: ctx.reflexSummary,

    getTrainingSettings: ctx.getTrainingSettings,
    saveTrainingSettings: ctx.saveTrainingSettings,
    rankingScores: ctx.rankingScores,

    listTrainingGoals: ctx.listTrainingGoals,
    createTrainingGoal: ctx.createTrainingGoal,
    updateTrainingGoal: ctx.updateTrainingGoal,
    deleteTrainingGoal: ctx.deleteTrainingGoal,
    trainingProgress: ctx.trainingProgress
  };
}
