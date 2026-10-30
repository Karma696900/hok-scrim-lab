// translation service, round: round, sweep, enabled, changed, and 7 more.
import { QUOTA_SHARE, dayOf } from "./translation-domain.js";
import { collectTexts } from "./sources.js";
import { wording } from "./translation-service-shared.js";

export async function round(ctx, result) {
  const lock = await ctx.store.contentLock();
  if (!lock) {
    result.stopped = "busy";
    return;
  }
  try {
    const wanted = await ctx.wantedNow();
    const synced = await ctx.store.contentSync(
      await collectTexts(ctx.store.pool),
      wanted,
      ctx.now()
    );
    result.added = synced.added;
    result.removed = synced.removed;
    if (!ctx.provider) {
      result.stopped = "off";
    } else if (ctx.state.refused) {
      result.stopped = "refused";
    } else if (ctx.now() < ctx.state.pausedUntil) {
      result.stopped = "paused";
    } else if (!wanted.length) {
      result.stopped = "no-language";
    } else {
      const budget = { left: null };
      for (
        let again = 0;
        again < MAX_ROUNDS && (await ctx.pass(result, wanted, budget));
        again += 1
      ) {
        // more than one pass of work: go on until nothing is due
      }
    }
  } finally {
    await lock.release();
  }
}

/** One round of work. Resolves with what was done; never throws (a failure is logged and kept as `lastError`). */
export function sweep(ctx) {
  if (ctx.state.running) {
    return ctx.current ?? Promise.resolve({ stopped: "busy" });
  }
  ctx.state.running = true;
  const result = { added: 0, removed: 0, texts: 0, translated: 0, failed: 0, stopped: null };
  ctx.current = (async () => {
    try {
      await ctx.round(result);
    } catch (error) {
      ctx.state.lastError = wording(error);
      ctx.logger?.warn("translation round failed", { message: error?.message });
      result.stopped = "error";
    } finally {
      ctx.state.running = false;
      ctx.state.lastSweepAt = ctx.now();
      ctx.state.lastResult = result;
    }
    if (result.added || result.removed || result.translated) {
      try {
        ctx.onChange();
      } catch (error) {
        ctx.logger?.warn("translation change hook failed", { message: error?.message });
      }
    }
    return result;
  })();
  return ctx.current;
}

export const enabled = ctx => Boolean(ctx.provider);

/** What the pages show changed (a translation was corrected): what was drawn from it is dropped. */
export function changed(ctx) {
  try {
    ctx.onChange();
  } catch (error) {
    ctx.logger?.warn("translation change hook failed", { message: error?.message });
  }
}

/** Something changed in what the staff writes: a round soon (many saves make one round). */
export function kick(ctx, delay = KICK_DELAY_MS) {
  if (!ctx.state.started) {
    return;
  }
  clearTimeout(ctx.kickTimer);
  ctx.kickTimer = setTimeout(() => void ctx.sweep(), delay);
  ctx.kickTimer.unref?.();
}

/**
 * A language is asked for: a visitor reads the site in it, or an administrator wants it. From the
 * next round the texts are translated into it. True when it was not asked for before.
 */
export async function want(ctx, language) {
  if (!ctx.languages.includes(language)) {
    return false;
  }
  ctx.asked ??= new Set(await ctx.store.contentLanguages());
  if (ctx.asked.has(language)) {
    return false;
  }
  ctx.asked.add(language);
  const added = await ctx.store.contentWant(language, ctx.now());
  if (added) {
    ctx.api.kick();
  }
  return added;
}

/** Every language of the site is asked for. How many were not asked for before. */
export async function wantAll(ctx) {
  let added = 0;
  for (const language of ctx.languages) {
    added += (await ctx.api.want(language)) ? 1 : 0;
  }
  return added;
}

/** Starts the rounds: a first one soon, then every `sweepSeconds`. */
export function start(ctx) {
  if (ctx.state.started) {
    return;
  }
  ctx.state.started = true;
  const first = setTimeout(() => void ctx.sweep(), 5000);
  first.unref?.();
  ctx.interval = setInterval(() => void ctx.sweep(), (ctx.config.sweepSeconds ?? 300) * 1000);
  ctx.interval.unref?.();
}

export async function stop(ctx) {
  ctx.state.started = false;
  clearInterval(ctx.interval);
  clearTimeout(ctx.kickTimer);
  await ctx.current?.catch(() => {});
}

/** What the administration shows. */
export async function status(ctx) {
  const wanted = await ctx.wantedNow();
  const [counts, quota, usedToday] = await Promise.all([
    ctx.store.contentStatus(wanted),
    ctx.readQuota(),
    ctx.store.contentUsage(dayOf(ctx.now()))
  ]);
  const none = { ok: 0, pending: 0, failed: 0, manual: 0 };
  return {
    provider: ctx.provider ? { name: ctx.provider.name, label: ctx.provider.label } : null,
    running: ctx.state.running,
    paused:
      ctx.now() < ctx.state.pausedUntil
        ? { until: ctx.state.pausedUntil, reason: ctx.state.pauseReason }
        : null,
    refused: ctx.state.refused,
    lastError: ctx.state.lastError,
    lastSweepAt: ctx.state.lastSweepAt,
    lastResult: ctx.state.lastResult,
    dailyChars: ctx.dailyChars,
    usedToday,
    quota,
    quotaShare: ctx.provider?.usage ? QUOTA_SHARE : null,
    wanted,
    languages: ctx.languages.map(code => ({
      code,
      wanted: wanted.includes(code),
      ...(counts.languages[code] ?? none)
    })),
    texts: counts.texts,
    total: counts.total
  };
}

/** A key or a service that was fixed: the next round tries again. */
export function resume(ctx) {
  ctx.state.refused = null;
  ctx.state.pausedUntil = 0;
  ctx.state.pauseReason = null;
  ctx.state.failures = 0;
  ctx.state.quota = null;
}

const KICK_DELAY_MS = 2000;

const MAX_ROUNDS = 50;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  round,
  sweep,
  enabled,
  changed,
  kick,
  want,
  wantAll,
  start,
  stop,
  status,
  resume
};
