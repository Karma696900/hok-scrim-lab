import { DomainError } from "../../platform/errors.js";
// The order of the actions and the rules about which heroes are free are the same in the browser:
// one copy, in shared/.
import {
  DRAFT_STEPS,
  PICK_LANES,
  PICK_ONLY_ORDER,
  PICK_ONLY_STEPS,
  sharesHeroes,
  stepsOf,
  takenFor
} from "../../../shared/draft-model.js";

export { DRAFT_STEPS, PICK_LANES, PICK_ONLY_ORDER, PICK_ONLY_STEPS, stepsOf };

export function createDraft({
  blueTeam,
  redTeam,
  teamA = blueTeam,
  teamB = redTeam,
  secondsPerAction = 30,
  waitingSeconds = 30,
  gameMode = "free-for-all",
  picksOnly = false
}) {
  return {
    ...(picksOnly ? { picksOnly: true } : {}),
    blueTeam,
    redTeam,
    teamA,
    teamB,
    gameMode,
    secondsPerAction,
    waitingSeconds,
    started: false,
    ready: { blue: false, red: false },
    stepIndex: 0,
    phase: "draft",
    deadline: null,
    actions: [],
    bans: { blue: [], red: [] },
    picks: { blue: [], red: [] },
    pickLaneOrder: { blue: [...PICK_LANES], red: [...PICK_LANES] },
    pickAssignments: { blue: [], red: [] }
  };
}

export function startDraftTimer(draft, now = Date.now()) {
  if (draft.phase === "draft" && draft.deadline === null) {
    draft.started = true;
    draft.deadline = now + draft.secondsPerAction * 1000;
  }
  return draft;
}

export function markDraftReady(draft, side, { now = Date.now(), localStart = false } = {}) {
  if (draft.phase !== "draft" || draft.started) {
    return draft;
  }
  draft.ready ??= { blue: false, red: false };
  if (localStart) {
    draft.ready.blue = true;
    draft.ready.red = true;
  } else {
    if (!["blue", "red"].includes(side)) {
      throw new DomainError("Choose the Blue or Red side to start.");
    }
    draft.ready[side] = true;
  }
  if (draft.ready.blue && draft.ready.red) {
    startDraftTimer(draft, now);
  }
  return draft;
}

function moveToNextStep(draft, now) {
  draft.stepIndex += 1;
  if (draft.stepIndex >= stepsOf(draft).length) {
    draft.phase = "waiting";
    draft.deadline = now + draft.waitingSeconds * 1000;
  } else {
    draft.deadline = now + draft.secondsPerAction * 1000;
  }
  return draft;
}

function assignPickLane(draft, side, heroId, heroes) {
  draft.pickLaneOrder ??= { blue: [...PICK_LANES], red: [...PICK_LANES] };
  draft.pickLaneOrder[side] ??= [...PICK_LANES];
  draft.pickAssignments ??= { blue: [], red: [] };
  draft.pickAssignments[side] ??= [];
  const pickIndex = draft.picks[side].length;
  const order = draft.pickLaneOrder[side];
  if (!heroes) {
    return order[pickIndex] || null;
  }

  const hero = heroes.find(item => item.id === heroId && item.availableGlobal !== false);
  if (!hero) {
    throw new DomainError("This hero is not available in the official roster.");
  }
  const laneIndex = order.findIndex(
    (lane, index) => index >= pickIndex && hero.lanes.includes(lane)
  );
  if (laneIndex >= 0) {
    [order[pickIndex], order[laneIndex]] = [order[laneIndex], order[pickIndex]];
  }
  return order[pickIndex];
}

/**
 * Global Ban & Pick: a team cannot take again a hero it already used in the series, and it can only
 * use ONE Flowborn form in the whole series (picking any of the five forms locks the other four).
 * `usedHeroes` are the team's picks in the other games AND in the current one.
 */
function isBlockedForTeam(heroId, usedHeroes, flowbornIds) {
  return (
    usedHeroes.includes(heroId) ||
    (flowbornIds.includes(heroId) && usedHeroes.some(id => flowbornIds.includes(id)))
  );
}

/**
 * Checks the Global Ban & Pick rule on a list of `{ team, heroes }` entries (one per side per game,
 * in game order): no team picks the same hero in two games, and no team uses more than one Flowborn
 * form in the series. Only entries from index `from` on can raise the error: the earlier ones are
 * the reference (a game being corrected is checked against the other games, not the other way
 * round). Used by imports, tournaments and draft corrections.
 */
export function assertGlobalBanPick(entries, flowbornIds = [], { from = 0 } = {}) {
  const used = new Map();
  entries.forEach((entry, index) => {
    const team = used.get(entry.team) ?? { heroes: new Set(), flowborn: 0 };
    used.set(entry.team, team);
    for (const heroId of entry.heroes) {
      if (index >= from && team.heroes.has(heroId)) {
        throw new DomainError(
          "{teamName} already picked this hero in another game of the series (Global Ban & Pick).",
          { teamName: entry.team }
        );
      }
      team.heroes.add(heroId);
      if (!flowbornIds.includes(heroId)) {
        continue;
      }
      team.flowborn += 1;
      if (index >= from && team.flowborn > 1) {
        throw new DomainError(
          "{teamName} can only use Flowborn once in a Global Ban & Pick series.",
          { teamName: entry.team }
        );
      }
    }
  });
}

export function applyDraftAction(
  draft,
  heroId,
  { now = Date.now(), teamAUsed = [], teamBUsed = [], flowbornIds = [], heroes } = {}
) {
  if (draft.phase !== "draft" || draft.stepIndex >= stepsOf(draft).length) {
    throw new DomainError("Draft is not accepting actions.");
  }
  if (draft.started === false) {
    throw new DomainError("Both sides must start the draft before taking actions.");
  }

  const step = stepsOf(draft)[draft.stepIndex];
  const expired = draft.deadline !== null && now >= draft.deadline;
  if (expired) {
    return advanceDraft(draft, now, { teamAUsed, teamBUsed, flowbornIds, heroes });
  }
  if (!heroId || takenFor(draft, step.team).includes(heroId)) {
    throw new DomainError("This hero is unavailable in the current draft.");
  }

  if (step.action === "pick" && draft.gameMode === "global-ban-pick") {
    const teamName = step.team === "blue" ? draft.blueTeam : draft.redTeam;
    const usedHeroes = [
      ...(teamName === draft.teamA ? teamAUsed : teamBUsed),
      ...draft.picks[step.team]
    ];
    if (usedHeroes.includes(heroId)) {
      throw new DomainError("This team already picked this hero in an earlier game.");
    }
    if (isBlockedForTeam(heroId, usedHeroes, flowbornIds)) {
      throw new DomainError(
        "{teamName} can only use Flowborn once in a Global Ban & Pick series.",
        { teamName }
      );
    }
  }

  let lane = null;
  if (step.action === "pick") {
    lane = assignPickLane(draft, step.team, heroId, heroes);
  }
  draft[step.action === "ban" ? "bans" : "picks"][step.team].push(heroId);
  if (lane) {
    draft.pickAssignments[step.team].push({ heroId, lane });
  }
  draft.actions.push({
    ...step,
    heroId,
    ...(lane ? { lane } : {}),
    completedAt: now
  });
  return moveToNextStep(draft, now);
}

export function advanceDraft(
  draft,
  now = Date.now(),
  { heroes = [], teamAUsed = [], teamBUsed = [], flowbornIds = [], random = Math.random } = {}
) {
  if (draft.started === false) {
    return draft;
  }
  if (draft.phase === "draft" && draft.deadline !== null && now >= draft.deadline) {
    const step = stepsOf(draft)[draft.stepIndex];

    let heroId = null;
    let lane = null;
    if (step.action === "pick") {
      draft.pickLaneOrder ??= { blue: [...PICK_LANES], red: [...PICK_LANES] };
      draft.pickAssignments ??= { blue: [], red: [] };
      const pickIndex = draft.picks[step.team].length;
      lane = draft.pickLaneOrder[step.team]?.[pickIndex] || null;
      const teamName = step.team === "blue" ? draft.blueTeam : draft.redTeam;
      const usedHeroes = [
        ...(teamName === draft.teamA ? teamAUsed : teamBUsed),
        ...draft.picks[step.team]
      ];
      const unavailable = new Set(takenFor(draft, step.team));
      const candidates = heroes.filter(
        hero =>
          hero.availableGlobal !== false &&
          hero.lanes.includes(lane) &&
          !unavailable.has(hero.id) &&
          (draft.gameMode !== "global-ban-pick" ||
            !isBlockedForTeam(hero.id, usedHeroes, flowbornIds))
      );
      if (candidates.length) {
        heroId =
          candidates[Math.floor(Math.max(0, Math.min(0.999999999, random())) * candidates.length)]
            .id;
        draft.picks[step.team].push(heroId);
        draft.pickAssignments[step.team].push({ heroId, lane });
      }
    }
    draft.actions.push({
      ...step,
      heroId,
      ...(lane ? { lane } : {}),
      timedOut: true,
      ...(step.action === "pick" ? { autoPicked: Boolean(heroId) } : { skipped: true }),
      completedAt: now
    });
    moveToNextStep(draft, now);
  } else if (draft.phase === "waiting" && draft.deadline !== null && now >= draft.deadline) {
    draft.phase = "complete";
    draft.deadline = null;
  }
  return draft;
}

/**
 * Replaces the bans and picks of a draft after the fact (a mistake noticed later). Lists are in the
 * order they happened: the first ban is the first ban of that side, and so on. The log of actions
 * and the invisible lane assignments are rebuilt so every view (board, statistics, exports) stays
 * consistent.
 */
export function rewriteDraftHeroes(draft, { bans, picks }, heroes) {
  const known = new Set(heroes.map(hero => hero.id));
  /** Ban lists keep their positions: a null is a ban nobody made (time ran out). */
  const seen = new Set();
  const seenBySide = { blue: new Set(), red: new Set() }; // classic: only a team's own picks exclude each other
  const next = { bans: { blue: [], red: [] }, picks: { blue: [], red: [] } };
  for (const [kind, source] of [
    ["bans", bans],
    ["picks", picks]
  ]) {
    for (const side of ["blue", "red"]) {
      const list = source?.[side];
      if (!Array.isArray(list) || list.length > 5) {
        throw new DomainError("The {side} {kind} must be a list of at most 5 heroes.", {
          side,
          kind
        });
      }
      for (const heroId of list) {
        if (heroId === null && kind === "bans") {
          next.bans[side].push(null);
          continue;
        }
        if (typeof heroId !== "string" || !known.has(heroId)) {
          throw new DomainError("Unknown hero: {value}.", { value: String(heroId).slice(0, 40) });
        }
        const used = sharesHeroes(draft) ? seenBySide[side] : seen;
        if (used.has(heroId)) {
          throw new DomainError("A hero can only appear once in a draft.");
        }
        used.add(heroId);
        next[kind][side].push(heroId);
      }
    }
  }

  if (draft.picksOnly && [...next.bans.blue, ...next.bans.red].some(Boolean)) {
    throw new DomainError("This draft has no bans.");
  }

  // Lane priority is replayed in pick order, exactly as it happened live (it only matters for the
  // auto-pick).
  const order = { blue: [...PICK_LANES], red: [...PICK_LANES] };
  const assignments = { blue: [], red: [] };
  for (const side of ["blue", "red"]) {
    next.picks[side].forEach((heroId, pickIndex) => {
      const hero = heroes.find(item => item.id === heroId);
      const laneIndex = order[side].findIndex(
        (lane, index) => index >= pickIndex && hero.lanes.includes(lane)
      );
      if (laneIndex >= 0) {
        [order[side][pickIndex], order[side][laneIndex]] = [
          order[side][laneIndex],
          order[side][pickIndex]
        ];
      }
      assignments[side].push({ heroId, lane: order[side][pickIndex] });
    });
  }

  // Rebuild the action log in draft order; keep the timing details of actions that did not change.
  const cursor = { "blue-ban": 0, "red-ban": 0, "blue-pick": 0, "red-pick": 0 };
  const actions = [];
  stepsOf(draft).forEach((step, index) => {
    const key = `${step.team}-${step.action}`;
    const listed = next[step.action === "ban" ? "bans" : "picks"][step.team];
    const reached = cursor[key] < listed.length;
    const heroId = listed[cursor[key]] ?? null;
    cursor[key] += 1;
    const previous = draft.actions?.[index];
    if (heroId === null && !previous && !reached) {
      return;
    } // a step nobody reached yet
    const lane =
      step.action === "pick" && heroId
        ? assignments[step.team].find(item => item.heroId === heroId)?.lane
        : undefined;
    if (previous && previous.heroId === heroId && previous.team === step.team) {
      actions.push({ ...previous, ...(lane ? { lane } : {}) });
    } else if (heroId !== null || previous || reached) {
      actions.push({
        ...step,
        heroId,
        ...(lane ? { lane } : {}),
        ...(heroId === null ? { skipped: true } : {}),
        edited: true,
        completedAt: previous?.completedAt ?? Date.now()
      });
    }
  });

  draft.bans = { blue: next.bans.blue.filter(Boolean), red: next.bans.red.filter(Boolean) };
  draft.picks = next.picks;
  draft.pickLaneOrder = order;
  draft.pickAssignments = assignments;
  draft.actions = actions;
  return draft;
}
