// training routes, notes: registerNotesRoutes.
import { MAP_IMAGE_MAX_BYTES, processMapImage } from "../../platform/images/map-image.js";
import { NOTE_KINDS, parseFocus, parseMapName, parseNote } from "./training-domain.js";
import express from "express";
import { notFound } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";
import { account } from "./training-routes-shared.js";

export function registerNotesRoutes(ctx) {
  // ---- focus heroes -----------------------------------------------------------------------------
  ctx.router.get(
    "/training/focus",
    wrap(async request => ({ heroIds: await ctx.store.getTrainingFocus(account(request).id) }))
  );
  ctx.router.put(
    "/training/focus",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      return {
        heroIds: await ctx.store.setTrainingFocus(
          user.id,
          parseFocus(request.body, await ctx.knownHeroIds())
        )
      };
    })
  );

  // ---- notebook ---------------------------------------------------------------------------------
  ctx.router.get(
    "/training/notes",
    wrap(async request => {
      const user = account(request);
      const kind =
        typeof request.query.kind === "string" && NOTE_KINDS.includes(request.query.kind)
          ? request.query.kind
          : null;
      const heroId =
        typeof request.query.heroId === "string" && request.query.heroId.length <= 80
          ? request.query.heroId
          : null;
      return { notes: await ctx.store.listTrainingNotes(user.id, { kind, heroId }) };
    })
  );
  ctx.router.post(
    "/training/notes",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      return ctx.store.createTrainingNote(
        user.id,
        parseNote(request.body, await ctx.knownHeroIds())
      );
    })
  );
  ctx.router.put(
    "/training/notes/:id",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      const note = await ctx.store.updateTrainingNote(
        user.id,
        parseUuid(request.params.id, "note id"),
        parseNote(request.body, await ctx.knownHeroIds())
      );
      if (!note) {
        throw notFound("Note not found.");
      }
      return note;
    })
  );
  ctx.router.delete(
    "/training/notes/:id",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      if (!(await ctx.store.deleteTrainingNote(user.id, parseUuid(request.params.id, "note id")))) {
        throw notFound("Note not found.");
      }
      return { deleted: true };
    })
  );

  // ---- maps -------------------------------------------------------------------------------------
  ctx.router.get(
    "/training/maps",
    wrap(async () => ({ maps: await ctx.store.listTrainingMaps() }))
  );
  // The picture is sent as the raw file with the name in the query; the answer is the map (its id
  // is the address of its picture).
  ctx.router.post(
    "/training/maps",
    ctx.limiters.write,
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: MAP_IMAGE_MAX_BYTES + 1024
    }),
    wrap(async request => {
      const user = requireAdmin(request);
      const name = parseMapName(request.query.name);
      const picture = await processMapImage(request.body, request.headers["content-type"]);
      return ctx.store.saveTrainingMap({
        name,
        mime: "image/webp",
        data: picture.data,
        width: picture.width,
        height: picture.height,
        createdBy: user.id
      });
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerNotesRoutes };
