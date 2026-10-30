import { tooMany } from "../../../platform/errors.js";

/**
 * Serialises roster synchronisation: at most one Chromium run at a time (callers share the running
 * promise), a cooldown between manual runs, and a guard that keeps the last valid roster when Camp
 * suddenly returns far fewer heroes.
 */
export function createRosterSync({
  store,
  fetchRoster,
  fetchNames = null,
  cooldownMs = 600_000,
  logger,
  now = Date.now
}) {
  let inFlight = null;
  let lastManualAt = 0;
  const namesInFlight = new Map(); // lang -> promise
  const namesFailedAt = new Map();
  let namesChain = Promise.resolve(); // one Chromium at a time, whatever the number of languages asked for

  /** Localized hero names and classes for one language (single flight, retried only after a pause). */
  function requestNames(lang) {
    if (!fetchNames || lang === "en") {
      return null;
    }
    if (namesInFlight.has(lang)) {
      return namesInFlight.get(lang);
    }
    if (namesFailedAt.has(lang) && now() - namesFailedAt.get(lang) < 600_000) {
      return null;
    }
    const promise = (namesChain = namesChain.then(async () => {
      const known = new Set((await store.readHeroes()).map(hero => hero.id));
      await store.saveHeroNames(lang, await fetchNames(lang, known));
      namesFailedAt.delete(lang);
      logger?.info("hero names synced", { lang });
    }))
      .catch(error => {
        namesFailedAt.set(lang, now());
        logger?.warn("hero names unavailable in this language", { lang, reason: error.message });
      })
      .finally(() => {
        namesInFlight.delete(lang);
      });
    namesInFlight.set(lang, promise);
    return promise;
  }

  async function execute() {
    const { heroes, sourceUpdated } = await fetchRoster();
    const current = (await store.readHeroes()).filter(hero => hero.availableGlobal);
    if (current.length >= 20 && heroes.length < current.length * 0.8) {
      throw new Error(
        `Camp returned ${heroes.length} heroes against ${current.length} cached; keeping the last valid roster.`
      );
    }
    const before = new Set(current.map(hero => hero.id));
    await store.saveHeroes(heroes, sourceUpdated);
    const removed = [...before].filter(id => !heroes.some(hero => hero.id === id));
    const added = heroes.filter(hero => !before.has(hero.id)).map(hero => hero.id);
    logger?.info("roster synced", { count: heroes.length, sourceUpdated, added, removed });
    // The localized names follow in the background: the roster answer does not wait for fifteen
    // page loads.
    if (fetchNames) {
      void (async () => {
        for (const lang of (await store.heroNameLanguages?.()) ?? []) {
          await requestNames(lang);
        }
      })();
    }
    return {
      count: heroes.length,
      sourceUpdated,
      updatedAt: new Date().toISOString(),
      added,
      removed
    };
  }

  return {
    isRunning: () => Boolean(inFlight),
    requestNames,
    run({ manual = false } = {}) {
      if (inFlight) {
        return inFlight;
      }
      if (manual && cooldownMs > 0) {
        const wait = lastManualAt + cooldownMs - now();
        if (wait > 0) {
          throw tooMany(
            "Roster sync was run recently. Try again in {seconds} s.",
            Math.ceil(wait / 1000),
            { seconds: Math.ceil(wait / 1000) }
          );
        }
      }
      if (manual) {
        lastManualAt = now();
      }
      inFlight = execute().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }
  };
}

/**
 * Background refresh: waits until the cached roster is `intervalMs` old instead of launching
 * Chromium at every start.
 */
export function startRosterSchedule({
  store,
  rosterSync,
  intervalMs,
  logger,
  startupDelayMs = 5000
}) {
  let timer = null;
  let stopped = false;
  const schedule = delay => {
    if (stopped) {
      return;
    }
    timer = setTimeout(tick, delay);
    timer.unref();
  };
  const tick = async () => {
    try {
      // every instance behind a load balancer has this timer: only one at a time asks Camp
      await (store?.runExclusive
        ? store.runExclusive("roster-sync", () => rosterSync.run())
        : rosterSync.run());
    } catch (error) {
      logger?.warn("roster sync failed; keeping the last valid roster", { reason: error.message });
    }
    schedule(intervalMs);
  };
  store
    .readMetadata("rosterUpdatedAt")
    .then(value => {
      const age = value ? Date.now() - Date.parse(value) : Infinity;
      schedule(age >= intervalMs ? startupDelayMs : intervalMs - age);
    })
    .catch(() => schedule(startupDelayMs));
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
