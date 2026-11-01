// Server side of the translations: every catalog of src/public/locales is loaded at start-up (a few
// hundred short strings each).
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WEB } from "./http/web-root.js";
import {
  chooseLanguage,
  createTranslator,
  isLanguage,
  LANGUAGE_COOKIE,
  readCookie
} from "../../shared/i18n.js";

const LOCALES_DIRECTORY = path.join(WEB.public, "locales");

const catalogs = new Map();
for (const file of readdirSync(LOCALES_DIRECTORY)) {
  const code = file.replace(/\.js$/, "");
  if (file.endsWith(".js") && isLanguage(code)) {
    catalogs.set(
      code,
      (await import(pathToFileURL(path.join(LOCALES_DIRECTORY, file)).href)).default
    );
  }
}

const translators = new Map();
/** tr(language, "English source text", { params }) */
export function tr(language, key, params) {
  let translate = translators.get(language);
  if (!translate) {
    translate = createTranslator(language, catalogs.get(language) ?? {});
    translators.set(language, translate);
  }
  return translate(key, params);
}

/**
 * The language of a request: the one its address names (/fr/heroes, see app.js), else the saved choice
 * (cookie), else Accept-Language, else English.
 */
export function requestLanguage(request) {
  if (request.addressLanguage) {
    return request.addressLanguage;
  }
  return chooseLanguage({
    saved: readCookie(request.headers.cookie, LANGUAGE_COOKIE),
    acceptLanguage: request.headers["accept-language"]
  });
}
