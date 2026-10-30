// What every exercise needs to run and to be stopped cleanly: its listeners and its timers go away
// together, and nothing it started goes on once it has been stopped. While a run lasts the page holds
// still (see app/app-state.js): no request of its own, no video, no animation outside the exercise.
import { setQuiet } from "../../../../app/app-state.js";

/** Runs in progress. There is one at a time; a stale one must not end the stillness of a new one. */
let active = 0;

export function createRun(stage) {
  const abort = new AbortController();
  const timers = new Set();
  let stopped = false;
  // leaving the page without ending the exercise (a link in the menu) stops it too
  const watchdog = setInterval(() => {
    if (!stage.isConnected) {
      run.stop();
    }
  }, 500);
  active += 1;
  setQuiet(true);

  const run = {
    /** For addEventListener: the listeners are removed when the run is stopped. */
    signal: abort.signal,
    get stopped() {
      return stopped;
    },
    /** Resolves after `ms`; never, if the run is stopped meanwhile (what follows does not happen). */
    wait: ms =>
      new Promise(resolve => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve(true);
        }, ms);
        timers.add(id);
      }),
    /** Calls `callback` after `ms` unless the run is stopped first; returns what `cancel` takes. */
    after(ms, callback) {
      const id = setTimeout(() => {
        timers.delete(id);
        callback();
      }, ms);
      timers.add(id);
      return id;
    },
    cancel(id) {
      clearTimeout(id);
      timers.delete(id);
    },
    /** Resolves once the next frame is about to be painted: the moment a stimulus becomes visible. */
    frame: () => new Promise(resolve => requestAnimationFrame(resolve)),
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(watchdog);
      abort.abort();
      for (const id of timers) {
        clearTimeout(id);
      }
      timers.clear();
      active -= 1;
      if (active === 0) {
        setQuiet(false);
      }
    }
  };
  return run;
}

/** The time of an event on the clock of performance.now(), whatever it is: a key, a pointer. */
export const eventTime = event =>
  typeof event?.timeStamp === "number" && event.timeStamp > 0 ? event.timeStamp : performance.now();
