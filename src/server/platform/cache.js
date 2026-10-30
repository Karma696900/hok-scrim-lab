/** `promise`, or a failure once `ms` have passed without an answer. */
function withTimeout(promise, ms) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("The computation took too long.")), ms);
    timer.unref?.();
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * A small in-memory cache for reads that are expensive and may be a few seconds old.
 *
 *  - an entry expires after `ttlMs`;
 *  - past `maxEntries` the least recently used one is dropped, so a visitor cannot grow the cache with
 *    ever-new query strings;
 *  - people asking for the same key at the same time share ONE computation (a burst of visitors on the
 *    same page costs a single aggregation, not one each);
 *  - a computation that fails is not kept, and one that does not end within `maxWaitMs` fails for those
 *    who wait for it and is forgotten (one stuck query must not block a key for everybody);
 *  - `clear()` also forgets the computations in flight: a read that began before a write must not be
 *    stored after it (the catalog had exactly this bug, see src/server/features/catalog/catalog-cache.test.js).
 *
 * The cache belongs to one process. Behind a load balancer each instance has its own, which is why the
 * lifetimes are short and writes clear the instance that handled them.
 */
export function createTtlCache({
  ttlMs,
  maxEntries = 100,
  maxWaitMs = 30_000,
  now = Date.now
} = {}) {
  if (!(ttlMs > 0)) {
    throw new Error("createTtlCache needs a positive ttlMs.");
  }
  const entries = new Map(); // key -> { value, expires }; the first key is the least recently used
  const inflight = new Map(); // key -> Promise of the value being computed
  let generation = 0;

  const keep = (key, value) => {
    entries.delete(key);
    entries.set(key, { value, expires: now() + ttlMs });
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  return {
    /** The value for `key`: the one kept if it is still fresh, else `compute()`'s (kept for next time). */
    remember(key, compute) {
      const hit = entries.get(key);
      if (hit) {
        if (hit.expires > now()) {
          entries.delete(key); // most recently used goes last
          entries.set(key, hit);
          return Promise.resolve(hit.value);
        }
        entries.delete(key);
      }
      const pending = inflight.get(key);
      if (pending) {
        return pending;
      }
      const startedAt = generation;
      const run = Promise.resolve().then(compute);
      run.catch(() => {}); // if the wait ends first, a failure that comes later is nobody's business
      const promise = withTimeout(run, maxWaitMs)
        .then(value => {
          if (startedAt === generation) {
            keep(key, value);
          }
          return value;
        })
        .finally(() => {
          if (inflight.get(key) === promise) {
            inflight.delete(key);
          }
        });
      inflight.set(key, promise);
      return promise;
    },
    /** Forgets everything, including what is being computed right now. Call it after a write. */
    clear() {
      generation += 1;
      entries.clear();
      inflight.clear();
    },
    get size() {
      return entries.size;
    }
  };
}
