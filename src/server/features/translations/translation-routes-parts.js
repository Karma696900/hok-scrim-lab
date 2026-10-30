// translation routes, small helpers: hashOf, languageOf.
import { badRequest, notFound } from "../../platform/errors.js";
import { isLanguage } from "../../../shared/i18n.js";

export const hashOf = request => {
  if (!HASH.test(request.params.hash ?? "")) {
    throw notFound("Text not found.");
  }
  return request.params.hash;
};

export const languageOf = value => {
  if (!isLanguage(value)) {
    throw badRequest("{label} must be a language of the site.", "invalid_body", {
      label: "language"
    });
  }
  return value;
};

const HASH = /^[0-9a-f]{64}$/;
