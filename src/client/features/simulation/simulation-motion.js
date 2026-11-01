// The dots move smoothly although the bots server sends ten frames a second: each hero glides from where it is drawn
// to where the last frame put it, over one frame's time. The player's own hero moves at once with its stick, at its
// speed (a prediction), then eases toward where the server has it, or jumps there when the two are far apart (a
// wall, a death, a teleport). Positions are the map's pixels; simulation-paint.js turns them for the red side. The
// camera then follows the player's hero (simulation-camera.js).
import { followCamera } from "./simulation-camera.js";
import { place } from "./simulation-paint.js";

const FRAME_MS = 100;
// farther than this between two frames is a jump (a respawn, a teleport): no glide
const JUMP = 80;
// a prediction this far from the server is dropped for the server's place
const SNAP = 24;

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A frame put hero `id` at `pos`: it glides there from where it is drawn. */
export function glideTo(run, id, pos, now) {
  const entry = run.glide.get(id);
  const drawn = entry?.drawn ?? pos;
  const from = gap(drawn, pos) > JUMP ? pos : drawn;
  run.glide.set(id, { from, to: [...pos], at: now, drawn: from });
}

// the stick in the map's directions, or null at rest
function worldStick(run) {
  const stick = run.stick?.now;
  if (!stick || (!stick[0] && !stick[1])) {
    return null;
  }
  return run.side === "red" ? [-stick[0], -stick[1]] : stick;
}

function predict(run, entry, now) {
  const speed = run.start.me?.speed ?? 0;
  const dt = Math.min(0.1, Math.max(0, (now - (run.movedAt ?? now)) / 1000));
  const stick = worldStick(run);
  let pos = entry.drawn;
  let goal = entry.to;
  if (stick && speed > 0) {
    pos = [pos[0] + stick[0] * speed * dt, pos[1] + stick[1] * speed * dt];
    // where the server will have it by now, had it kept walking since its frame
    const ahead = Math.min(0.2, (now - entry.at) / 1000) * speed;
    goal = [entry.to[0] + stick[0] * ahead, entry.to[1] + stick[1] * ahead];
  }
  if (gap(pos, goal) > SNAP) {
    return [...entry.to];
  }
  return lerp(pos, goal, stick ? 0.1 : 0.25);
}

/** Every screen frame: each shown dot where it is on its glide, the player's own where it is predicted. */
export function moveDots(run, now) {
  for (const [id, entry] of run.glide) {
    const dot = run.dots.get(id);
    if (!dot || dot.hidden) {
      continue;
    }
    entry.drawn =
      id === run.me.id && run.stick
        ? predict(run, entry, now)
        : lerp(entry.from, entry.to, Math.min(1, (now - entry.at) / FRAME_MS));
    place(dot, entry.drawn, run.side);
  }
  run.movedAt = now;
  if (run.camera) {
    followCamera(run);
  }
}
