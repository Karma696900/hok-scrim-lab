// The chimp test: numbers are scattered on a board. Touch them in order; once you touch the 1, the
// others are hidden and you must remember where they were. Three strikes. The score is the most
// numbers you cleared on a board.
import { t } from "../../../../app/browser-i18n.js";
import { CHIMP_COLUMNS, CHIMP_ROWS, CHIMP_START, CHIMP_STRIKES, chimpBoard } from "../logic.js";
import { createRun } from "./frame.js";
import { noHud } from "../hud.js";

export function startChimp({ stage, finish, random, hud = noHud }) {
  const run = createRun(stage);
  const cells = CHIMP_COLUMNS * CHIMP_ROWS;
  let count = CHIMP_START;
  let cleared = 0;
  let strikes = 0;
  let next = 1;
  let locked = false;

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p><div class="rx-chimp"></div>`;
  const status = stage.querySelector(".rx-status");
  const board = stage.querySelector(".rx-chimp");

  function deal() {
    const numbers = new Map(chimpBoard(count, random).map(entry => [entry.cell, entry.number]));
    next = 1;
    locked = false;
    board.classList.remove("rx-hidden");
    board.innerHTML = Array.from({ length: cells }, (_, cell) =>
      numbers.has(cell)
        ? `<button type="button" class="rx-num" data-n="${numbers.get(cell)}" aria-label="${t("Number {number}", { number: numbers.get(cell) })}">${numbers.get(cell)}</button>`
        : `<span class="rx-void"></span>`
    ).join("");
    status.textContent = t("Touch 1 to {count} in order", { count });
    hud.count(count, null, "hash");
    hud.lives(CHIMP_STRIKES - strikes, CHIMP_STRIKES);
  }

  async function press(event) {
    const button = event.target.closest("[data-n]");
    if (!button || locked || button.classList.contains("done")) {
      return;
    }
    if (Number(button.dataset.n) === next) {
      button.classList.add("done");
      if (next === 1) {
        board.classList.add("rx-hidden");
      }
      next += 1;
      if (next > count) {
        locked = true;
        cleared = count;
        status.textContent = t("Cleared: 1 to {count}", { count });
        await run.wait(700);
        if (count >= cells) {
          finish(cleared);
          return;
        }
        count += 1;
        deal();
      }
      return;
    }
    locked = true;
    strikes += 1;
    hud.lives(CHIMP_STRIKES - strikes, CHIMP_STRIKES);
    button.classList.add("wrong");
    board.classList.remove("rx-hidden");
    status.textContent = t("Strike {strikes} of {max}", { strikes, max: CHIMP_STRIKES });
    await run.wait(1100);
    if (strikes >= CHIMP_STRIKES) {
      finish(cleared);
    } else {
      deal();
    }
  }

  board.addEventListener("pointerdown", press, { signal: run.signal });
  board.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        press(event);
      }
    },
    { signal: run.signal }
  );
  deal();
  return run.stop;
}
