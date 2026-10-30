// tracking, small helpers: bounds, draw, move, round, and 2 more.
import {
  TRACKING_BALLS,
  TRACKING_LIVES,
  TRACKING_MAX,
  makeBalls,
  pickTargets,
  stepBalls,
  trackingSpeed
} from "../logic.js";
import { t } from "../../../../app/browser-i18n.js";

export const bounds = game => ({
  width: game.field.clientWidth,
  height: game.field.clientHeight,
  radius: RADIUS
});

export function draw(game) {
  for (const [index, node] of game.nodes.entries()) {
    node.style.transform = `translate(${game.balls[index].x - RADIUS}px, ${game.balls[index].y - RADIUS}px)`;
  }
}

/** The balls move for `duration` ms, frame after frame. */
export function move(game, duration) {
  return new Promise(resolve => {
    let last = performance.now();
    const end = last + duration;
    const frame = now => {
      if (game.run.stopped) {
        return;
      }
      stepBalls(game.balls, Math.min((now - last) / 1000, 0.05), game.bounds());
      last = now;
      game.draw();
      if (now >= end) {
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  });
}

export async function round(game) {
  game.balls = makeBalls(TRACKING_BALLS, game.bounds(), trackingSpeed(game.following), game.random);
  game.lit = pickTargets(TRACKING_BALLS, game.following, game.random);
  game.picked = new Set();
  for (const [index, node] of game.nodes.entries()) {
    node.className = `rx-ball${game.lit.has(index) ? " hot" : ""}`;
  }
  game.draw();
  game.phase = "watch";
  game.status.textContent = t("Remember the lit balls ({count})", { count: game.following });
  game.hud.count(game.following, null, "eye");
  game.hud.lives(game.lives, TRACKING_LIVES);
  await game.run.wait(SHOWN);
  for (const node of game.nodes) {
    node.classList.remove("hot");
  }
  game.phase = "move";
  game.status.textContent = t("Follow them with your eyes");
  await game.move(MOVING);
  game.phase = "pick";
  game.status.textContent = t("Touch the balls you followed ({count})", { count: game.following });
}

export async function judge(game) {
  game.phase = "result";
  const right = [...game.picked].every(index => game.lit.has(index));
  for (const [index, node] of game.nodes.entries()) {
    node.classList.toggle("hot", game.lit.has(index));
    node.classList.toggle("picked", game.picked.has(index));
    node.classList.toggle("wrong", game.picked.has(index) && !game.lit.has(index));
  }
  if (right) {
    game.best = game.following;
    game.status.textContent = t("Found them all!");
    await game.run.wait(1400);
    if (game.following >= TRACKING_MAX) {
      game.finish(game.best);
      return;
    }
    game.following += 1;
  } else {
    game.lives -= 1;
    game.hud.lives(game.lives, TRACKING_LIVES);
    game.status.textContent = t("Not quite. Lives left: {lives}", { lives: game.lives });
    await game.run.wait(1800);
    if (game.lives === 0) {
      game.finish(game.best);
      return;
    }
  }
  game.round();
}

export function press(game, event) {
  const node = event.target.closest("[data-ball]");
  if (!node || game.phase !== "pick") {
    return;
  }
  const index = Number(node.dataset.ball);
  if (game.picked.has(index)) {
    game.picked.delete(index);
  } else if (game.picked.size < game.following) {
    game.picked.add(index);
  }
  node.classList.toggle("picked", game.picked.has(index));
  if (game.picked.size === game.following) {
    game.judge();
  }
}

const RADIUS = 16;

const SHOWN = 2200;

const MOVING = 5000;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { bounds, draw, move, round, judge, press };
