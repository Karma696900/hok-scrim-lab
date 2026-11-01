// The skills of the player's hero, in an arc around the attack button as in the game. The owner's rule: the AI
// always casts the skills, never the player ("compétences toujours lancées par ia jamais l'utilisateur"), so the arc
// is not made of buttons. It shows each skill's picture (from the hero's Camp sheet, loaded in the background), a dark
// sweep and the seconds left while it recharges (the frame's `cooldowns`), and a flash when the AI casts it (the
// frame's casts of the player's hero). Places on the arc are set through the style object (no style attribute).
import { t } from "../../app/browser-i18n.js";
import { esc } from "./simulation-shared.js";

// the three skills of most heroes, measured on the owner's captures of the game: the distance from the centre of the
// attack button in screen widths, and the angle (0° to the right, 90° up)
const ARC = [
  { radius: 0.215, degrees: 181 },
  { radius: 0.185, degrees: 152 },
  { radius: 0.17, degrees: 124 }
];
// a fourth skill: the same arc, spread from the first place to this angle and distance
const LAST = { radius: 0.17, degrees: 112 };
const FLASH_MS = 450;

const skillName = key =>
  key === "ult" ? t("Ultimate") : `${t("Skills")} ${esc(key.replace(/^s/, ""))}`;

const spotOf = ({ radius, degrees }) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
};

/** Where each of `count` skills sits from the centre of the attack, in screen widths (up is positive), as in the game. */
export function arcSpots(count) {
  if (count <= ARC.length) {
    return ARC.slice(0, count).map(spotOf);
  }
  const [first] = ARC;
  return Array.from({ length: count }, (_, index) => {
    const share = index / (count - 1);
    return spotOf({
      radius: first.radius + (LAST.radius - first.radius) * share,
      degrees: first.degrees + (LAST.degrees - first.degrees) * share
    });
  });
}

/**
 * What a skill shows with `left` seconds of cooldown, given what it showed before (`previous`, or null): the whole
 * cooldown is the value it had when it went down (or grew again: a new cast), the sweep the share left of it.
 */
export function coolState(previous, left) {
  if (!(left > 0)) {
    return { left: 0, full: 0, share: 0, label: "" };
  }
  const full = previous && previous.left > 0 && left <= previous.left ? previous.full : left;
  return {
    left,
    full,
    share: Math.round((left / full) * 100) / 100,
    label: left < 1 ? left.toFixed(1) : String(Math.ceil(left))
  };
}

/** The arc of the player's hero's skills (`me.skills`, the engine's keys), the ultimate last. */
export function skillsArcHtml(me) {
  const keys = (me.skills ?? []).filter(key => key !== "passive");
  const ordered = [...keys.filter(key => key !== "ult"), ...keys.filter(key => key === "ult")];
  return `<div class="sim-arc" role="group" aria-label="${esc(t("Skills, cast by the AI"))}">${ordered
    .map(
      key =>
        `<span class="sim-arc__skill${key === "ult" ? " sim-arc__skill--ult" : ""}" data-skill="${esc(key)}" role="img" aria-label="${skillName(key)}"><span class="sim-arc__face"><b>${key === "ult" ? "U" : esc(key.replace(/^s/, ""))}</b></span><b class="sim-arc__time" hidden></b></span>`
    )
    .join("")}</div>`;
}

/** Puts the skills on their arc and keeps their elements (run.arc), once the board is drawn. */
export function bindSkills(run) {
  const skills = [...run.layer.querySelectorAll(".sim-arc__skill")];
  const spots = arcSpots(skills.length);
  run.arc = new Map();
  skills.forEach((element, index) => {
    element.style.setProperty("--x", spots[index].x.toFixed(4));
    element.style.setProperty("--y", spots[index].y.toFixed(4));
    run.arc.set(element.dataset.skill, {
      element,
      time: element.querySelector(".sim-arc__time"),
      face: element.querySelector(".sim-arc__face"),
      state: null,
      flashUntil: 0,
      icon: ""
    });
  });
}

function paintIcon(run, key, entry) {
  const url = run.icons.get(run.heroIdOf.get(run.me.id))?.[key];
  if (url && entry.icon !== url) {
    entry.icon = url;
    entry.face.innerHTML = `<img src="${esc(url)}" alt="" width="56" height="56" decoding="async">`;
  }
}

/** Each frame: the cooldowns of the player's hero, the flash of what the AI just cast. `casts` are the new casts. */
export function paintSkills(run, view, casts, now) {
  if (!run.arc?.size) {
    return;
  }
  for (const cast of casts) {
    const entry = cast.hero === run.me.id && run.arc.get(cast.key);
    if (entry) {
      entry.flashUntil = now + FLASH_MS;
    }
  }
  const me = view.heroes.find(hero => hero.id === run.me.id);
  for (const [key, entry] of run.arc) {
    paintIcon(run, key, entry);
    const state = coolState(entry.state, me?.alive ? (me.cooldowns?.[key] ?? 0) : 0);
    entry.state = state;
    entry.element.classList.toggle("is-cooling", state.left > 0);
    entry.element.classList.toggle("is-cast", entry.flashUntil > now);
    entry.element.classList.toggle("is-off", !me?.alive);
    entry.element.style.setProperty("--sweep", String(state.share));
    entry.time.hidden = !state.label;
    if (entry.time.textContent !== state.label) {
      entry.time.textContent = state.label;
    }
  }
}
