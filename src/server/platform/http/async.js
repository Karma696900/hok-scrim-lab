import { forbidden, unauthorized } from "../errors.js";

/**
 * Wraps an async route. A returned value (not undefined) is sent as JSON; thrown errors reach the
 * global error handler, which never leaks internals.
 */
export const wrap = handler => (request, response, next) => {
  Promise.resolve(handler(request, response, next))
    .then(result => {
      if (result !== undefined && !response.headersSent) {
        response.json(result);
      }
    })
    .catch(next);
};

/**
 * Online features need a real account (password + MFA, or Google + MFA): a guest identity is not
 * enough.
 */
export function requireGoogleUser(request) {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use online drafts.");
  }
  return request.user;
}

export function requireAdmin(request) {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to continue.");
  }
  if (!request.user.isAdmin) {
    throw forbidden("This action is reserved to administrators.");
  }
  return request.user;
}

/** What the site itself shows: an administrator, or a person with the Contributor label. */
export function requireEditor(request) {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to continue.");
  }
  if (!request.user.isEditor) {
    throw forbidden("This action is reserved to administrators and contributors.");
  }
  return request.user;
}

/** Middleware for an address that writes what every visitor sees: `router.put(path, editorOnly, …)`. */
export function editorOnly(request, _response, next) {
  try {
    requireEditor(request);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware for a router whose every address is for administrators: `router.use("/admin",
 * adminOnly)`.
 */
export function adminOnly(request, _response, next) {
  try {
    requireAdmin(request);
    next();
  } catch (error) {
    next(error);
  }
}
