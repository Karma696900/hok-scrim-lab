// details sync, small helpers: execute, drain, isRunning, requestHero, and 2 more.
import { tooMany } from "../../../platform/errors.js";

export async function execute(ctx, { force, lang }) {
  const heroes = (await ctx.store.readHeroes()).filter(hero => hero.availableGlobal);
  const known = await ctx.store.heroDetailsStatus(lang);
  const due = heroes
    .filter(
      hero =>
        force || !known.has(hero.id) || ctx.now() - Date.parse(known.get(hero.id)) > ctx.maxAgeMs
    )
    .map(hero => hero.id);
  ctx.status = {
    running: true,
    total: due.length,
    done: 0,
    failed: 0,
    startedAt: new Date(ctx.now()).toISOString(),
    finishedAt: null,
    lastError: null,
    lang
  };
  if (!due.length) {
    ctx.status.running = false;
    ctx.status.finishedAt = ctx.status.startedAt;
    return ctx.status;
  }
  try {
    await ctx.fetchDetails(due, {
      lang,
      onHero: async (heroId, details, error) => {
        if (details) {
          await ctx.store.saveHeroDetails(heroId, details, lang);
          ctx.status.done += 1;
        } else {
          ctx.status.failed += 1;
          ctx.status.lastError = error?.message ?? "unknown error";
          ctx.logger?.warn("hero details unavailable; keeping the previous sheet", {
            heroId,
            lang,
            reason: ctx.status.lastError
          });
        }
      }
    });
  } catch (error) {
    ctx.status.lastError = error.message;
    ctx.logger?.warn("hero details sync failed", { lang, reason: error.message });
  } finally {
    ctx.status.running = false;
    ctx.status.finishedAt = new Date(ctx.now()).toISOString();
    ctx.logger?.info("hero details synced", {
      lang,
      total: ctx.status.total,
      done: ctx.status.done,
      failed: ctx.status.failed
    });
  }
  return ctx.status;
}

export async function drain(ctx) {
  while (ctx.queue.size) {
    if (ctx.inFlight) {
      await ctx.inFlight.catch(() => {});
      continue;
    }
    const [key, { heroId, lang }] = ctx.queue.entries().next().value;
    ctx.queue.delete(key);
    try {
      await ctx.fetchDetails([heroId], {
        lang,
        onHero: async (id, details, error) => {
          if (details) {
            await ctx.store.saveHeroDetails(id, details, lang);
            ctx.failedAt.delete(key);
          } else {
            ctx.failedAt.set(key, ctx.now());
            ctx.logger?.warn("hero sheet unavailable in this language", {
              heroId: id,
              lang,
              reason: error?.message
            });
          }
        }
      });
    } catch (error) {
      ctx.failedAt.set(key, ctx.now());
      ctx.logger?.warn("hero sheet fetch failed", { heroId, lang, reason: error.message });
    }
  }
}

export const isRunning = ctx => Boolean(ctx.inFlight);

/**
 * Queues the sheet of one hero in one language (deduplicated, bounded, retried only after a
 * pause). Returns whether it was queued.
 */
export function requestHero(ctx, heroId, lang) {
  if (lang === "en") {
    return false;
  }
  const key = `${lang}:${heroId}`;
  if (ctx.queue.has(key) || ctx.queue.size >= MAX_QUEUE) {
    return false;
  }
  if (ctx.failedAt.has(key) && ctx.now() - ctx.failedAt.get(key) < RETRY_AFTER_FAILURE_MS) {
    return false;
  }
  ctx.queue.set(key, { heroId, lang });
  ctx.draining ??= ctx.drain().finally(() => {
    ctx.draining = null;
  });
  return true;
}

export const pending = ctx => ctx.queue.size + (ctx.draining ? 1 : 0);

export function run(ctx, { manual = false, force = false, lang = "en" } = {}) {
  if (ctx.inFlight) {
    return ctx.inFlight;
  }
  if (manual && ctx.cooldownMs > 0) {
    const wait = ctx.lastManualAt + ctx.cooldownMs - ctx.now();
    if (wait > 0) {
      throw tooMany(
        "Hero details were synced recently. Try again in {seconds} s.",
        Math.ceil(wait / 1000),
        { seconds: Math.ceil(wait / 1000) }
      );
    }
  }
  if (manual) {
    ctx.lastManualAt = ctx.now();
  }
  ctx.inFlight = ctx.execute({ force, lang }).finally(() => {
    ctx.inFlight = null;
  });
  return ctx.inFlight;
}

const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

const MAX_QUEUE = 40;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { execute, drain, isRunning, requestHero, pending, run };
