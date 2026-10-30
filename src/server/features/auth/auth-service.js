import { unauthorized } from "../../platform/errors.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as authServiceSeed } from "./auth-service-seed.js";
import { onView as authServiceEnrolStart } from "./auth-service-enrol-start.js";
import { onView as authServiceAccount } from "./auth-service-account.js";
import { nextStep } from "./auth-service-seed.js";
export { normalizeEmail } from "./auth-service-seed.js";
export { cleanEmail } from "./auth-service-seed.js";

/**
 * Account sign-in with mandatory multi-factor authentication.
 *   first factor  : password (scrypt) or Google
 *   second factor : TOTP authenticator code, or a single-use recovery code
 * No full session exists until BOTH are done. The state in between is an `auth_challenges` row referenced by an
 * httpOnly cookie holding a random 256-bit token (stored hashed).
 */
export function createAuthService({ store, config, identity, secretBox }) {
  const ctx = { secretBox, store, identity, config };
  bindTo(ctx, authServiceSeed, authServiceEnrolStart, authServiceAccount);
  ctx.hashOptions = { log2N: ctx.config.scryptLog2N, pepper: ctx.config.passwordPepper };
  ctx.issuer = ctx.config.authIssuer;

  return {
    nextStep,
    beginSecondFactor: ctx.beginSecondFactor,

    register: ctx.register,

    login: ctx.login,

    challengeStatus: ctx.challengeStatus,

    completeProfile: ctx.completeProfile,

    enrolStart: ctx.enrolStart,

    enrolConfirm: ctx.enrolConfirm,

    verifySecondFactor: ctx.verifySecondFactor,

    requireFreshCode: ctx.requireFreshCode,

    overview: ctx.overview,

    profile: ctx.profile,

    renameSelf: ctx.renameSelf,

    uploadAvatar: ctx.uploadAvatar,

    chooseAvatar: ctx.chooseAvatar,

    changePassword: ctx.changePassword,

    regenerateRecoveryCodes: ctx.regenerateRecoveryCodes,

    signOutEverywhere: ctx.signOutEverywhere,

    exportData: ctx.exportData,

    deleteAccount: ctx.deleteAccount,

    logout: ctx.logout,

    unauthorized
  };
}
