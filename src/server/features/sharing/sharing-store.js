import { bindTo } from "../../../shared/bind-to.js";
import { onView as sharingStoreParts } from "./sharing-store-parts.js";

/**
 * Database access for what is shared (invitations, members), the limits on what a person can own,
 * and the claim of orphaned data.
 */
export function createSharingStore({ pool, inTransaction, quotas = {} }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, sharingStoreParts);
  ctx.limits = {
    guestSeries: 100,
    userSeries: 2000,
    guestTierLists: 30,
    userTierLists: 300,
    ...quotas
  };

  ctx.store = {
    countOwned: ctx.countOwned,
    assertQuota: ctx.assertQuota,

    createInvite: ctx.createInvite,
    acceptInvite: ctx.acceptInvite,
    listSharing: ctx.listSharing,
    revokeInvite: ctx.revokeInvite,
    removeMember: ctx.removeMember,

    countOrphans: ctx.countOrphans,
    claimOrphans: ctx.claimOrphans
  };
  return ctx.store;
}
