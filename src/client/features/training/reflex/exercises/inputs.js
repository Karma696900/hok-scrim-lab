// Skill keys: four skills to press in the order shown, as fast as you can, with the keys 1 to 4 (or
// by touch). Fifteen prompts. The score is the average time for one prompt, in milliseconds; a wrong
// key adds 300 ms.
import { t } from "../../../../app/browser-i18n.js";
import { INPUT_KEYS, INPUT_PROMPTS, INPUT_WRONG, average, inputPrompt } from "../logic.js";
import { createRun, eventTime } from "./frame.js";
import { noHud } from "../hud.js";

export function startInputs({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const times = [];
  let keys = [];
  let at = 0;
  let penalty = 0;
  let shownAt = 0;
  let ready = false;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p>
    <ol class="rx-prompt" aria-label="${t("Skills to press, in order")}"></ol>
    <div class="rx-keys">${Array.from({ length: INPUT_KEYS }, (_, index) => `<button type="button" class="rx-key" data-key="${index + 1}" aria-label="${t("Skill {number}", { number: index + 1 })}">${index + 1}</button>`).join("")}</div>`;
  const status = stage.querySelector(".rx-status");
  const prompt = stage.querySelector(".rx-prompt");

  async function deal() {
    keys = inputPrompt(random);
    at = 0;
    penalty = 0;
    ready = false;
    prompt.innerHTML = keys
      .map((key, index) => `<li data-state="${index === 0 ? "now" : "next"}">${key}</li>`)
      .join("");
    stage.dataset.expect = String(keys[0]);
    hud.count(times.length + 1, INPUT_PROMPTS);
    hud.progress(times.length / INPUT_PROMPTS);
    status.textContent = t("Prompt {done} of {total}", {
      done: times.length + 1,
      total: INPUT_PROMPTS
    });
    await run.frame();
    shownAt = performance.now();
    ready = true;
  }

  function press(key, event) {
    if (!ready) {
      return;
    }
    const steps = prompt.children;
    if (key !== keys[at]) {
      penalty += INPUT_WRONG;
      steps[at].classList.add("wrong");
      run.after(160, () => steps[at]?.classList.remove("wrong"));
      return;
    }
    steps[at].dataset.state = "done";
    at += 1;
    if (at < keys.length) {
      steps[at].dataset.state = "now";
      stage.dataset.expect = String(keys[at]);
      return;
    }
    ready = false;
    times.push(Math.max(1, Math.round(eventTime(event) - shownAt)) + penalty);
    run.after(180, () => (times.length === INPUT_PROMPTS ? finish(average(times)) : deal()));
  }

  document.addEventListener(
    "keydown",
    event => {
      if (!event.repeat && /^[1-4]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
        press(Number(event.key), event);
      }
    },
    { signal: run.signal }
  );
  stage.addEventListener(
    "pointerdown",
    event => {
      const button = event.target.closest("[data-key]");
      if (button) {
        press(Number(button.dataset.key), event);
      }
    },
    { signal: run.signal }
  );
  deal();
  return run.stop;
}
