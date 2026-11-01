// Each frame of a game: the dots where they are (only what the player's side sees), their health
// bars (heroes, monsters and objectives; none for the minions of a wave), the fog, the towers and
// camps that fell, the picture of each skill seen cast (a third of a second), the allies' bars, the
// player's cooldowns, the gold of both teams, the clock, and the boxes that open on top. Positions
// and bar lengths go through the style object (the page's content policy forbids style attributes).
import { t } from "../../app/browser-i18n.js";
import { eyesMarkup, placeOnBoard } from "./simulation-map.js";
import { decisionHtml, deathHtml, pauseHtml, questionHtml } from "./simulation-popups.js";
import { clock, esc, portrait } from "./simulation-shared.js";

const CAST_SHOWN_MS = 333;

const share = (part, whole) =>
  whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0;

function setBar(element, percent) {
  const fill = element?.firstElementChild;
  if (fill && fill.dataset.p !== String(percent)) {
    fill.dataset.p = String(percent);
    fill.style.setProperty("--p", String(percent));
  }
}

function place(element, at, side) {
  const [x, y] = placeOnBoard(at, side);
  element.style.left = `${x.toFixed(2)}%`;
  element.style.top = `${y.toFixed(2)}%`;
}

function dotOf(run, hero) {
  let dot = run.dots.get(hero.id);
  if (!dot) {
    dot = document.createElement("span");
    const mine = hero.id === run.me.id;
    dot.className = `sim-dot sim-dot--${hero.side === run.side ? "ally" : "enemy"}${mine ? " sim-dot--me" : ""}`;
    const approximate = run.approximate.has(hero.id)
      ? `<em class="sim-dot__approx" title="${esc(t("Approximate data"))}">≈</em>`
      : "";
    dot.innerHTML = `<span class="sim-dot__face">${portrait(run.heroes, hero.heroId, 32)}</span><span class="sim-bar sim-bar--hp"><i></i></span>${approximate}<span class="sim-dot__cast" hidden></span>`;
    run.layerOf.dots.append(dot);
    run.dots.set(hero.id, dot);
  }
  return dot;
}

function paintHeroes(run, view) {
  const shown = new Set();
  for (const hero of view.heroes) {
    if (!hero.alive) {
      continue;
    }
    const dot = dotOf(run, hero);
    shown.add(hero.id);
    dot.hidden = false;
    place(dot, hero.pos, run.side);
    setBar(dot.querySelector(".sim-bar"), share(hero.hp ?? 1, hero.maxHp ?? 1));
  }
  for (const [id, dot] of run.dots) {
    if (!shown.has(id)) {
      dot.hidden = true;
    }
  }
}

function paintWaves(run, view) {
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
function paintCamps(run, view) {
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
function paintCasts(run, now) {
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

function paintAllies(run, view) {
  for (const ally of view.heroes.filter(h => h.side === run.side && h.id !== run.me.id)) {
    const row = run.allyRows.get(ally.id);
    if (!row) {
      continue;
    }
    const [hp, mana, ult] = row.querySelectorAll(".sim-bar");
    setBar(hp, ally.alive ? share(ally.hp ?? 1, ally.maxHp ?? 1) : 0);
    mana.hidden = ally.mana === null || ally.mana === undefined;
    setBar(mana, share(ally.mana ?? 0, ally.maxMana ?? 0));
    setBar(ult, ally.ult ? 100 : 0);
    ult.classList.toggle("is-ready", Boolean(ally.ult));
    const timer = row.querySelector(".sim-ally__timer");
    timer.hidden = ally.alive;
    if (!ally.alive) {
      timer.textContent = String(Math.max(0, Math.ceil((ally.respawnAt ?? 0) - view.time)));
    }
    row.classList.toggle("is-dead", !ally.alive);
  }
}

function paintMe(run, view) {
  const me = view.heroes.find(hero => hero.id === run.me.id);
  if (!me) {
    return;
  }
  setBar(run.layerOf.meHp, me.alive ? share(me.hp ?? 1, me.maxHp ?? 1) : 0);
  for (const [key, cell] of run.skillCells) {
    const left = me.cooldowns?.[key] ?? 0;
    const cd = cell.lastElementChild;
    cd.hidden = left <= 0;
    cd.textContent = left > 0 ? String(Math.ceil(left)) : "";
    cell.classList.toggle("is-cooling", left > 0);
  }
  const ready = me.alive && Boolean(me.spellReady || me.punishReady);
  run.layerOf.spell.classList.toggle("is-ready", ready);
  run.layerOf.spellState.textContent = ready ? t("Ready") : "";
  run.layerOf.spell.disabled = !me.alive;
}

function paintFarm(run, view) {
  const { blue, red } = view.farm;
  run.layerOf.farmBlue.textContent = String(Math.round(blue));
  run.layerOf.farmRed.textContent = String(Math.round(red));
  setBar(run.layerOf.farmBar, share(blue, blue + red || 1));
}

/** The boxes on top of the board, drawn again only when what they say changes. */
function paintPopups(run, state) {
  const { layerOf } = run;
  const decisionKey = state.decision
    ? `${state.decision.shownAt}:${state.decision.waiting}:${state.decision.options.map(o => o.id).join()}`
    : "";
  if (decisionKey !== run.keys.decision) {
    run.keys.decision = decisionKey;
    layerOf.decision.hidden = !state.decision || state.hidden;
    layerOf.decision.innerHTML = state.decision ? decisionHtml(state.decision, run.heroes) : "";
  }
  layerOf.decision.hidden = !state.decision || state.hidden;
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
  layerOf.map.classList.toggle("is-hidden", state.hidden);
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
  paintHeroes(run, view);
  paintWaves(run, view);
  paintCamps(run, view);
  paintCasts(run, now);
  if (run.eyes) {
    run.layerOf.eyes.innerHTML = eyesMarkup(run.eyes);
    run.eyes = null;
  }
  paintAllies(run, view);
  paintMe(run, view);
  paintFarm(run, view);
  run.layerOf.clock.textContent = clock(state.time);
  paintPopups(run, state);
}
