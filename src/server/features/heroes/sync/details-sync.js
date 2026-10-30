import { bindTo } from "../../../../shared/bind-to.js";
import { onView as detailsSyncParts } from "./details-sync-parts.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Keeps hero sheets in step with Camp. One run at a time; each hero is saved as soon as it is
 * fetched, so an interrupted run keeps its progress, and a failed hero keeps its previous sheet. A
 * run only fetches heroes that have no sheet yet or whose sheet is older than `maxAgeMs`, unless
 * `force` is set.
 *
 * Sheets exist per language (Camp Global serves each page in the visitor's language). English is the baseline;
 * another language is fetched hero by hero the first time somebody opens that hero in it (`requestHero`), or all at once
 * by `run({ lang })`. Until it arrives the English sheet is shown.
 */
export function createDetailsSync({
  store,
  fetchDetails,
  logger,
  cooldownMs = 600_000,
  maxAgeMs = WEEK_MS,
  now = Date.now
}) {
  const ctx = { store, now, maxAgeMs, fetchDetails, logger, cooldownMs };
  bindTo(ctx, detailsSyncParts);
  ctx.inFlight = null;
  ctx.lastManualAt = 0;
  ctx.status = {
    running: false,
    total: 0,
    done: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    lang: "en"
  };
  ctx.queue = new Map(); // "lang:heroId" -> { heroId, lang }
  ctx.failedAt = new Map(); // "lang:heroId" -> time of the last failure
  ctx.draining = null;

  return {
    status: () => ({ ...ctx.status }),
    isRunning: ctx.isRunning,
    requestHero: ctx.requestHero,
    pending: ctx.pending,
    run: ctx.run
  };
}

/**
 * Daily check after start-up: English first, then every language that already has sheets (heroes
 * without a sheet are fetched, the rest only when a week old).
 */
export function startDetailsSchedule({
  detailsSync,
  store,
  logger,
  startupDelayMs = 60_000,
  intervalMs = 24 * 60 * 60 * 1000
}) {
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      // every instance behind a load balancer has this timer: only one at a time crawls Camp
      const crawl = async () => {
        await detailsSync.run();
        for (const lang of (await store?.heroDetailsLanguages?.()) ?? []) {
          if (!stopped) {
            await detailsSync.run({ lang });
          }
        }
      };
      await (store?.runExclusive ? store.runExclusive("hero-details-sync", crawl) : crawl());
    } catch (error) {
      logger?.warn("hero details schedule failed", { reason: error.message });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      timer.unref?.();
    }
  };
  timer = setTimeout(tick, startupDelayMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
