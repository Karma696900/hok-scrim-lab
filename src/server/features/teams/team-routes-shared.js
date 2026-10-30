import { unauthorized } from "../../platform/errors.js";

export const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use teams.");
  }
  return request.user;
};
