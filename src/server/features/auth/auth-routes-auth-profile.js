// auth routes, auth profile: registerAuthProfileRoutes.
import express from "express";
import { plainObject } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { needUser } from "./auth-routes-parts.js";
import { text } from "./auth-routes-shared.js";

export function registerAuthProfileRoutes(ctx) {
  ctx.router.get(
    "/auth/challenge",
    wrap(request => ctx.auth.challengeStatus(request, request.res))
  );

  ctx.router.post(
    "/auth/register",
    ctx.limiters.register,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.register(request, request.res, {
        email: text(body, "email", 320),
        name: text(body, "name", 200),
        password: text(body, "password", 400)
      });
    })
  );

  ctx.router.post(
    "/auth/login",
    ctx.limiters.login,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.login(request, request.res, {
        email: text(body, "email", 320),
        password: text(body, "password", 1100)
      });
    })
  );

  ctx.router.post(
    "/auth/profile/complete",
    ctx.limiters.register,
    wrap(async request => {
      const body = plainObject(request.body);
      return ctx.auth.completeProfile(request, request.res, {
        name: text(body, "name", 200),
        password: text(body, "password", 400),
        confirm: text(body, "confirm", 400)
      });
    })
  );

  // The profile of the signed-in player: pseudo, photo. (The tag is fixed: it is never accepted
  // here.)
  ctx.router.get(
    "/profile",
    wrap(async request => ctx.auth.profile(needUser(request).id))
  );
  ctx.router.patch(
    "/profile",
    ctx.limiters.write,
    wrap(async request =>
      ctx.auth.renameSelf(request, needUser(request).id, {
        name: text(plainObject(request.body), "name", 200)
      })
    )
  );
  ctx.router.put(
    "/profile/avatar",
    ctx.limiters.write,
    wrap(async request =>
      ctx.auth.chooseAvatar(request, needUser(request).id, {
        kind: text(plainObject(request.body), "kind", 10)
      })
    )
  );
  ctx.router.post(
    "/profile/avatar",
    ctx.limiters.write,
    express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/gif"], limit: "5mb" }),
    wrap(async request =>
      ctx.auth.uploadAvatar(request, needUser(request).id, {
        bytes: request.body,
        contentType: request.headers["content-type"]
      })
    )
  );

  ctx.router.post(
    "/auth/mfa/enrol/start",
    ctx.limiters.mfa,
    wrap(request => ctx.auth.enrolStart(request, request.res))
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAuthProfileRoutes };
