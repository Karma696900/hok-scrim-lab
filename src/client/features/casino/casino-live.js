// casino page, the live view: asks the server every `every` ms whether the roulette changed (`?since=` its version;
// 304 when not), paints a newer version, rests while the tab is hidden and asks at once when it is shown again, and
// stops for good when the roulette is gone (404: `onState(null)`) or when `stop()` is called.

/** Starts the live view of roulette `id`; returns `stop`. */
export function startLive({
  version,
  fetchState,
  onState,
  every = 2000,
  doc = globalThis.document,
  clock = globalThis
}) {
  let timer = null;
  let stopped = false;
  let asking = false;

  const plan = () => {
    if (!stopped) {
      timer = clock.setTimeout(beat, every);
    }
  };

  async function ask() {
    if (stopped || asking) {
      return;
    }
    asking = true;
    try {
      const answer = await fetchState(version());
      if (stopped) {
        return;
      }
      if (answer.status === 404) {
        stop();
        onState(null);
      } else if (answer.status === 200 && answer.body && answer.body.version !== version()) {
        onState(answer.body);
      }
    } catch {
      // the network failed: the next beat asks again
    } finally {
      asking = false;
    }
  }

  async function beat() {
    timer = null;
    if (!doc?.hidden) {
      await ask();
    }
    plan();
  }

  const shown = async () => {
    if (!doc.hidden) {
      await ask();
    }
  };

  function stop() {
    stopped = true;
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
    doc?.removeEventListener("visibilitychange", shown);
  }

  doc?.addEventListener("visibilitychange", shown);
  plan();
  return stop;
}
