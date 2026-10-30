import { forbidden } from "../../platform/errors.js";

// Who may do what on a series. `ctx` comes from the store: { role, side, online }.
//   role: "owner" | "editor" | "viewer"   (membership, from the owner column / *_members)
//   side: "A" | "B" | null                (online series only: which player the viewer is)
//
// Local series: owner and editors drive everything, viewers only read. Online series (rules
// deliberately explicit):
//   start next game, record result, edit duration .... creator (team A) only
//   ready check, draft timer advance, game timers .... either participant
//   pick/ban ........................................ the participant whose side is on turn
//   delete, share ................................... creator only (share = read-only spectators)
const CREATOR_ONLY_ONLINE = new Set(["startGame", "complete", "duration", "editDraft"]);
const PARTICIPANT_ONLINE = new Set(["ready", "advance", "timer", "action"]);

export function assertSeriesPermission(ctx, operation, { actingSide = null } = {}) {
  if (operation === "delete" || operation === "share") {
    if (ctx.role !== "owner") {
      throw forbidden("Only the creator can do this.");
    }
    return;
  }
  if (!ctx.online) {
    if (ctx.role !== "owner" && ctx.role !== "editor") {
      throw forbidden("You can only view this series.");
    }
    return;
  }
  if (CREATOR_ONLY_ONLINE.has(operation)) {
    if (ctx.role !== "owner") {
      throw forbidden("Only the creator of this online series can do this.");
    }
    return;
  }
  if (PARTICIPANT_ONLINE.has(operation)) {
    if (!ctx.side) {
      throw forbidden("You are not a participant in this online series.");
    }
    if (operation === "action" && actingSide !== ctx.side) {
      throw forbidden("Only the player for the current side can submit this action.");
    }
    return;
  }
  throw forbidden();
}

/** Capabilities shown to the client so it can hide buttons. The server still enforces everything. */
export function describeViewer(ctx) {
  const can = operation => {
    try {
      assertSeriesPermission(ctx, operation, { actingSide: ctx.side });
      return true;
    } catch {
      return false;
    }
  };
  return {
    role: ctx.role,
    side: ctx.side,
    canDrive: can("startGame") || can("ready"),
    canRecordResult: can("complete"),
    canDelete: can("delete"),
    canShare: can("share")
  };
}
