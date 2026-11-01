// The player's hands on a game (docs of the bots server: the game played by hand). Bottom left, a joystick held by
// the finger or the mouse (W A S D or Z Q S D, and the arrows, by their place on the keyboard); bottom right the
// attack (the enemy hero in reach with the least health; Space), the minions and monsters (E) and the towers (R),
// and the portraits of the enemies the hero sees, each a lock on that hero (1 to 5). The skills are cast by the AI.
// The stick goes to the bots server when its direction changes and at most ten times a second while held; the map
// turns for the red side, so the stick does too.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { esc, heroName, portrait } from "./simulation-shared.js";

const SEND_EVERY_MS = 100;
// a stick that turned less than this (or changed its length less) is the same direction
const SAME = 0.08;
const KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0]
};
const AIMS = { Space: "auto", KeyE: "minion", KeyR: "tower" };

/** The joystick and the attack buttons, laid over the bottom corners; `spell` (the spell's button) beside the attack. */
export function controlsHtml(spell = "") {
  return `<div class="sim-stick-zone" data-stick-zone><div class="sim-stick" data-stick role="group" aria-label="${esc(t("Move: hold and drag, or W A S D"))}"><span class="sim-stick__knob"></span></div></div>
  <div class="sim-strike" role="group" aria-label="${esc(t("Attack"))}">
    <div class="sim-avatars" aria-label="${esc(t("Enemies in sight"))}"></div>
    <button type="button" class="sim-aim sim-aim--minion" data-sim="aim" data-kind="minion" aria-label="${esc(t("Minions and monsters"))} (E)" title="${esc(t("Minions and monsters"))} (E)">${icon("users")}</button>
    <button type="button" class="sim-aim sim-aim--tower" data-sim="aim" data-kind="tower" aria-label="${esc(t("Towers"))} (R)" title="${esc(t("Towers"))} (R)">${icon("shield")}</button>
    <button type="button" class="sim-aim sim-aim--attack" data-sim="aim" data-kind="auto" aria-label="${esc(t("Attack"))} (Space)" title="${esc(t("Attack"))} (Space)">${icon("swords")}</button>
    ${spell}
  </div>`;
}

/** The portraits of the enemies in sight, as lock buttons (the one locked pressed). */
export function avatarsHtml(heroes, enemies, locked) {
  return enemies
    .map(
      (enemy, index) =>
        `<button type="button" class="sim-avatar" data-sim="aim" data-kind="${esc(enemy.id)}" aria-pressed="${enemy.id === locked}" aria-label="${esc(t("Target {hero}", { hero: heroName(heroes, enemy.heroId) }))} (${index + 1})">${portrait(heroes, enemy.heroId, 32)}</button>`
    )
    .join("");
}

const length = ([x, y]) => Math.hypot(x, y);

// the stick in the map's own directions (the board of the red side is turned half a turn)
const toWorld = (run, [x, y]) => (run.side === "red" ? [-x, -y] : [x, y]);

/**
 * Sends the stick when it changed enough: at once when it starts or stops, else at most every SEND_EVERY_MS (a
 * change in between goes with the next tick of bindStick's timer).
 */
function sendStick(run, stick, now = performance.now()) {
  const last = run.stick.sent;
  const moved = Math.abs(stick[0] - last[0]) + Math.abs(stick[1] - last[1]) > SAME;
  const stopped = length(stick) === 0 && length(last) > 0;
  const due = now - run.stick.sentAt >= SEND_EVERY_MS || length(last) === 0;
  run.stick.now = stick;
  if (stopped || (moved && due)) {
    run.stick.sent = stick;
    run.stick.sentAt = now;
    const [x, y] = toWorld(run, stick).map(v => Math.round(v * 1000) / 1000);
    run.send({ type: "move", x, y });
  }
}

function knobAt(run, stick) {
  const knob = run.stick.knob;
  knob.style.setProperty("--x", `${(stick[0] * 50).toFixed(1)}%`);
  knob.style.setProperty("--y", `${(stick[1] * 50).toFixed(1)}%`);
}

function fromPointer(base, event) {
  const box = base.getBoundingClientRect();
  const radius = box.width / 2;
  const dx = (event.clientX - (box.left + radius)) / radius;
  const dy = (event.clientY - (box.top + radius)) / radius;
  const size = Math.hypot(dx, dy);
  return size > 1 ? [dx / size, dy / size] : [dx, dy];
}

/**
 * How far the ring moves so that its centre comes under the finger (`rest` its centre at rest, `finger` the touch,
 * both in screen pixels), kept whole on the `width` x `height` screen. The game's stick floats this way.
 */
export function floatShift({ rest, finger, radius, width, height }) {
  const keep = (value, size) => Math.min(Math.max(value, radius), size - radius);
  return [
    Math.round(keep(finger[0], width) - rest[0]),
    Math.round(keep(finger[1], height) - rest[1])
  ];
}

function shiftRing(base, shift) {
  base.style.setProperty("--sx", `${shift[0]}px`);
  base.style.setProperty("--sy", `${shift[1]}px`);
}

function bindStick(run, base, zone) {
  let pointer = null;
  const set = stick => {
    knobAt(run, stick);
    sendStick(run, stick);
  };
  zone.addEventListener("pointerdown", event => {
    if (pointer !== null) {
      return;
    }
    pointer = event.pointerId;
    try {
      zone.setPointerCapture?.(pointer);
    } catch {
      // a pointer already gone: the stick still follows it while it lasts
    }
    base.classList.add("is-held");
    const box = base.getBoundingClientRect();
    const radius = box.width / 2;
    shiftRing(
      base,
      floatShift({
        rest: [box.left + radius, box.top + radius],
        finger: [event.clientX, event.clientY],
        radius,
        width: innerWidth,
        height: innerHeight
      })
    );
    set(fromPointer(base, event));
    event.preventDefault();
  });
  zone.addEventListener("pointermove", event => {
    if (event.pointerId === pointer) {
      set(fromPointer(base, event));
    }
  });
  const release = event => {
    if (event.pointerId === pointer) {
      pointer = null;
      base.classList.remove("is-held");
      shiftRing(base, [0, 0]);
      set([0, 0]);
    }
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
  // the change that came too soon after the last one goes now
  run.stick.timer = setInterval(() => sendStick(run, run.stick.now), SEND_EVERY_MS);
}

function keyStick(held) {
  let x = 0;
  let y = 0;
  for (const code of held) {
    x += KEYS[code][0];
    y += KEYS[code][1];
  }
  const size = Math.hypot(x, y);
  return size ? [x / size, y / size] : [0, 0];
}

function bindKeys(run) {
  const held = new Set();
  const typing = event => event.target.closest?.("input, textarea, select, [contenteditable]");
  run.onKeyDown = event => {
    if (typing(event) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (KEYS[event.code]) {
      event.preventDefault();
      held.add(event.code);
      knobAt(run, keyStick(held));
      sendStick(run, keyStick(held));
      return;
    }
    if (event.repeat) {
      return;
    }
    const digit = /^Digit([1-5])$/.exec(event.code);
    const kind = AIMS[event.code] ?? (digit && run.avatarIds[Number(digit[1]) - 1]);
    if (kind) {
      event.preventDefault();
      run.send({ type: "target", kind });
    }
  };
  run.onKeyUp = event => {
    if (held.delete(event.code)) {
      knobAt(run, keyStick(held));
      sendStick(run, keyStick(held));
    }
  };
  document.addEventListener("keydown", run.onKeyDown);
  document.addEventListener("keyup", run.onKeyUp);
}

/** Binds the stick, the keys and the buttons of a game played by hand. */
export function bindControls(run) {
  const base = run.layer.querySelector("[data-stick]");
  run.stick = {
    now: [0, 0],
    sent: [0, 0],
    sentAt: 0,
    knob: base.firstElementChild,
    timer: 0
  };
  run.avatarIds = [];
  run.avatarKey = "";
  run.avatars = run.layer.querySelector(".sim-avatars");
  bindStick(run, base, run.layer.querySelector("[data-stick-zone]"));
  bindKeys(run);
}

/** Lets go of the keys and the timer when the game is over or left. */
export function unbindControls(run) {
  clearInterval(run.stick?.timer);
  if (run.onKeyDown) {
    document.removeEventListener("keydown", run.onKeyDown);
    document.removeEventListener("keyup", run.onKeyUp);
  }
}

/** The portraits of the enemies the hero sees (within its sight), and the target marked on the map. */
export function paintControls(run, state, view) {
  const me = view.heroes.find(hero => hero.id === run.me.id);
  const sight = run.start.me.sight ?? Infinity;
  const enemies = me
    ? view.heroes
        .filter(h => h.side !== run.side && h.alive)
        .filter(h => Math.hypot(h.pos[0] - me.pos[0], h.pos[1] - me.pos[1]) <= sight)
        .slice(0, 5)
    : [];
  const locked = state.target?.kind === "hero" ? state.target.id : null;
  const key = `${enemies.map(e => e.id).join()}|${locked}`;
  if (key !== run.avatarKey) {
    run.avatarKey = key;
    run.avatarIds = enemies.map(e => e.id);
    run.avatars.innerHTML = avatarsHtml(run.heroes, enemies, locked);
  }
  const targetId = state.target ? `${state.target.kind}:${state.target.id}` : "";
  if (targetId !== run.targetId) {
    run.layer.querySelector(".is-target")?.classList.remove("is-target");
    run.targetId = targetId;
    const kind = state.target?.kind;
    const mark =
      kind === "hero"
        ? run.dots.get(state.target.id)
        : kind === "wave"
          ? run.waves.get(state.target.id)
          : kind === "tower"
            ? (run.towerMarks.get(state.target.id) ??
              run.layer.querySelector(
                `[data-crystal="${state.target.id.replace("crystal-", "")}"]`
              ))
            : kind === "camp"
              ? run.campMarks.get(state.target.id)
              : null;
    mark?.classList.add("is-target");
  }
}
