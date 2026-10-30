// The pictures the application serves itself, all of them the same for everybody (they do not vary with the cookie or the
// language) and cacheable for good: Camp artwork resized, profile photos, team logos, training maps, catalogue pictures.
import { notFound } from "./platform/errors.js";
import { UUID_PATTERN } from "./platform/validation.js";
import {
  catalogImageVariant,
  createVariantCache,
  variantWidth
} from "./platform/images/catalog-image.js";
import { safeMediaUrl } from "./features/heroes/camp-data.js";
import { sameForEveryone } from "./platform/http/cache-control.js";

export function registerPictureRoutes(app, { store, limiters, imageProxy }) {
  // pictures are the same for everybody: they do not vary with the cookie or the language
  app.use(
    ["/media", "/avatars", "/team-logos", "/training-maps", "/catalog-images"],
    (_request, response, next) => {
      sameForEveryone(response);
      next();
    }
  );
  // Camp artwork, resized and re-encoded (see features/media/image-proxy.js). Public, read-only,
  // cacheable for a year.
  app.get("/media/img", limiters.media, async (request, response, next) => {
    try {
      const result = imageProxy ? await imageProxy.get(request.query.u, request.query.w) : null; // no proxy configured: the original is served
      if (result?.refused) {
        return next(notFound("Not found."));
      }
      if (!result) {
        const original = safeMediaUrl(String(request.query.u ?? ""));
        return original ? response.redirect(302, original) : next(notFound("Not found."));
      }
      response.set({
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: `"${result.key}"`,
        "Cross-Origin-Resource-Policy": "same-origin"
      });
      if (request.get("If-None-Match") === `"${result.key}"`) {
        return response.status(304).end();
      }
      response.send(result.body);
    } catch (error) {
      next(error);
    }
  });
  // Uploaded profile photos (already processed to a small WebP), public by the player's tag.
  app.get("/avatars/:tag", limiters.media, async (request, response, next) => {
    try {
      if (!/^[A-Z0-9]{6}$/.test(request.params.tag)) {
        return next(notFound("Not found."));
      }
      const avatar = await store.getAvatar(request.params.tag);
      if (!avatar) {
        return next(notFound("Not found."));
      }
      const etag = `"av-${request.params.tag}-${avatar.updatedAt}"`;
      response.set({
        "Content-Type": avatar.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Cross-Origin-Resource-Policy": "same-origin"
      });
      if (request.get("If-None-Match") === etag) {
        return response.status(304).end();
      }
      response.send(avatar.data);
    } catch (error) {
      next(error);
    }
  });
  registerStoredPictureRoutes(app, { store, limiters });
}

/** Stored Picture Routes: the second half of registerPictureRoutes. */
export function registerStoredPictureRoutes(app, { store, limiters }) {
  // Team logos (already processed to a small WebP). The version is part of the URL, so a new logo
  // is a new address.
  app.get("/team-logos/:id", limiters.media, async (request, response, next) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
        return next(notFound("Not found."));
      }
      const logo = await store.getTeamLogo(request.params.id);
      if (!logo) {
        return next(notFound("Not found."));
      }
      const etag = `"tl-${request.params.id}-${logo.updatedAt}"`;
      response.set({
        "Content-Type": logo.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Cross-Origin-Resource-Policy": "same-origin"
      });
      if (request.get("If-None-Match") === etag) {
        return response.status(304).end();
      }
      response.send(logo.data);
    } catch (error) {
      next(error);
    }
  });
  // Maps of the training area (already processed WebP). Their id changes with every upload, so they
  // can be cached for good.
  app.get("/training-maps/:id", limiters.media, async (request, response, next) => {
    try {
      if (!UUID_PATTERN.test(request.params.id)) {
        return next(notFound("Not found."));
      }
      const image = await store.getTrainingMapImage(request.params.id);
      if (!image) {
        return next(notFound("Not found."));
      }
      const etag = `"tm-${request.params.id}"`;
      response.set({
        "Content-Type": image.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Cross-Origin-Resource-Policy": "same-origin"
      });
      if (request.get("If-None-Match") === etag) {
        return response.status(304).end();
      }
      response.send(image.data);
    } catch (error) {
      next(error);
    }
  });

  const variants = createVariantCache();
  // Pictures of the catalogue (items and arcana), already processed to small WebP. Their id changes
  // whenever the picture does.
  app.get("/catalog-images/:id", limiters.media, async (request, response, next) => {
    try {
      if (!UUID_PATTERN.test(request.params.id)) {
        return next(notFound("Not found."));
      }
      const image = await store.getImage(request.params.id);
      if (!image) {
        return next(notFound("Not found."));
      }
      const width = variantWidth(request.query.w);
      const etag = `"ci-${request.params.id}${width ? `-${width}` : ""}"`;
      response.set({
        "Content-Type": image.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Cross-Origin-Resource-Policy": "same-origin"
      });
      if (request.get("If-None-Match") === etag) {
        return response.status(304).end();
      }
      response.send(
        width
          ? await variants.get(request.params.id, width, () =>
              catalogImageVariant(image.data, width)
            )
          : image.data
      );
    } catch (error) {
      next(error);
    }
  });
}
