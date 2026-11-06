// The dark sweep and the seconds left of what recharges on the screen: the summoner spell (or Punish), Recall and
// Recovery (simulation-home.js). The skills of the player's hero are not on the screen: the AI casts them (owner,
// 2026-11-05), the picture of each skill seen cast shows on its caster (simulation-paint.js).

/**
 * What a button shows with `left` seconds of cooldown, given what it showed before (`previous`, or null): the whole
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

/**
 * Each frame: the summoner spell (or Punish) of the player's hero goes down once used, as the skills do: a dark
 * sweep and the seconds left (the frame's `spellLeft`), gone at once when it is ready again, after its delay or
 * given back early. `button` is the spell's button, `time` its seconds; the last state is kept on `run.spellCool`.
 */
export function paintSpellCooldown(run, button, time, me) {
  const state = coolState(run.spellCool ?? null, me?.alive ? (me.spellLeft ?? 0) : 0);
  run.spellCool = state;
  button.classList.toggle("is-cooling", state.left > 0);
  button.style.setProperty("--sweep", String(state.share));
  if (time.hidden !== !state.label) {
    time.hidden = !state.label;
  }
  if (time.textContent !== state.label) {
    time.textContent = state.label;
  }
}
