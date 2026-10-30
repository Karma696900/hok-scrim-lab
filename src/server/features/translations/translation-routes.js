import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as translationRoutesTranslations } from "./translation-routes-translations.js";

/**
 * The translated texts. Everybody reads the dictionary of their language (what the pages need to show
 * what the staff wrote in the visitor's language); only administrators see the state of the
 * translation, correct a translation, keep a text as typed, or ask for another round.
 */
export function createTranslationRouter({ store, translations, limiters }) {
  const ctx = { limiters, translations, store };
  bindTo(ctx, translationRoutesTranslations);
  ctx.router = Router();

  ctx.registerTranslationsRoutes();

  return ctx.router;
}
