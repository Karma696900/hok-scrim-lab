// Reaction time: the pad is red; when it turns green, hit it as fast as you can. Five rounds; the
// score is the average time in milliseconds. A hit before the green does not count, the round is
// played again.
import { t } from "../../../../app/browser-i18n.js";
import { average } from "../logic.js";
import { createRun, eventTime } from "./frame.js";
import { noHud } from "../hud.js";

const ROUNDS = 5;
const SOONEST = 1500;
const LATEST = 4500;

export function startReaction({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const times = [];
  let state = "wait";
  let shownAt = 0;
  let timer = 0;

  stage.innerHTML = `<button type="button" class="rx-pad" data-state="wait"><b></b><small></small></button>`;
  const pad = stage.querySelector(".rx-pad");
  const heading = pad.querySelector("b");
  const detail = pad.querySelector("small");
  const show = (next, title, note = "") => {
    state = next;
    pad.dataset.state = next;
    heading.textContent = title;
    detail.textContent = note;
  };

  function round() {
    show(
      "wait",
      t("Wait for green…"),
      t("Round {round} of {rounds}", { round: times.length + 1, rounds: ROUNDS })
    );
    hud.count(times.length + 1, ROUNDS);
    hud.progress(times.length / ROUNDS);
    timer = run.after(SOONEST + random() * (LATEST - SOONEST), async () => {
      await run.frame();
      shownAt = performance.now();
      show("go", t("Click now!"));
    });
  }

  function press(event) {
    if (state === "wait") {
      run.cancel(timer);
      show("soon", t("Too soon!"), t("Wait for the green. This round is played again."));
      run.after(1400, round);
    } else if (state === "go") {
      const time = Math.max(1, Math.round(eventTime(event) - shownAt));
      times.push(time);
      hud.progress(times.length / ROUNDS);
      show(
        "hit",
        `${time} ms`,
        t("Round {round} of {rounds}", { round: times.length, rounds: ROUNDS })
      );
      run.after(1000, () => (times.length === ROUNDS ? finish(average(times)) : round()));
    }
  }

  pad.addEventListener("pointerdown", press, { signal: run.signal });
  pad.addEventListener(
    "keydown",
    event => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        press(event);
      }
    },
    { signal: run.signal }
  );
  pad.focus({ preventScroll: true });
  round();
  return run.stop;
}
