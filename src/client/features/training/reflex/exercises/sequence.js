// Sequence memory: pads light up one after the other, then you repeat the order. Each level adds a
// pad. The score is the longest sequence repeated without a mistake.
import { t } from "../../../../app/browser-i18n.js";
import { SEQUENCE_PADS, extendSequence } from "../logic.js";
import { createRun } from "./frame.js";
import { noHud } from "../hud.js";

const ON = 450;
const OFF = 180;

export function startSequence({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  let sequence = [];
  let at = 0;
  let listening = false;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p><div class="rx-pads">${Array.from(
    { length: SEQUENCE_PADS },
    (_, pad) =>
      `<button type="button" class="rx-pad-cell" data-pad="${pad}" aria-label="${t("Pad {number}", { number: pad + 1 })}"></button>`
  ).join("")}</div>`;
  const status = stage.querySelector(".rx-status");
  const pads = [...stage.querySelectorAll(".rx-pad-cell")];

  async function flash(pad, duration) {
    pads[pad].classList.add("lit");
    await run.wait(duration);
    pads[pad].classList.remove("lit");
  }

  async function level() {
    sequence = extendSequence(sequence, random);
    at = 0;
    listening = false;
    status.textContent = t("Level {level}: watch", { level: sequence.length });
    hud.count(sequence.length, null, "grid");
    await run.wait(700);
    for (const pad of sequence) {
      await flash(pad, ON);
      await run.wait(OFF);
    }
    status.textContent = t("Level {level}: your turn", { level: sequence.length });
    listening = true;
  }

  async function press(event) {
    const pad = Number(event.target.closest("[data-pad]")?.dataset.pad);
    if (!listening || Number.isNaN(pad)) {
      return;
    }
    if (pad !== sequence[at]) {
      listening = false;
      pads[pad].classList.add("wrong");
      status.textContent = t("Wrong pad");
      await run.wait(1000);
      finish(sequence.length - 1);
      return;
    }
    flash(pad, 160);
    at += 1;
    if (at === sequence.length) {
      listening = false;
      status.textContent = t("Level {level} done", { level: sequence.length });
      await run.wait(600);
      level();
    }
  }

  stage.addEventListener("pointerdown", press, { signal: run.signal });
  stage.addEventListener(
    "keydown",
    event => {
      if ((event.key === " " || event.key === "Enter") && event.target.matches("[data-pad]")) {
        event.preventDefault();
        press(event);
      }
    },
    { signal: run.signal }
  );
  level();
  return run.stop;
}
