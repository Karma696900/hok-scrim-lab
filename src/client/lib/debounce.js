/**
 * Waits for a pause in the typing before doing the work: `typing(value)` can be called on every
 * keystroke, the work runs once, `wait` ms after the last call, with the arguments of the last call.
 * `flush()` runs a pending call at once (Enter, leaving the field), `cancel()` drops it.
 *
 * Use it where one keystroke costs a whole redraw (scripts/performance/input-probe.mjs, processor four times
 * slower than a laptop's: 49 ms a letter for the catalog filter, 27 ms for the hero search; a burst of 12
 * letters 376 and 377 ms before, 120 and 93 ms with the wait). Keep what the typist sees in the field, and
 * anything the next click reads, out of the delayed part: update the state at once, delay only the drawing.
 */
export function debounce(work, wait = 120) {
  let timer = null;
  let pending = null;
  const run = () => {
    timer = null;
    const args = pending;
    pending = null;
    work(...args);
  };
  const typing = (...args) => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  };
  typing.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      run();
    }
  };
  typing.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return typing;
}
