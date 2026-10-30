// translation routes, translations: registerTranslationsRoutes, registerTranslationEditsRoutes.
import { adminOnly, wrap } from "../../platform/http/async.js";
import { badRequest, notFound } from "../../platform/errors.js";
import { cleanManual } from "./translation-domain.js";
import { isLanguage } from "../../../shared/i18n.js";
import { hashOf, languageOf } from "./translation-routes-parts.js";

export function registerTranslationsRoutes(ctx) {
  // ---- everybody: the words of the visitor's language ---------------------------------------------
  ctx.router.get(
    "/content-translations",
    wrap(async (request, response) => {
      const language = isLanguage(request.query.lang) ? request.query.lang : request.language;
      // somebody reads the site in this language: it is translated from now on (nothing waits for it)
      void ctx.translations.want(language).catch(() => {});
      const version = await ctx.store.contentVersion(language);
      const etag = `"ct-${language}-${version}"`;
      // public and cheap to check: the browser asks again each time and is told when nothing changed
      response.set({ "Cache-Control": "no-cache", ETag: etag });
      if (request.get("If-None-Match") === etag) {
        response.status(304).end();
        return undefined;
      }
      return { language, version, texts: await ctx.store.contentDictionary(language) };
    })
  );

  // ---- administrators ---------------------------------------------------------------------------------
  ctx.router.use("/admin/translations", adminOnly);
  ctx.router.get(
    "/admin/translations/status",
    wrap(async () => ctx.translations.status())
  );
  ctx.router.get(
    "/admin/translations/texts",
    wrap(async request => {
      const language = languageOf(request.query.language ?? request.language);
      const state = STATES.includes(request.query.state) ? request.query.state : "";
      const search =
        typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
      const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
      const { rows, total } = await ctx.store.contentList({
        language,
        state,
        search,
        offset: (page - 1) * PAGE,
        limit: PAGE
      });
      return { language, page, pageSize: PAGE, total, rows };
    })
  );
  registerTranslationEditsRoutes(ctx);
}

/** Translation Edits Routes: the second half of registerTranslationsRoutes. */
export function registerTranslationEditsRoutes(ctx) {
  ctx.router.put(
    "/admin/translations/:hash/:language",
    ctx.limiters.write,
    wrap(async request => {
      const text = cleanManual(request.body?.text);
      if (!text) {
        throw badRequest("The translation must be a text.", "invalid_body");
      }
      if (
        !(await ctx.store.contentSetManual(
          hashOf(request),
          languageOf(request.params.language),
          text,
          Date.now()
        ))
      ) {
        throw notFound("Text not found.");
      }
      ctx.translations.changed();
      return { saved: true };
    })
  );
  ctx.router.delete(
    "/admin/translations/:hash/:language",
    ctx.limiters.write,
    wrap(async request => {
      if (
        !(await ctx.store.contentReset(
          hashOf(request),
          languageOf(request.params.language),
          Date.now()
        ))
      ) {
        throw notFound("Text not found.");
      }
      ctx.translations.changed();
      ctx.translations.kick();
      return { reset: true };
    })
  );
  ctx.router.post(
    "/admin/translations/:hash/keep",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.contentKeep(hashOf(request), Date.now()))) {
        throw notFound("Text not found.");
      }
      ctx.translations.changed();
      return { kept: true };
    })
  );
  ctx.router.post(
    "/admin/translations/retry",
    ctx.limiters.write,
    wrap(async request => {
      const language =
        request.body?.language === undefined ? null : languageOf(request.body.language);
      const count = await ctx.store.contentRetry(language, Date.now());
      ctx.translations.resume();
      ctx.translations.kick(0);
      return { retried: count };
    })
  );
  // Asks for a language (`{ language }`) or for all of them (`{ all: true }`): the texts are then
  // translated into it from the next round.
  ctx.router.post(
    "/admin/translations/languages",
    ctx.limiters.write,
    wrap(async request => {
      const added =
        request.body?.all === true
          ? await ctx.translations.wantAll()
          : Number(await ctx.translations.want(languageOf(request.body?.language)));
      ctx.translations.kick(0);
      return { added };
    })
  );
  ctx.router.post(
    "/admin/translations/sweep",
    ctx.limiters.write,
    wrap(async () => {
      ctx.translations.resume();
      void ctx.translations.sweep();
      return { started: true };
    })
  );
}

const PAGE = 50;

const STATES = ["", "failed", "pending", "manual", "machine"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTranslationsRoutes };
