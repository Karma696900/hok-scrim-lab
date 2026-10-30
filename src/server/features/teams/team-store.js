import { bindTo } from "../../../shared/bind-to.js";
import { onView as teamStoreParse } from "./team-store-parse.js";
import { onView as teamStoreSaveTeamLogo } from "./team-store-save-team-logo.js";
import { onView as teamStoreAgenda } from "./team-store-agenda.js";

/** Database access for teams, their rosters and invitations. */
export function createTeamStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, teamStoreParse, teamStoreSaveTeamLogo, teamStoreAgenda);

  /** The lanes the players of a team are set to, as one column (the game's own order). */
  ctx.rosterLanes =
    "(SELECT GROUP_CONCAT(DISTINCT x.lane ORDER BY FIELD(x.lane, 'Clash Lane', 'Jungle', 'Mid Lane', 'Farm Lane', 'Roamer')) FROM team_members x WHERE x.team_id = t.id AND x.lane IS NOT NULL) AS roster_lanes";

  ctx.memberSql =
    "SELECT m.user_id, m.role, m.lane, m.joined_at, u.name, u.tag, u.picture, (SELECT GROUP_CONCAT(l.label ORDER BY l.label) FROM user_labels l WHERE l.user_id = m.user_id) AS labels FROM team_members m JOIN users u ON u.id = m.user_id";
  ctx.roleOrder =
    "FIELD(m.role, 'owner', 'manager', 'coach', 'captain', 'analyst', 'player', 'sub')";

  return {
    listTeams: ctx.listTeams,

    getTeam: ctx.getTeam,

    teamsOfUser: ctx.teamsOfUser,

    roleOf: ctx.roleOf,

    createTeam: ctx.createTeam,

    updateTeam: ctx.updateTeam,

    saveTeamLogo: ctx.saveTeamLogo,

    removeTeamLogo: ctx.removeTeamLogo,

    getTeamLogo: ctx.getTeamLogo,

    deleteTeam: ctx.deleteTeam,

    findUserByTag: ctx.findUserByTag,

    invite: ctx.invite,

    invitationsOfTeam: ctx.invitationsOfTeam,

    invitationsOfUser: ctx.invitationsOfUser,

    cancelInvitation: ctx.cancelInvitation,

    answerInvitation: ctx.answerInvitation,

    listEvents: ctx.listEvents,

    createEvent: ctx.createEvent,

    updateEvent: ctx.updateEvent,

    deleteEvent: ctx.deleteEvent,

    setTeamMember: ctx.setTeamMember,

    removeTeamMember: ctx.removeTeamMember
  };
}
