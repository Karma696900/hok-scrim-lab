// auth routes, auth: registerAuthRoutes.
import { plainObject } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { needUser } from "./auth-routes-parts.js";
import { text } from "./auth-routes-shared.js";

export function registerAuthRoutes(ctx) {
  ctx.router.post(
    "/auth/mfa/enrol/confirm",
    ctx.limiters.mfa,
    wrap(async request =>
      ctx.auth.enrolConfirm(request, request.res, {
        code: text(plainObject(request.body), "code", 20)
      })
    )
  );
  ctx.router.post(
    "/auth/mfa/verify",
    ctx.limiters.mfa,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.verifySecondFactor(request, request.res, {
        code: text(body, "code", 20),
        recoveryCode: text(body, "recoveryCode", 40)
      });
    })
  );

  ctx.router.get(
    "/auth/security",
    wrap(async request => ctx.auth.overview(needUser(request).id))
  );

  ctx.router.post(
    "/auth/password",
    ctx.limiters.mfa,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.changePassword(request, needUser(request).id, {
        currentPassword: text(body, "currentPassword", 1100),
        newPassword: text(body, "newPassword", 400),
        code: text(body, "code", 20)
      });
    })
  );

  ctx.router.post(
    "/auth/recovery-codes",
    ctx.limiters.mfa,
    wrap(async request =>
      ctx.auth.regenerateRecoveryCodes(request, needUser(request).id, {
        code: text(plainObject(request.body), "code", 20)
      })
    )
  );
  ctx.router.post(
    "/auth/export",
    ctx.limiters.mfa,
    wrap(async request =>
      ctx.auth.exportData(request, needUser(request).id, {
        code: text(plainObject(request.body), "code", 20)
      })
    )
  );
  ctx.router.post(
    "/auth/delete-account",
    ctx.limiters.mfa,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.deleteAccount(request, needUser(request).id, {
        password: typeof body.password === "string" ? text(body, "password", 1100) : "",
        code: text(body, "code", 20)
      });
    })
  );
  ctx.router.post(
    "/auth/logout-all",
    ctx.limiters.mfa,
    wrap(async request => ctx.auth.signOutEverywhere(request, needUser(request).id))
  );

  ctx.router.get("/auth/config", (_request, response) =>
    response.json({
      registration: ctx.config.registrationEnabled,
      google: ctx.config.google.enabled
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAuthRoutes };
