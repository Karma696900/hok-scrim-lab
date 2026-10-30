import { badRequest } from "../errors.js";
import sharp, { PICTURE_KINDS, checkPicture, withPicture } from "./sharp-safe.js";

export const CATALOG_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** The longest side kept. Pictures used to be shrunk to 128 px, which is soft on a sharp screen. */
export const CATALOG_IMAGE_SIZE = 256;
/** The sizes a page can ask for: a list draws 26 to 64 px, the details of a piece up to 128 px. */
export const CATALOG_IMAGE_WIDTHS = [64, 128, 256];
/** An arcana drawn smaller than this is made this big: a small badge is soft on a sharp screen. */
const ARCANA_MIN_SIZE = 128;

/**
 * The picture of an item or an arcana: decoded (PNG, JPEG, WebP, or the first frame of a GIF),
 * turned upright, fitted inside 256 × 256 without cropping (transparency kept, never made bigger)
 * and re-encoded as WebP without metadata, at a quality the eye does not tell from the original. An
 * arcana (`kind: "arcana"`) that was drawn smaller than 128 px is made 128 px with Lanczos
 * resampling and a light sharpening: this makes the badge as crisp as a small picture can be, it
 * does not add detail that was never drawn. The original is never stored or served.
 */
export async function processCatalogImage(bytes, contentType, { kind = "item" } = {}) {
  checkPicture(bytes, contentType, {
    kinds: PICTURE_KINDS,
    maxBytes: CATALOG_IMAGE_MAX_BYTES,
    tooLarge: () => badRequest("This picture is too large (3 MB maximum).", "image_too_large")
  });
  return withPicture(bytes, { kinds: PICTURE_KINDS }, (open, meta) => {
    const upright = open({ pages: 1 }).rotate();
    const bigger = kind === "arcana" && Math.max(meta.width, meta.height) < ARCANA_MIN_SIZE;
    const sized = bigger
      ? upright
          .resize({
            width: ARCANA_MIN_SIZE,
            height: ARCANA_MIN_SIZE,
            fit: "inside",
            kernel: "lanczos3"
          })
          .sharpen({ sigma: 0.6, m1: 0.6, m2: 1.2 })
      : upright.resize({
          width: CATALOG_IMAGE_SIZE,
          height: CATALOG_IMAGE_SIZE,
          fit: "inside",
          withoutEnlargement: true,
          kernel: "lanczos3"
        });
    return sized
      .webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 5 })
      .toBuffer();
  });
}

/** The width a page asked for (the `w` of the address) when it is one that exists, else null. */
export function variantWidth(value) {
  if (typeof value !== "string") {
    return null;
  }
  const width = Number(value);
  return CATALOG_IMAGE_WIDTHS.includes(width) && String(width) === value ? width : null;
}

/**
 * A smaller copy of a stored picture (the picture itself when it is not bigger than the width), so
 * that a list of fifty items does not download fifty pictures made for a close-up.
 */
export async function catalogImageVariant(bytes, width) {
  const meta = await sharp(bytes).metadata();
  if (!width || Math.max(meta.width ?? 0, meta.height ?? 0) <= width) {
    return bytes;
  }
  return sharp(bytes)
    .resize({ width, height: width, fit: "inside", kernel: "lanczos3" })
    .webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 4 })
    .toBuffer();
}

/** The smaller copies made lately, kept in memory: the least recently asked for goes first. */
export function createVariantCache({ max = 500 } = {}) {
  const entries = new Map();
  return {
    get(id, width, make) {
      const key = `${id}:${width}`;
      if (entries.has(key)) {
        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
        return value;
      }
      const value = make();
      entries.set(key, value);
      value.catch(() => entries.delete(key));
      if (entries.size > max) {
        entries.delete(entries.keys().next().value);
      }
      return value;
    }
  };
}
