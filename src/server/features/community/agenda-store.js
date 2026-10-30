import { bindTo } from "../../../shared/bind-to.js";
import { onView as agendaStoreAgendaExtras } from "./agenda-store-agenda-extras.js";

/** Answers to team events, the agenda of a person and the reminders that are due. */
export function createAgendaStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, agendaStoreAgendaExtras);

  return {
    setRsvp: ctx.setRsvp,

    rsvpsFor: ctx.rsvpsFor,

    agendaOfUser: ctx.agendaOfUser,

    dueReminders: ctx.dueReminders
  };
}
