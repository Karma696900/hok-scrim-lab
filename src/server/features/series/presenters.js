import { describeViewer } from "./policy.js";

/**
 * Classic, online: until the draft is over nobody sees the other side's picks. Each player gets their own picks, a spectator gets none;
 * the others come as a count only (draft.hiddenPicks), and the log of actions loses their heroes. A copy: the stored series is untouched.
 */
function hideOpponentPicks(series, ctx) {
  const game = series.currentGame;
  if (series.gameMode !== "classic" || !ctx.online || !game || game.draft.phase !== "draft") {
    return series;
  }
  const own = ctx.side === "A" ? series.teamA.name : ctx.side === "B" ? series.teamB.name : null;
  const draft = structuredClone(game.draft);
  draft.hiddenPicks = {};
  for (const side of ["blue", "red"]) {
    if ((side === "blue" ? game.blueTeam : game.redTeam) === own) {
      continue;
    }
    draft.hiddenPicks[side] = draft.picks[side].length;
    draft.picks[side] = [];
    draft.pickAssignments[side] = [];
    draft.actions = draft.actions.map(action =>
      action.team === side && action.action === "pick"
        ? {
            team: action.team,
            action: action.action,
            completedAt: action.completedAt,
            ...(action.timedOut ? { timedOut: true } : {})
          }
        : action
    );
  }
  return { ...series, currentGame: { ...game, draft } };
}

/** Public shape of a series: stored blob + access info. Nothing here is persisted. */
export function presentSeries(stored, ctx, now = Date.now()) {
  const series = hideOpponentPicks(stored, ctx);
  const output = { ...series, version: ctx.version, serverTime: now, viewer: describeViewer(ctx) };
  if (ctx.online) {
    output.online = {
      // Only the creator needs the (still unused) invitation code.
      ...(ctx.role === "owner" ? { invitationCode: ctx.online.invitationCode } : {}),
      teamAUserId: ctx.online.teamAUserId,
      teamBUserId: ctx.online.teamBUserId,
      teamAUser: ctx.online.teamAUser,
      teamBUser: ctx.online.teamBUser
    };
  }
  return output;
}

export function presentUser(user) {
  if (!user || user.isGuest) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    tag: user.tag ?? "",
    email: user.email,
    picture: user.picture,
    avatarKind: user.avatarKind ?? "none",
    hasGooglePhoto: Boolean(user.hasGooglePhoto),
    isAdmin: Boolean(user.isAdmin),
    isEditor: Boolean(user.isEditor),
    viaGoogle: Boolean(user.viaGoogle),
    emailVerified: Boolean(user.emailVerified),
    mfa: Boolean(user.mfaEnabled)
  };
}
