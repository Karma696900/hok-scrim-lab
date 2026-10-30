import sharp from "sharp";
import { badRequest } from "../errors.js";

// Defence in depth: libvips can read dozens of formats (HEIF, SVG, PDF...); only the four we accept
// stay enabled, whatever a file claims to be. Callers also check the type they were given: that is
// the first gate, this is the second.
sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({
  operation: [
    "VipsForeignLoadPng",
    "VipsForeignLoadJpeg",
    "VipsForeignLoadWebp",
    "VipsForeignLoadNsgif",
    "VipsForeignLoadPngFile",
    "VipsForeignLoadPngBuffer",
    "VipsForeignLoadJpegFile",
    "VipsForeignLoadJpegBuffer",
    "VipsForeignLoadWebpFile",
    "VipsForeignLoadWebpBuffer",
    "VipsForeignLoadNsgifFile",
    "VipsForeignLoadNsgifBuffer"
  ]
});

// libvips keeps decoded pictures and a pool of threads for the next request: on a small machine that is memory that nobody asked
// for. A small cache (the pictures of the catalogue and of the portraits are few and small) and two threads cost no visible time.
sharp.cache({ memory: 32, files: 0, items: 64 });
sharp.concurrency(2);

export default sharp;

/** What the uploads of pictures accept: the kinds of file, with the GIF or without it. */
export const PICTURE_KINDS = ["png", "jpeg", "webp", "gif"];
export const STILL_KINDS = ["png", "jpeg", "webp"];

/**
 * The checks every uploaded picture goes through, in the order a person can fix them: the type the browser announced,
 * that there is something, and that it is not too big (`tooLarge` makes the error, with a literal message, so that it
 * is translated).
 */
export function checkPicture(bytes, contentType, { kinds, maxBytes, tooLarge }) {
  const type = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!kinds.some(kind => type === `image/${kind}`)) {
    throw kinds.includes("gif")
      ? badRequest("Choose a PNG, JPEG, WebP or GIF picture.", "invalid_image")
      : badRequest("Choose a PNG, JPEG or WebP picture.", "invalid_image");
  }
  if (!Buffer.isBuffer(bytes) || !bytes.length) {
    throw badRequest("Choose a picture first.", "invalid_image");
  }
  if (bytes.length > maxBytes) {
    throw tooLarge();
  }
}

/**
 * Decodes the bytes (the real format is read from the file, not trusted from the type) and hands the work to
 * `work(open, meta)`: `open(extra)` is a sharp reader with the same limits. Anything that goes wrong while reading
 * is "not a usable picture".
 */
export async function withPicture(bytes, { kinds, limitInputPixels = 40_000_000 }, work) {
  const limits = { limitInputPixels, failOn: "error" };
  try {
    const meta = await sharp(bytes, limits).metadata();
    if (!kinds.includes(meta.format) || !meta.width || !meta.height) {
      throw new Error("unsupported");
    }
    return await work(extra => sharp(bytes, { ...limits, ...extra }), meta);
  } catch (error) {
    if (error.status) {
      throw error;
    }
    throw badRequest("This file is not a usable picture.", "invalid_image");
  }
}
