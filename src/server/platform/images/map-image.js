import { badRequest } from "../errors.js";
import { STILL_KINDS, checkPicture, withPicture } from "./sharp-safe.js";

export const MAP_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const MAP_IMAGE_MAX_SIDE = 2048;

/**
 * The picture of a map: decoded (PNG, JPEG or WebP), turned upright, shrunk to at most 2048 px on
 * its longest side (never enlarged, never cropped, so positions given as shares of its width and
 * height stay exact) and re-encoded as WebP without metadata. The original is never stored or
 * served.
 */
export async function processMapImage(bytes, contentType) {
  checkPicture(bytes, contentType, {
    kinds: STILL_KINDS,
    maxBytes: MAP_IMAGE_MAX_BYTES,
    tooLarge: () => badRequest("This picture is too large (12 MB maximum).", "image_too_large")
  });
  return withPicture(bytes, { kinds: STILL_KINDS, limitInputPixels: 80_000_000 }, async open => {
    const { data, info } = await open()
      .rotate()
      .resize({
        width: MAP_IMAGE_MAX_SIDE,
        height: MAP_IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 86, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  });
}
