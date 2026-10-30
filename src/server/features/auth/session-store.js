import { bindTo } from "../../../shared/bind-to.js";
import { onView as sessionStoreParts } from "./session-store-parts.js";
export { USER_COLUMNS } from "./session-store-parts.js";
export { userFromRow } from "./session-store-parts.js";

/**
 * Database access for the people who use the site: Google accounts, guests and their sessions.
 * (Passwords and second factors: account-store.js.)
 */
export function createSessionStore({ pool, inTransaction, accounts }) {
  const ctx = { pool, accounts, inTransaction };
  bindTo(ctx, sessionStoreParts);

  return {
    upsertGoogleUser: ctx.upsertGoogleUser,
    createGuestUser: ctx.createGuestUser,
    getUserByEmail: ctx.getUserByEmail,
    getSession: ctx.getSession,
    createSession: ctx.createSession,
    refreshSession: ctx.refreshSession,
    deleteSession: ctx.deleteSession,
    purgeExpired: ctx.purgeExpired,
    mergeGuestInto: ctx.mergeGuestInto
  };
}
