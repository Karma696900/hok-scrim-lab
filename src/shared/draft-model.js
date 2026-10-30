// The rules of a draft that the server and the browser both apply, and the helpers of the views
// (pure: no DOM, importable from Node).

/** The 20 actions of the competitive order (Global Ban & Pick): 10 bans, then 10 picks. */
export const DRAFT_STEPS = [
  ["blue", "ban"],
  ["red", "ban"],
  ["blue", "ban"],
  ["red", "ban"],
  ["blue", "pick"],
  ["red", "pick"],
  ["red", "pick"],
  ["blue", "pick"],
  ["blue", "pick"],
  ["red", "pick"],
  ["red", "ban"],
  ["blue", "ban"],
  ["red", "ban"],
  ["blue", "ban"],
  ["red", "ban"],
  ["blue", "ban"],
  ["red", "pick"],
  ["blue", "pick"],
  ["blue", "pick"],
  ["red", "pick"]
].map(([team, action]) => ({ team, action }));

/**
 * The two rules without bans, Free For All and Classic, share one pick order (ten picks, five per
 * side): 1 Blue, 2 Red, 2 Blue, 2 Red, 2 Blue, 1 Red. - Free For All: a hero can be taken once in a
 * game, by either side. - Classic: a hero only blocks its own side, so both sides may end up with
 * the same heroes; online, each player sees only their own picks until the end.
 */
export const PICK_ONLY_ORDER = [
  "blue",
  "red",
  "red",
  "blue",
  "blue",
  "red",
  "red",
  "blue",
  "blue",
  "red"
];
export const PICK_ONLY_STEPS = PICK_ONLY_ORDER.map(team => ({ team, action: "pick" }));
/** The steps of this draft: drafts created before this rule (no flag) keep the 20 actions. */
export const stepsOf = draft => (draft.picksOnly ? PICK_ONLY_STEPS : DRAFT_STEPS);

/**
 * Classic: both sides may pick the same hero (a hero only blocks its own team); the picks have no
 * bans either.
 */
export const sharesHeroes = draft => draft.gameMode === "classic";
/** The heroes a team can no longer take in this draft. */
export const takenFor = (draft, side) =>
  sharesHeroes(draft)
    ? draft.picks[side]
    : [...draft.bans.blue, ...draft.bans.red, ...draft.picks.blue, ...draft.picks.red];

export const PICK_LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
/**
 * Marks a text as translatable: the view translates it, the collector (scripts/i18n/keys.mjs) lists
 * it.
 */
const message = text => text;

const WARNING_SECONDS = 5;

export const currentStep = draft => stepsOf(draft)[draft.stepIndex] || null;

/**
 * Five pick slots, filled IN PICK ORDER: the first pick is the first slot, whatever the hero's
 * role. Any hero can be picked at any time. `lane` is only the role rank of the slot (Clash,
 * Jungle, Mid, Farm, Support): it tells which role the AUTO-PICK would take on a time-out, it never
 * restricts a manual pick.
 */
export function pickSlots(draft, side) {
  return PICK_LANES.map((lane, index) => ({
    lane,
    rank: index + 1,
    heroId: draft.picks[side][index] ?? null
  }));
}

/** The bans of a side in the order they happened, a null for each one nobody made (time ran out). */
function bansInOrder(draft, side) {
  const logged = (draft.actions ?? [])
    .filter(action => action.team === side && action.action === "ban")
    .map(action => action.heroId ?? null);
  return logged.filter(Boolean).length === draft.bans[side].length ? logged : draft.bans[side];
}

/**
 * Five ban slots in the order the bans happened. A ban that was not made (time ran out) leaves its
 * slot EMPTY and the next ban takes the next slot. Older drafts without an action log fall back to
 * the plain list.
 */
export function banSlots(draft, side) {
  const list = bansInOrder(draft, side);
  return Array.from({ length: 5 }, (_, index) => list[index] ?? null);
}

/** The slot the next ban of `side` takes: after the bans made and the ones that were skipped. */
export function nextBanIndex(draft, side) {
  return bansInOrder(draft, side).length;
}

/** Lane the next pick of `side` is expected to fill (invisible priority order). */
export function expectedLane(draft, side) {
  return (
    draft.pickLaneOrder?.[side]?.[draft.picks[side].length] ||
    PICK_LANES[draft.picks[side].length] ||
    null
  );
}

export function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Three clock states the UI must tell apart:
 *   normal   – time remaining
 *   warning  – last WARNING_SECONDS
 *   expired  – time is up; waiting for the server to resolve it (pick: auto-pick, ban: still required)
 * plus idle (ready check), done (draft complete) and waiting-ban (an expired ban the player must still submit).
 */
export function timerState(draft, now) {
  if (draft.started === false) {
    return { name: "idle", label: "--:--" };
  }
  if (draft.phase === "complete") {
    return { name: "done", label: message("Ready") };
  }
  if (draft.deadline === null || draft.deadline === undefined) {
    return { name: "idle", label: "--:--" };
  }
  const remaining = draft.deadline - now;
  if (remaining <= 0) {
    return { name: "expired", label: "00:00" };
  }
  if (remaining <= WARNING_SECONDS * 1000) {
    return { name: "warning", label: formatClock(remaining) };
  }
  return { name: "normal", label: formatClock(remaining) };
}

const FLOWBORN = /^Flowborn(?:\s*\(|$)/i;

/** Why a hero card is (not) selectable right now. */
export function heroAvailability({ hero, draft, series, usedByActingTeam, flowbornIds, canAct }) {
  const step = currentStep(draft);
  const unavailable = takenFor(draft, step?.team ?? "blue").includes(hero.id);
  if (unavailable) {
    return { blocked: true, label: message("Used this game") };
  }
  // One Flowborn form per team in the whole series: the forms already picked in THIS game count
  // too.
  const flowbornLocked =
    FLOWBORN.test(hero.name) &&
    [...usedByActingTeam, ...(draft.picks?.[step?.team] ?? [])].some(id =>
      flowbornIds.includes(id)
    );
  if (
    series.gameMode === "global-ban-pick" &&
    step?.action === "pick" &&
    (usedByActingTeam.includes(hero.id) || flowbornLocked)
  ) {
    return { blocked: true, label: message("Used in series") };
  }
  if (!canAct) {
    return { blocked: true, label: message("Waiting") };
  }
  return { blocked: false, label: "" };
}

export function usedHeroes(series, teamName) {
  return series.games.flatMap(game => [
    ...(game.blueTeam === teamName ? game.draft.picks.blue : []),
    ...(game.redTeam === teamName ? game.draft.picks.red : [])
  ]);
}

/** The games each team has won in a series: { teamA, teamB }. */
export function getSeriesScore(series) {
  return series.games.reduce(
    (score, game) => {
      if (game.winner === series.teamA.name) {
        score.teamA += 1;
      }
      if (game.winner === series.teamB.name) {
        score.teamB += 1;
      }
      return score;
    },
    { teamA: 0, teamB: 0 }
  );
}
