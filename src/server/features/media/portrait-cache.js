import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_HOST = "camp.honorofkings.com";
const MAX_BYTES = 1_500_000;
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};
const FAILURE_MEMORY_MS = 10 * 60 * 1000;

/**
 * Local copy of hero portraits, used by the PDF export so Chromium never needs the network. Only
 * https://camp.honorofkings.com images are fetched (size and type checked); a failure yields `null`
 * (the template draws a placeholder) and is remembered for a few minutes.
 */
export function createPortraitCache({ directory, fetchImpl = fetch, logger, now = Date.now }) {
  const failures = new Map();

  const keyFor = url => createHash("sha256").update(url).digest("hex").slice(0, 40);

  async function readCached(key) {
    for (const extension of Object.values(EXTENSIONS)) {
      try {
        return {
          body: await readFile(path.join(directory, `${key}.${extension}`)),
          contentType: Object.keys(EXTENSIONS).find(type => EXTENSIONS[type] === extension)
        };
      } catch {
        /* not cached with this extension */
      }
    }
    return null;
  }

  async function fetchAndStore(url, key) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== ALLOWED_HOST) {
      throw new Error("portrait host is not allowed");
    }
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = EXTENSIONS[contentType];
    if (!extension) {
      throw new Error("portrait is not a supported image");
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > MAX_BYTES) {
      throw new Error("portrait has an unexpected size");
    }
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${key}.${extension}`), body);
    return { body, contentType };
  }

  /** Returns { body, contentType } or null. Never throws. */
  async function get(url) {
    const key = keyFor(String(url));
    try {
      const cached = await readCached(key);
      if (cached) {
        return cached;
      }
      if ((failures.get(key) ?? 0) > now()) {
        return null;
      }
      return await fetchAndStore(String(url), key);
    } catch (error) {
      failures.set(key, now() + FAILURE_MEMORY_MS);
      logger?.warn("portrait unavailable", { reason: error.message });
      return null;
    }
  }

  /**
   * Resolves many heroes with bounded concurrency. Returns Map(heroId -> { body, contentType } |
   * null).
   */
  async function many(heroes, concurrency = 6) {
    const results = new Map();
    const queue = [...heroes];
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
          const hero = queue.shift();
          results.set(hero.id, hero.image ? await get(hero.image) : null);
        }
      })
    );
    return results;
  }

  return { get, many };
}
