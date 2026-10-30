// What the page of a team asks the server for once it knows who looks at it: the agenda for everybody, the rest only
// for the people who may see it.
import { LEADERS, STAFF } from "./team-shared.js";

export async function loadTeamExtras({ api, training }, team, teamId) {
  const staff = STAFF.includes(team.myRole);
  const leader = LEADERS.includes(team.myRole);
  const id = encodeURIComponent(teamId);
  const [agenda, discord, trainingData, series, mySeries] = await Promise.all([
    api(`/api/teams/${id}/events`).catch(() => ({ items: [], canSchedule: false })),
    staff ? api(`/api/teams/${id}/discord`).catch(() => null) : null,
    team.myRole ? training.load(teamId) : null,
    team.myRole ? api(`/api/teams/${id}/series?pageSize=12`).catch(() => null) : null,
    leader ? api("/api/series?view=summary&pageSize=50").catch(() => null) : null
  ]);
  return { agenda, discord, trainingData, series, mySeries };
}
