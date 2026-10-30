import { TARGET_LANGUAGES } from "./translation-domain.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as translationServicePause } from "./translation-service-pause.js";
import { onView as translationServiceRound } from "./translation-service-round.js";

/** A provider that cannot say what is left of its quota is held to this much a day, unless the owner wrote another limit. */
const DEFAULT_DAILY_CHARS = 400_000;

/**
 * @param store the store (content* methods)
 * @param provider { name, label, translate, limits?, usage? } or null when the automatic translation is off
 * @param config { dailyChars, sweepSeconds }
 * @param onChange called after a round that changed what the pages show
 * @param languages every language of the site (the ones that are asked for are a part of them)
 */
export function createTranslationService({
  store,
  provider = null,
  config = {},
  logger = null,
  onChange = () => {},
  now = Date.now,
  languages = TARGET_LANGUAGES
}) {
  const ctx = { now, provider, logger, store, languages, onChange, config };
  bindTo(ctx, translationServicePause, translationServiceRound);
  // a limit per day only when the owner wrote one, or when the provider cannot say what is left
  ctx.dailyChars = ctx.config.dailyChars ?? (ctx.provider?.usage ? null : DEFAULT_DAILY_CHARS);
  ctx.state = {
    running: false,
    started: false,
    pausedUntil: 0,
    pauseReason: null,
    refused: null,
    lastError: null,
    lastSweepAt: null,
    lastResult: null,
    failures: 0,
    quota: null
  };
  ctx.interval = null;
  ctx.kickTimer = null;
  ctx.current = null;
  ctx.asked = null; // the languages known to be asked for, so a visitor does not cost a query each time

  ctx.api = {
    enabled: ctx.enabled,
    sweep: ctx.sweep,
    changed: ctx.changed,
    kick: ctx.kick,
    want: ctx.want,
    wantAll: ctx.wantAll,
    start: ctx.start,
    stop: ctx.stop,
    status: ctx.status,
    resume: ctx.resume
  };
  return ctx.api;
}
