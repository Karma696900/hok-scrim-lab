// The minions of the waves the side sees, one dot each with the picture of its kind (melee, mage, ballista, cannon,
// super, and the dragons of the Overlord: sent by the bots server in its start message, `art`), in a column on their
// lane: the front one at the
// wave's point, the others behind it towards their own base, a little to each side in turn. Each dot has its health
// bar. A new wave appears in 2 seconds where it spawns (the frame says how long it still spawns), then walks. The
// front dot is the wave's mark for the player's target (simulation-controls.js). With no picture (an older server),
// a dot of the side's colour.
import { placeAt } from "./simulation-hud.js";

/** Map pixels between two minions of a wave, and how far each steps to the side of the lane in turn. */
export const MINION_GAP = 14;
const SIDESTEP = 3;
const SPAWN_SECONDS = 2;

function trackOf(points) {
  const at = [0];
  for (let i = 1; i < points.length; i += 1) {
    at.push(
      at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  return { points, at, length: at[at.length - 1] };
}

function pointAt(track, s) {
  const clamped = Math.max(0, Math.min(track.length, s));
  let i = 1;
  while (i < track.at.length - 1 && track.at[i] < clamped) {
    i += 1;
  }
  const span = track.at[i] - track.at[i - 1] || 1;
  const t = (clamped - track.at[i - 1]) / span;
  const [a, b] = [track.points[i - 1], track.points[i]];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Where `point` lies along the track (distance from its blue end to the nearest point of the lane). */
function placeOn(track, point) {
  let best = { s: 0, gap: Infinity };
  for (let i = 1; i < track.points.length; i += 1) {
    const [a, b] = [track.points[i - 1], track.points[i]];
    const span = track.at[i] - track.at[i - 1] || 1;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / span ** 2
      )
    );
    const gap = Math.hypot(
      a[0] + (b[0] - a[0]) * t - point[0],
      a[1] + (b[1] - a[1]) * t - point[1]
    );
    if (gap < best.gap) {
      best = { s: track.at[i - 1] + span * t, gap };
    }
  }
  return best.s;
}

const tracks = new WeakMap();

/** The map points of the `count` minions of a wave of `side` whose front stands at `at` on the lane `points`. */
export function minionSpots(points, at, side, count) {
  let track = tracks.get(points);
  if (!track) {
    track = trackOf(points);
    tracks.set(points, track);
  }
  const s = placeOn(track, at);
  const back = side === "blue" ? -1 : 1;
  const spots = [[at[0], at[1]]];
  for (let i = 1; i < count; i += 1) {
    const here = s + back * MINION_GAP * i;
    const [x, y] = pointAt(track, here);
    const ahead = pointAt(track, here + 1);
    const behind = pointAt(track, here - 1);
    const dx = ahead[0] - behind[0];
    const dy = ahead[1] - behind[1];
    const length = Math.hypot(dx, dy) || 1;
    const step = i % 2 ? SIDESTEP : -SIDESTEP;
    spots.push([x - (dy / length) * step, y + (dx / length) * step]);
  }
  return spots;
}

function minionMark(run, wave) {
  const mark = document.createElement("span");
  mark.className = `sim-minion sim-minion--${wave.side === run.side ? "ally" : "enemy"}`;
  mark.innerHTML = `<span class="sim-minion__face"></span><span class="sim-bar sim-bar--minion"><i></i></span>`;
  const face = mark.firstElementChild;
  if (wave.spawning > 0) {
    // the 2 s of its spawn already gone are skipped: the dot appears as far along as the wave is
    face.classList.add("is-spawning");
    face.style.animationDelay = `${(wave.spawning - SPAWN_SECONDS).toFixed(2)}s`;
  }
  run.layerOf.dots.prepend(mark);
  return mark;
}

/**
 * The size of a minion's dot: the siege and super minions a little larger, the Overlord Vanguard larger still, the
 * Shadow Vanguard the largest.
 */
export const minionSize = kind =>
  kind === "shadow-vanguard"
    ? "shadow"
    : kind === "vanguard"
      ? "dragon"
      : kind === "melee" || kind === "ranged"
        ? ""
        : "siege";

function paintMinion(run, mark, wave, minion) {
  if (mark.dataset.kind !== minion.kind) {
    mark.dataset.kind = minion.kind;
    const size = minionSize(minion.kind);
    for (const kind of ["siege", "dragon", "shadow"]) {
      mark.classList.toggle(`sim-minion--${kind}`, size === kind);
    }
    const picture = run.start?.art?.[`${wave.side}-${minion.kind}`];
    const face = mark.firstElementChild;
    face.replaceChildren();
    // only a WebP picture sent whole as a data address is drawn
    if (typeof picture === "string" && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(picture)) {
      const image = document.createElement("img");
      image.alt = "";
      image.decoding = "async";
      image.src = picture;
      face.append(image);
    }
  }
  const fill = mark.lastElementChild.firstElementChild;
  const percent = String(Math.round(Math.max(0, Math.min(1, minion.hp ?? 1)) * 100));
  if (fill.dataset.p !== percent) {
    fill.dataset.p = percent;
    fill.style.setProperty("--p", percent);
  }
}

/** The minions of the waves `view` holds; the marks of the waves gone and of the minions fallen are taken off. */
export function paintWaves(run, view) {
  run.minionMarks ??= new Map();
  const seen = new Set();
  for (const wave of view.waves) {
    seen.add(wave.id);
    // a wave without its list of minions (an older server) is one dot
    const minions = wave.minions?.length ? wave.minions : [{ kind: "melee", hp: 1 }];
    const marks = run.minionMarks.get(wave.id) ?? [];
    while (marks.length < minions.length) {
      marks.push(minionMark(run, wave));
    }
    // the front minions fall first: the dots taken off are the front ones, the others keep their picture
    while (marks.length > minions.length) {
      marks.shift().remove();
    }
    run.minionMarks.set(wave.id, marks);
    run.waves.set(wave.id, marks[0]);
    const lane = run.start?.map?.lanes?.[wave.lane];
    const spots = lane ? minionSpots(lane, wave.at, wave.side, marks.length) : [];
    marks.forEach((mark, i) => {
      paintMinion(run, mark, wave, minions[i]);
      placeAt(mark, spots[i] ?? wave.at, run.side);
    });
  }
  for (const [id, marks] of run.minionMarks) {
    if (!seen.has(id)) {
      for (const mark of marks) {
        mark.remove();
      }
      run.minionMarks.delete(id);
      run.waves.delete(id);
    }
  }
}
