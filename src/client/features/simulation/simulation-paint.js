// Each frame of a game: the dots where they are (only what the player's side sees), the level, health and mana
// over each hero as in the game (health cut every 1000 points; mana for the side's own heroes), the bars of the
// monsters and objectives (none for the minions of a wave), the fog of the field and of the minimap, the towers and
// camps that fell, the picture of each skill seen cast (a third of a second), the heads-up display
// (simulation-hud.js), the clock, and the boxes that open on top. The heroes glide between two frames
// (simulation-motion.js) and the camera follows the player's (simulation-camera.js). Positions and bar lengths go
// through the style object (the page's content policy forbids style attributes).
import { t } from "../../app/browser-i18n.js";
import { eyesMarkup } from "./simulation-map.js";
import { paintControls } from "./simulation-controls.js";
import {
  fillBar,
  healthBar,
  paintCards,
  paintMini,
  paintScoreboard,
  paintTop,
  placeAt,
  share
} from "./simulation-hud.js";
import { glideTo } from "./simulation-motion.js";
import { deathHtml, pauseHtml, questionHtml } from "./simulation-popups.js";
import { clock, esc, portrait } from "./simulation-shared.js";

const CAST_SHOWN_MS = 333;

export { share };

export const setBar = (element, percent) => fillBar(element, percent);

/** Puts `element` at map point `at` on the board of `side`. */
export const place = placeAt;

function dotOf(run, hero) {
  let dot = run.dots.get(hero.id);
  if (!dot) {
    dot = document.createElement("span");
    const mine = hero.id === run.me.id;
    const own = hero.side === run.side;
    dot.className = `sim-dot sim-dot--${own ? "ally" : "enemy"}${mine ? " sim-dot--me" : ""}`;
    const approximate = run.approximate.has(hero.id)
      ? `<em class="sim-dot__approx" title="${esc(t("Approximate data"))}">≈</em>`
      : "";
    const mana = own ? `<span class="sim-bar sim-bar--mana"><i></i></span>` : "";
    dot.innerHTML = `<span class="sim-dot__head"><b class="sim-dot__level">${hero.level ?? 1}</b><span class="sim-dot__bars">${healthBar("")}${mana}</span></span><span class="sim-dot__face">${portrait(run.heroes, hero.heroId, 40)}</span>${approximate}<span class="sim-dot__cast" hidden></span>`;
    run.layerOf.dots.append(dot);
    run.dots.set(hero.id, dot);
  }
  return dot;
}

function paintDot(dot, hero) {
  const [hp, mana] = dot.querySelectorAll(".sim-bar");
  fillBar(hp, share(hero.hp ?? 1, hero.maxHp ?? 1), hero.maxHp ?? 1000);
  if (mana) {
    mana.hidden = hero.mana === null || hero.mana === undefined;
    fillBar(mana, share(hero.mana ?? 0, hero.maxMana ?? 0));
  }
  const level = dot.querySelector(".sim-dot__level");
  if (level && level.textContent !== String(hero.level ?? 1)) {
    level.textContent = String(hero.level ?? 1);
  }
}

/** The heroes the side sees; with `now`, they glide to their place (simulation-motion.js). */
export function paintHeroes(run, view, now) {
  const shown = new Set();
  for (const hero of view.heroes) {
    if (!hero.alive) {
      continue;
    }
    const dot = dotOf(run, hero);
    shown.add(hero.id);
    dot.hidden = false;
    if (now === undefined || !run.glide) {
      place(dot, hero.pos, run.side);
    } else {
      glideTo(run, hero.id, hero.pos, now);
    }
    paintDot(dot, hero);
  }
  for (const [id, dot] of run.dots) {
    if (!shown.has(id)) {
      dot.hidden = true;
    }
  }
}

export function paintWaves(run, view) {
  const seen = new Set(view.waves.map(wave => wave.id));
  for (const wave of view.waves) {
    let mark = run.waves.get(wave.id);
    if (!mark) {
      mark = document.createElement("span");
      mark.className = `sim-wave sim-wave--${wave.side === run.side ? "ally" : "enemy"}`;
      run.layerOf.dots.prepend(mark);
      run.waves.set(wave.id, mark);
    }
    place(mark, wave.at, run.side);
  }
  for (const [id, mark] of run.waves) {
    if (!seen.has(id)) {
      mark.remove();
      run.waves.delete(id);
    }
  }
}

/** Camps and objectives: fallen, unknown (in the fog), or standing with their health when seen. */
export function paintCamps(run, view) {
  for (const camp of view.camps) {
    const mark = run.campMarks.get(camp.id);
    mark?.classList.toggle("is-unknown", !camp.known);
    mark?.classList.toggle("is-down", camp.known && !camp.alive);
    let barEl = run.campBars.get(camp.id);
    // sent by the bots server for the camps the side sees standing only
    const progress = run.camps[camp.id] ?? 0;
    const visible = camp.known && camp.alive && progress > 0;
    if (visible && !barEl) {
      barEl = document.createElement("span");
      barEl.className = "sim-bar sim-bar--camp";
      barEl.innerHTML = "<i></i>";
      run.layerOf.dots.append(barEl);
      run.campBars.set(camp.id, barEl);
      place(barEl, camp.at, run.side);
    }
    if (barEl) {
      barEl.hidden = !visible;
      setBar(barEl, Math.round((1 - Math.min(1, progress)) * 100));
    }
  }
  for (const tower of view.towers) {
    run.towerMarks.get(tower.id)?.classList.toggle("is-down", !tower.alive);
  }
}

/** The picture of each skill the side sees cast (the frame lists them), on the caster, for a third of a second. */
export function paintCasts(run, now) {
  for (const cast of run.newCasts.splice(0)) {
    run.castUntil.set(cast.hero, { until: now + CAST_SHOWN_MS, key: cast.key });
  }
  for (const [id, cast] of run.castUntil) {
    const slot = run.dots.get(id)?.querySelector(".sim-dot__cast");
    if (!slot) {
      continue;
    }
    const on = cast.until > now;
    if (on && slot.dataset.key !== cast.key) {
      const url = run.icons.get(run.heroIdOf.get(id))?.[cast.key];
      slot.dataset.key = cast.key;
      slot.innerHTML = url
        ? `<img src="${esc(url)}" alt="" width="24" height="24" decoding="async">`
        : `<b>${cast.key === "ult" ? "U" : esc(cast.key.replace("s", ""))}</b>`;
    }
    slot.hidden = !on;
    if (!on) {
      slot.dataset.key = "";
      run.castUntil.delete(id);
    }
  }
}

function paintSpell(run, view) {
  const me = view.heroes.find(hero => hero.id === run.me.id);
  const spell = run.layerOf.spell;
  if (!me || !spell) {
    return;
  }
  spell.classList.toggle("is-ready", me.alive && Boolean(me.spellReady || me.punishReady));
  spell.disabled = !me.alive;
}

export function paintFarm(run, view) {
  const { blue, red } = view.farm;
  run.layerOf.farmBlue.textContent = String(Math.round(blue));
  run.layerOf.farmRed.textContent = String(Math.round(red));
  setBar(run.layerOf.farmBar, share(blue, blue + red || 1));
}

/** The boxes on top of the board, drawn again only when what they say changes. */
function paintPopups(run, state) {
  const { layerOf } = run;
  const coverKey = state.question ? `q:${state.question.id}` : state.paused ? "pause" : "";
  if (coverKey !== run.keys.cover) {
    run.keys.cover = coverKey;
    layerOf.cover.innerHTML = state.question
      ? questionHtml(state.question)
      : state.paused
        ? pauseHtml()
        : "";
    layerOf.cover.querySelector("button")?.focus();
  }
  layerOf.cover.hidden = !coverKey;
  layerOf.game.classList.toggle("is-hidden", state.hidden);
  layerOf.game.classList.toggle("is-dead", state.dead);
  if (state.question) {
    const left = layerOf.cover.querySelector(".sim-question__left");
    if (left) {
      left.textContent = String(Math.ceil(state.question.left));
    }
  }
  layerOf.death.hidden = !state.dead;
  if (state.dead) {
    layerOf.death.innerHTML = deathHtml(state.respawnAt - state.time);
  }
  for (const button of layerOf.calls) {
    button.disabled = state.callIn > 0 || state.hidden;
  }
}

/** One frame. `state` is the session's view sent by the bots server; `view` what the player's side sees now. */
export function paintFrame(run, state, view, now) {
  paintHeroes(run, view, now);
  paintWaves(run, view);
  paintCamps(run, view);
  paintCasts(run, now);
  if (run.eyes) {
    const eyes = eyesMarkup(run.eyes);
    run.layerOf.eyes.innerHTML = eyes;
    run.layerOf.miniEyes.innerHTML = eyes;
    run.eyes = null;
  }
  run.lastView = view;
  paintCards(run, view);
  paintSpell(run, view);
  paintTop(run, view);
  paintFarm(run, view);
  paintMini(run, view);
  paintScoreboard(run, view);
  paintControls(run, state, view);
  run.layerOf.clock.textContent = clock(state.time);
  paintPopups(run, state);
}
