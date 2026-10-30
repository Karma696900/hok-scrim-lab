// Last hit: a minion's life bar runs down and there is a notch on it. Strike at the exact moment the
// bar goes under the notch, not before and not after. Ten minions. The score is how far off your
// strikes were, in milliseconds, on average.
import { t } from "../../../../app/browser-i18n.js";
import { LASTHIT_CAP, LASTHIT_TRIALS, lastHitScore, lastHitTrial, timingOffset } from "../logic.js";
import { createRun, eventTime } from "./frame.js";
import { noHud } from "../hud.js";

export function startLastHit({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const offsets = [];
  let trial = null;
  let startedAt = 0;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p>
    <div class="rx-life"><i class="rx-life-fill"></i><b class="rx-notch"></b></div>
    <p class="rx-verdict" aria-live="polite"></p>
    <button type="button" class="rx-strike">${t("Strike")}</button>`;
  const status = stage.querySelector(".rx-status");
  const fill = stage.querySelector(".rx-life-fill");
  const life = stage.querySelector(".rx-life");
  const verdict = stage.querySelector(".rx-verdict");
  const strikeButton = stage.querySelector(".rx-strike");

  function minion() {
    if (offsets.length === LASTHIT_TRIALS) {
      finish(lastHitScore(offsets));
      return;
    }
    trial = lastHitTrial(random);
    startedAt = 0;
    fill.style.transform = "scaleX(1)";
    life.style.setProperty("--notch", String(Math.round(trial.threshold * 100)));
    status.textContent = t("Minion {done} of {total}", {
      done: offsets.length + 1,
      total: LASTHIT_TRIALS
    });
    verdict.textContent = "";
    hud.count(offsets.length + 1, LASTHIT_TRIALS);
    hud.progress(offsets.length / LASTHIT_TRIALS);
    run.after(600 + random() * 700, async () => {
      await run.frame();
      startedAt = performance.now();
      requestAnimationFrame(drain);
    });
  }

  function drain(now) {
    if (run.stopped || !startedAt) {
      return;
    }
    const elapsed = now - startedAt;
    fill.style.transform = `scaleX(${Math.max(0, 1 - elapsed / trial.duration)})`;
    if (elapsed >= trial.duration) {
      record(LASTHIT_CAP, true);
    } else {
      requestAnimationFrame(drain);
    }
  }

  function record(offset, missed = false) {
    startedAt = 0;
    offsets.push(offset);
    verdict.dataset.side = offset < 0 ? "early" : "late";
    verdict.textContent = missed
      ? t("Too late: the minion is gone")
      : offset === 0
        ? t("Dead on!")
        : offset < 0
          ? t("{ms} ms early", { ms: -offset })
          : t("{ms} ms late", { ms: offset });
    run.after(1200, minion);
  }

  function strike(event) {
    if (startedAt) {
      record(timingOffset(eventTime(event) - startedAt, trial));
    }
  }

  strikeButton.addEventListener("pointerdown", strike, { signal: run.signal });
  strikeButton.addEventListener(
    "keydown",
    event => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        strike(event);
      }
    },
    { signal: run.signal }
  );
  strikeButton.focus({ preventScroll: true });
  minion();
  return run.stop;
}
