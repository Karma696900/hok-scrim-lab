// Reading one game of a series: its picks, bans and lanes.
import { HERO_ID_PATTERN } from "../../platform/validation.js";
import { PICK_LANES } from "../series/series-draft.js";
import { badRequest } from "../../platform/errors.js";
import { TEAM_MAX, clean } from "./tournament-domain-shared.js";

const PICKS = 5;

const BANS = 5;

function heroList(value, label, max, known, { exact = false } = {}) {
  if (!Array.isArray(value)) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  const list = value.filter(item => item !== null && item !== "");
  if (list.length > max || value.length > max) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  if (exact && list.length !== max) {
    throw badRequest("{label} needs exactly {max} heroes.", "invalid_body", { label, max });
  }
  for (const id of list) {
    if (typeof id !== "string" || !HERO_ID_PATTERN.test(id)) {
      throw badRequest("{label} contains an invalid hero id.", "invalid_body", { label });
    }
    if (!known.has(id)) {
      throw badRequest("{label} contains an unknown hero id: {item}.", "unknown_hero", {
        label,
        item: id
      });
    }
  }
  return list;
}

/**
 * The lane each of the five picks was played in, in the order of the picks (null = not said). A
 * hero is sometimes played in a lane its sheet does not list, so any of the five lanes is accepted
 * for any hero; but a team has one player per lane, so a lane is given at most once per side.
 */
function laneList(value, label) {
  if (value === undefined || value === null) {
    return Array.from({ length: PICKS }, () => null);
  }
  if (!Array.isArray(value) || value.length !== PICKS) {
    throw badRequest(
      "{label} must give a lane (or none) for each of the five picks.",
      "invalid_body",
      { label }
    );
  }
  const seen = new Set();
  return value.map(lane => {
    if (lane === null || lane === "") {
      return null;
    }
    if (!PICK_LANES.includes(lane)) {
      throw badRequest("{label} contains a lane that does not exist.", "invalid_body", { label });
    }
    if (seen.has(lane)) {
      throw badRequest("{label} gives the same lane to two heroes of one side.", "invalid_body", {
        label
      });
    }
    seen.add(lane);
    return lane;
  });
}

export function parseGame(raw, index, teams, known) {
  const label = `games[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw badRequest("{label} must be a JSON object.", "invalid_body", { label });
  }
  const blueTeam = clean(raw.blueTeam, `${label}.blueTeam`, { max: TEAM_MAX, required: true });
  const redTeam = clean(raw.redTeam, `${label}.redTeam`, { max: TEAM_MAX, required: true });
  const names = [teams.teamA, teams.teamB];
  if (!names.includes(blueTeam) || !names.includes(redTeam) || blueTeam === redTeam) {
    throw badRequest("{label} must have the two series teams on opposite sides.", "invalid_body", {
      label
    });
  }
  const winner = clean(raw.winner, `${label}.winner`, { max: TEAM_MAX, required: true });
  if (winner !== blueTeam && winner !== redTeam) {
    throw badRequest("{label}.winner must be one of the series teams.", "invalid_body", { label });
  }
  let durationSeconds = null;
  if (
    raw.durationSeconds !== undefined &&
    raw.durationSeconds !== null &&
    raw.durationSeconds !== ""
  ) {
    if (
      !Number.isInteger(raw.durationSeconds) ||
      raw.durationSeconds < 60 ||
      raw.durationSeconds > 7200
    ) {
      throw badRequest(
        "{label}.durationSeconds must be a whole number between {min} and {max}.",
        "invalid_body",
        { label, min: 60, max: 7200 }
      );
    }
    durationSeconds = raw.durationSeconds;
  }
  const bans = {
    blue: heroList(raw.bans?.blue ?? [], `${label}.bans.blue`, BANS, known),
    red: heroList(raw.bans?.red ?? [], `${label}.bans.red`, BANS, known)
  };
  const picks = {
    blue: heroList(raw.picks?.blue, `${label}.picks.blue`, PICKS, known, { exact: true }),
    red: heroList(raw.picks?.red, `${label}.picks.red`, PICKS, known, { exact: true })
  };
  if (raw.ultimateBattle !== undefined && typeof raw.ultimateBattle !== "boolean") {
    throw badRequest("{label}.ultimateBattle must be true or false.", "invalid_body", { label });
  }
  // A hero is in a game once; except in the Ultimate Battle, where each team submits its lineup without
  // seeing the other, so both may take the same hero (never twice in one team, never picked and banned).
  const lists =
    raw.ultimateBattle === true
      ? [picks.blue, picks.red, [...bans.blue, ...bans.red]]
      : [[...bans.blue, ...bans.red, ...picks.blue, ...picks.red]];
  const twice = id => {
    throw badRequest("{label} uses hero {heroId} more than once.", "invalid_body", {
      label,
      heroId: id
    });
  };
  for (const list of lists) {
    const seen = new Set();
    for (const id of list) {
      if (seen.has(id)) {
        twice(id);
      }
      seen.add(id);
    }
  }
  const banned = new Set([...bans.blue, ...bans.red]);
  for (const id of [...picks.blue, ...picks.red]) {
    if (banned.has(id)) {
      twice(id);
    }
  }
  const pickLanes = {
    blue: laneList(raw.pickLanes?.blue, `${label}.pickLanes.blue`),
    red: laneList(raw.pickLanes?.red, `${label}.pickLanes.red`)
  };
  return {
    gameNumber: index + 1,
    blueTeam,
    redTeam,
    winner,
    durationSeconds,
    bans,
    picks,
    pickLanes,
    ultimateBattle: raw.ultimateBattle === true
  };
}
