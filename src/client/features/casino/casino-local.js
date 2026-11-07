// casino page, a spectator's own spin (owner, 2026-11-07): drawn in this browser with the roulette's pools and bans and
// the server's rule (shared/casino-draw.js), shown on this screen only. Nothing is sent: the roulette everyone sees,
// and its history, stay the creator's.
import { draw } from "../../../shared/casino-draw.js";

/**
 * Draws `lanes` from what this screen shows (`local`, or the roulette when the spectator has not spun yet).
 * Returns `{ result, drawn, since }`: `since` marks the creator's last spin when the spectator started.
 */
export function localSpin(roll, local, lanes, { known, pick, now }) {
  const from = { ...roll, result: local?.result ?? roll.result };
  const next = draw(from, lanes, { known, pick, now, kind: "local" });
  return {
    result: next.result,
    drawn: next.drawn,
    since: local ? local.since : (roll.history?.[0]?.at ?? null)
  };
}

/** What the screen draws: the roulette, with the spectator's heroes when they spun. */
export const shownState = (roll, local) =>
  local ? { ...roll, result: local.result, drawn: local.drawn } : roll;

/** Whether the creator spun (or banned) after the spectator started spinning on their own. */
export const creatorSpun = (roll, local) =>
  Boolean(local) && (roll.history?.[0]?.at ?? null) !== local.since;
