import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as teamRoutesParts } from "./team-routes-parts.js";
import { onView as teamRoutesTeamsMe } from "./team-routes-teams-me.js";
import { onView as teamRoutesTeams } from "./team-routes-teams.js";
import { onView as teamRoutesTeamsInvitations } from "./team-routes-teams-invitations.js";
import { onView as teamRoutesAgendaTeam } from "./team-routes-agenda-team.js";

/**
 * Teams and rosters. Everybody can browse teams (no account); creating a team, inviting and
 * answering an invitation need an account. The owner and the managers run the roster; nobody is
 * added without answering an invitation.
 */
export function createTeamRouter({ store, limiters, notifier }) {
  const ctx = { store, limiters, notifier };
  bindTo(
    ctx,
    teamRoutesParts,
    teamRoutesTeamsMe,
    teamRoutesTeams,
    teamRoutesTeamsInvitations,
    teamRoutesAgendaTeam
  );
  ctx.router = Router();

  ctx.registerTeamsMeRoutes();

  ctx.registerTeamsRoutes();

  ctx.registerTeamsInvitationsRoutes();

  ctx.registerTeamsRoutes2();

  return ctx.router;
}
