import { badRequest } from "../errors.js";
import sharp, { PICTURE_KINDS, checkPicture, withPicture } from "./sharp-safe.js";

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_SIZE = 256;

/**
 * A profile photo, whatever the player sends: it is decoded (PNG, JPEG, WebP or the first frame of
 * a GIF only), turned upright, cropped to a square, scaled to 256 px and re-encoded as WebP without
 * any metadata. The original is never stored or served.
 */
export async function processAvatar(bytes, contentType) {
  checkPicture(bytes, contentType, {
    kinds: PICTURE_KINDS,
    maxBytes: AVATAR_MAX_BYTES,
    tooLarge: () => badRequest("This picture is too large (4 MB maximum).", "image_too_large")
  });
  return withPicture(bytes, { kinds: PICTURE_KINDS }, open =>
    open({ pages: 1 })
      .rotate()
      .resize({
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        fit: "cover",
        position: sharp.strategy.attention
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
  );
}
