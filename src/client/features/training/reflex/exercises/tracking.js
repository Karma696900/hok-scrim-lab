// Tracking: some of the balls light up, then every ball looks the same and they all move. When they
// stop, touch the ones that were lit. One more ball to follow at each level; three lives. The score
// is the most balls you followed without a mistake.
import { t } from "../../../../app/browser-i18n.js";
import { TRACKING_BALLS, TRACKING_LIVES, TRACKING_START } from "../logic.js";
import { createRun } from "./frame.js";
import { noHud } from "../hud.js";
import { bindTo } from "../../../../../shared/bind-to.js";
import { onView as trackingParts } from "./tracking-parts.js";

export function startTracking({ stage, finish, random, hud = noHud }) {
  const game = { random, hud, finish };
  bindTo(game, trackingParts);
  game.run = createRun(stage);
  game.following = TRACKING_START;
  game.lives = TRACKING_LIVES;
  game.best = 0;
  game.phase = "idle";
  game.balls = [];
  game.lit = new Set();
  game.picked = new Set();

  stage.innerHTML = `<p class="rx-status" role="status" aria-live="polite"></p><div class="rx-field">${Array.from(
    { length: TRACKING_BALLS },
    (_, index) =>
      `<button type="button" class="rx-ball" data-ball="${index}" aria-label="${t("Ball {number}", { number: index + 1 })}"></button>`
  ).join("")}</div>`;
  game.status = stage.querySelector(".rx-status");
  game.field = stage.querySelector(".rx-field");
  game.nodes = [...game.field.querySelectorAll(".rx-ball")];

  game.field.addEventListener("pointerdown", game.press, { signal: game.run.signal });
  game.field.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        game.press(event);
      }
    },
    { signal: game.run.signal }
  );
  game.round();
  return game.run.stop;
}
