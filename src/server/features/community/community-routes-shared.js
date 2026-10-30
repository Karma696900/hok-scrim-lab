import { unauthorized } from "../../platform/errors.js";

export const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use the community features.");
  }
  return request.user;
};

export const instantQuery = (query, key) => {
  if (query[key] === undefined || query[key] === "") {
    return null;
  }
  const value = Number(query[key]);
  return Number.isFinite(value) ? value : null;
};
