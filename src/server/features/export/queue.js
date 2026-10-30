import { HttpError } from "../../platform/errors.js";

/**
 * Bounded job queue for PDF generation (each job launches Chromium).
 *  - at most `concurrency` jobs run at once;
 *  - at most `maxQueued` jobs wait for a free slot; beyond that the caller gets 503 + Retry-After;
 *  - a given user can have one job queued or running at a time (429);
 *  - a job that exceeds `jobTimeoutMs` is failed and its slot is released, even if its task never settles.
 */
export function createExportQueue({ concurrency = 1, maxQueued = 4, jobTimeoutMs = 90_000 } = {}) {
  const waiting = [];
  const busyUsers = new Set();
  let running = 0;

  function next() {
    while (running < concurrency && waiting.length) {
      const job = waiting.shift();
      running += 1;
      let released = false;
      const release = () => {
        if (released) {
          return;
        }
        released = true;
        clearTimeout(timer);
        running -= 1;
        busyUsers.delete(job.userId);
        next();
      };
      const timer = setTimeout(() => {
        job.fail(
          new HttpError(504, "export_timeout", "The export took too long and was cancelled.")
        );
        release();
      }, jobTimeoutMs);
      timer.unref?.();
      Promise.resolve().then(job.task).then(job.succeed, job.fail).finally(release);
    }
  }

  return {
    stats: () => ({ running, queued: waiting.length }),
    run(userId, task) {
      if (busyUsers.has(userId)) {
        return Promise.reject(
          new HttpError(
            429,
            "export_in_progress",
            "You already have an export in progress. Wait for it to finish.",
            { retryAfterSeconds: 10 }
          )
        );
      }
      if (running >= concurrency && waiting.length >= maxQueued) {
        return Promise.reject(
          new HttpError(503, "export_busy", "The export queue is full. Try again in a moment.", {
            retryAfterSeconds: 15
          })
        );
      }
      busyUsers.add(userId);
      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = fn => value => {
          if (!settled) {
            settled = true;
            fn(value);
          }
        };
        waiting.push({ userId, task, succeed: settle(resolve), fail: settle(reject) });
        next();
      });
    }
  };
}
