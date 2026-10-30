import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as authRoutesAuthProfile } from "./auth-routes-auth-profile.js";
import { onView as authRoutesAuth } from "./auth-routes-auth.js";

/** Account endpoints: registration, password sign-in, second factor, enrolment, security settings. */
export function createAuthRouter({ auth, limiters, config }) {
  const ctx = { limiters, auth, config };
  bindTo(ctx, authRoutesAuthProfile, authRoutesAuth);
  ctx.router = Router();

  ctx.registerAuthProfileRoutes();

  ctx.registerAuthRoutes();

  return ctx.router;
}
