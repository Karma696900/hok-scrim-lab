// Friend or foe: units appear one at a time. Hit the enemies (red) as fast as you can and leave the
// allies (blue) alone. Thirty units. The score is the average time to hit an enemy (a missed one counts
// for the whole second it was shown), plus 250 ms for each ally you hit.
import { t } from "../../../../app/browser-i18n.js";
import {
  DISCERN_SHOWN,
  DISCERN_TRIALS,
  discernScore,
  discernTrials,
  targetSpot
} from "../logic.js";
import { createRun, eventTime } from "./frame.js";
import { noHud } from "../hud.js";

const SIZE = 60;

export function startDiscern({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const trials = discernTrials(DISCERN_TRIALS, random);
  const results = [];
  let current = null;
  let timer = 0;
  let spot = null;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p><div class="rx-arena"><button type="button" class="rx-unit" hidden></button></div>`;
  const status = stage.querySelector(".rx-status");
  const arena = stage.querySelector(".rx-arena");
  const unit = stage.querySelector(".rx-unit");

  function next(index) {
    unit.hidden = true;
    current = null;
    if (index === trials.length) {
      finish(discernScore(results));
      return;
    }
    status.textContent = t("Unit {done} of {total}", { done: index + 1, total: trials.length });
    hud.count(index + 1, trials.length);
    hud.progress(index / trials.length);
    run.after(trials[index].wait, async () => {
      const { kind } = trials[index];
      spot = targetSpot(
        { width: arena.clientWidth, height: arena.clientHeight },
        SIZE,
        random,
        spot
      );
      unit.className = `rx-unit ${kind === "enemy" ? "team-red" : "team-blue"}`;
      unit.dataset.kind = kind;
      unit.setAttribute("aria-label", kind === "enemy" ? t("Enemy") : t("Ally"));
      unit.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
      unit.hidden = false;
      await run.frame();
      current = { kind, hit: false, time: 0, shownAt: performance.now() };
      results.push(current);
      timer = run.after(DISCERN_SHOWN, () => next(index + 1));
    });
  }

  function press(event) {
    if (!current || current.hit || !event.target.closest(".rx-unit")) {
      return;
    }
    current.hit = true;
    current.time = Math.max(1, Math.round(eventTime(event) - current.shownAt));
    unit.classList.add(current.kind === "enemy" ? "good" : "bad");
    run.cancel(timer);
    const index = results.length;
    timer = run.after(260, () => next(index));
  }

  arena.addEventListener("pointerdown", press, { signal: run.signal });
  unit.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        press(event);
      }
    },
    { signal: run.signal }
  );
  next(0);
  return run.stop;
}
