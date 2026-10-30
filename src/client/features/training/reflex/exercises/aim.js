// Aim: a target appears, hit it, and the next one appears somewhere else. Thirty targets; the score
// is the average time to hit one, in milliseconds. A click next to the target adds 150 ms to it.
import { t } from "../../../../app/browser-i18n.js";
import { AIM_MISS, AIM_SIZE, AIM_TARGETS, average, targetSpot } from "../logic.js";
import { createRun, eventTime } from "./frame.js";
import { noHud } from "../hud.js";

export function startAim({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const times = [];
  let spot = null;
  let shownAt = 0;
  let penalty = 0;
  let ready = false;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p><div class="rx-arena"><button type="button" class="rx-target" aria-label="${t("Target")}" hidden></button></div>`;
  const status = stage.querySelector(".rx-status");
  const arena = stage.querySelector(".rx-arena");
  const target = stage.querySelector(".rx-target");

  async function place() {
    spot = targetSpot(
      { width: arena.clientWidth, height: arena.clientHeight },
      AIM_SIZE,
      random,
      spot
    );
    target.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    target.hidden = false;
    penalty = 0;
    ready = false;
    status.textContent = t("Target {done} of {total}", {
      done: times.length + 1,
      total: AIM_TARGETS
    });
    hud.count(times.length + 1, AIM_TARGETS);
    hud.progress(times.length / AIM_TARGETS);
    await run.frame();
    shownAt = performance.now();
    ready = true;
  }

  function hit(event) {
    times.push(Math.max(1, Math.round(eventTime(event) - shownAt)) + penalty);
    if (times.length === AIM_TARGETS) {
      target.hidden = true;
      finish(average(times));
    } else {
      place();
    }
  }

  arena.addEventListener(
    "pointerdown",
    event => {
      if (!ready) {
        return;
      }
      if (event.target.closest(".rx-target")) {
        hit(event);
      } else {
        penalty += AIM_MISS;
        arena.classList.add("miss");
        run.after(140, () => arena.classList.remove("miss"));
      }
    },
    { signal: run.signal }
  );
  // the same for the keyboard: the target takes the focus, Enter or Space hits it
  target.addEventListener(
    "keydown",
    event => {
      if (ready && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        hit(event);
      }
    },
    { signal: run.signal }
  );
  place();
  return run.stop;
}
