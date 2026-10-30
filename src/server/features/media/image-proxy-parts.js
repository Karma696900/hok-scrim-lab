// image proxy, small helpers: keyOf, slot, remember, noteFailure, and 3 more.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PICTURE_RECIPE } from "../../../shared/media.js";
import { safeMediaUrl } from "../heroes/camp-data.js";
import sharp from "../../platform/images/sharp-safe.js";

/** The recipe is part of the key of the copy on disk, so a change of recipe is a new picture: the old copies are never served again. */
export const keyOf = (url, width) =>
  createHash("sha256").update(`${PICTURE_RECIPE}|${width}|${url}`).digest("hex").slice(0, 40);

/**
 * The width a picture is made at. Camp's hero and skill icons are only 128 px square and the pages draw them 2 to 4 times
 * larger (a card of a hero is 3:4 and covers its box), which the browser does with a plain bilinear filter: soft, with
 * stairs on every edge. A small source is enlarged here instead (Lanczos, then a light sharpening), up to 2.5 times; a large
 * one is never enlarged.
 */
export function widthFor(sourceWidth, asked) {
  return sourceWidth <= SMALL_SOURCE_PX
    ? Math.min(asked, Math.round(sourceWidth * MAX_ENLARGEMENT))
    : Math.min(asked, sourceWidth);
}

export async function slot(ctx) {
  if (ctx.active >= ctx.concurrency) {
    if (ctx.waiting.length >= WAITING_MAX) {
      throw new Busy();
    }
    await new Promise(resolve => ctx.waiting.push(resolve));
  }
  ctx.active += 1;
  return () => {
    ctx.active -= 1;
    ctx.waiting.shift()?.();
  };
}

export function remember(ctx, key, body) {
  if (ctx.memory.has(key)) {
    ctx.memoryBytes -= ctx.memory.get(key).length;
    ctx.memory.delete(key);
  }
  ctx.memory.set(key, body);
  ctx.memoryBytes += body.length;
  for (const [oldKey, value] of ctx.memory) {
    if (ctx.memoryBytes <= MEMORY_BUDGET) {
      break;
    }
    ctx.memory.delete(oldKey);
    ctx.memoryBytes -= value.length;
  }
}

export function noteFailure(ctx, key) {
  ctx.failures.set(key, ctx.now() + FAILURE_MEMORY_MS);
  if (ctx.failures.size > FAILURES_MAX) {
    for (const [old, until] of ctx.failures) {
      if (until <= ctx.now()) {
        ctx.failures.delete(old);
      }
    }
    while (ctx.failures.size > FAILURES_MAX) {
      ctx.failures.delete(ctx.failures.keys().next().value);
    }
  }
}

/**
 * Keeps the pictures on disk under the budget: when it is passed, the oldest go until 80 % is left.
 * Only the proxy's own files are looked at (the directory may be the temporary folder of the system).
 * @returns {Promise<number>} how many files were removed
 */
export async function prune(ctx) {
  if (ctx.pruning) {
    return 0;
  }
  ctx.pruning = true;
  try {
    const files = [];
    let total = 0;
    for (const name of (await readdir(ctx.directory)).filter(entry => CACHED_FILE.test(entry))) {
      const info = await stat(path.join(ctx.directory, name)).catch(() => null);
      if (info) {
        files.push({ name, size: info.size, time: info.mtimeMs });
        total += info.size;
      }
    }
    if (total <= ctx.diskBudgetBytes) {
      return 0;
    }
    files.sort((left, right) => left.time - right.time || left.name.localeCompare(right.name));
    let removed = 0;
    for (const file of files) {
      if (total <= ctx.diskBudgetBytes * 0.8) {
        break;
      }
      await unlink(path.join(ctx.directory, file.name)).catch(() => {});
      total -= file.size;
      removed += 1;
    }
    return removed;
  } catch {
    return 0;
  } finally {
    ctx.pruning = false;
  }
}

export async function produce(ctx, url, width, key) {
  const file = path.join(ctx.directory, `${key}.webp`);
  try {
    return await readFile(file);
  } catch {
    /* not on disk yet */
  }
  const release = await ctx.slot();
  try {
    const response = await ctx.fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "error"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const type = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)) {
      throw new Error("not a supported image");
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_SOURCE_BYTES) {
      throw new Error("image is too large");
    }
    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > MAX_SOURCE_BYTES) {
      throw new Error("image has an unexpected size");
    }
    const picture = sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
    const { width: sourceWidth = width } = await picture.metadata();
    const target = widthFor(sourceWidth, width);
    const body = await (
      target > sourceWidth
        ? picture.resize({ width: target, kernel: "lanczos3" }).sharpen(ENLARGED_SHARPENING)
        : picture.resize({ width: target })
    )
      .webp({
        quality: target <= 480 ? SMALL_QUALITY : LARGE_QUALITY,
        smartSubsample: true,
        effort: 4
      })
      .toBuffer();
    await mkdir(ctx.directory, { recursive: true });
    await writeFile(file, body).catch(() => {});
    ctx.writes += 1;
    if (ctx.writes % PRUNE_EVERY_WRITES === 0) {
      ctx.prune();
    }
    return body;
  } finally {
    release();
  }
}

/**
 * @returns {Promise<{ body: Buffer, key: string } | null>} null when the address is not an
 *     allowed Camp image or could not be fetched (the caller redirects to the original, or
 *     answers 404 for a refused address).
 */
export async function get(ctx, rawUrl, rawWidth) {
  const url = safeMediaUrl(String(rawUrl ?? ""));
  const width = Number(rawWidth);
  if (!url || !IMAGE_WIDTHS.includes(width)) {
    return { refused: true };
  }
  const key = keyOf(url, width);
  if (ctx.memory.has(key)) {
    const body = ctx.memory.get(key);
    ctx.remember(key, body);
    return { body, key };
  }
  if ((ctx.failures.get(key) ?? 0) > ctx.now()) {
    return null;
  }
  let pending = ctx.inFlight.get(key);
  if (!pending) {
    pending = ctx.produce(url, width, key).finally(() => ctx.inFlight.delete(key));
    ctx.inFlight.set(key, pending);
  }
  try {
    const body = await pending;
    ctx.remember(key, body);
    return { body, key };
  } catch (error) {
    if (error instanceof Busy) {
      return null; // load, not a bad picture: nothing is remembered against the address
    }
    ctx.noteFailure(key);
    ctx.logger?.warn("image unavailable", { reason: error.message });
    return null;
  }
}

const IMAGE_WIDTHS = [96, 160, 320, 480, 640, 960, 1280];

const SMALL_SOURCE_PX = 256;

const MAX_ENLARGEMENT = 2.5;

const ENLARGED_SHARPENING = { sigma: 1, m1: 0.8, m2: 2.5 };

/** WebP quality: icons and small pictures are few bytes whatever the quality, a cover is 30 to 60 KB. Chroma is kept (a red does not bleed into its neighbours). */
const SMALL_QUALITY = 84;

const LARGE_QUALITY = 78;

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

const MAX_PIXELS = 60_000_000;

const MEMORY_BUDGET = 32 * 1024 * 1024;

const FAILURE_MEMORY_MS = 5 * 60 * 1000;

/** How many failed addresses are remembered (a person asking for thousands of addresses must not grow the memory). */
const FAILURES_MAX = 2000;

/** How many requests may wait for a free slot; past that the proxy answers at once that it is busy. */
const WAITING_MAX = 64;

const PRUNE_EVERY_WRITES = 50;

const CACHED_FILE = /^[0-9a-f]{40}.webp$/;

class Busy extends Error {}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { slot, remember, noteFailure, prune, produce, get };
