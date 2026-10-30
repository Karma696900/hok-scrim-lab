import { bindTo } from "../../../shared/bind-to.js";
import { onView as accountStoreCreateLocalUser } from "./account-store-create-local-user.js";
import { onView as accountStoreCreateChallenge } from "./account-store-create-challenge.js";

/**
 * Database access for accounts, MFA, challenges and the security journal. Built on the store's pool
 * and transaction helper (see platform/database/store.js). Nothing here ever receives or returns a
 * plaintext secret.
 */
export function createAccountStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, accountStoreCreateLocalUser, accountStoreCreateChallenge);

  return {
    createLocalUser: ctx.createLocalUser,

    getProfile: ctx.getProfile,

    completeProfile: ctx.completeProfile,

    updateName: ctx.updateName,

    setAvatar: ctx.setAvatar,

    getAvatar: ctx.getAvatar,

    getLoginUser: ctx.getLoginUser,

    getAuthUser: ctx.getAuthUser,

    recordLoginFailure: ctx.recordLoginFailure,

    clearLoginFailures: ctx.clearLoginFailures,

    setPassword: ctx.setPassword,

    enableMfa: ctx.enableMfa,

    acceptMfaStep: ctx.acceptMfaStep,

    replaceRecoveryCodes: ctx.replaceRecoveryCodes,

    consumeRecoveryCode: ctx.consumeRecoveryCode,

    countRecoveryCodes: ctx.countRecoveryCodes,

    createChallenge: ctx.createChallenge,

    getChallenge: ctx.getChallenge,

    bumpChallengeAttempts: ctx.bumpChallengeAttempts,

    setChallengeSecret: ctx.setChallengeSecret,

    deleteChallenge: ctx.deleteChallenge,

    deleteSessionsForUser: ctx.deleteSessionsForUser,

    logAuthEvent: ctx.logAuthEvent,

    recentAuthEvents: ctx.recentAuthEvents,

    purgeAuth: ctx.purgeAuth
  };
}
