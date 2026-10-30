// auth routes, small helpers: needUser.
import { unauthorized } from "../../platform/errors.js";

export const needUser = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to continue.");
  }
  return request.user;
};
