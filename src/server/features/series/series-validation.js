import { randomUUID } from "node:crypto";
import { DomainError, badRequest } from "../../platform/errors.js";
import {
  array,
  heroIdList,
  integer,
  plainObject,
  queryDate,
  queryText,
  text
} from "../../platform/validation.js";
import { PICK_LANES, assertGlobalBanPick, createDraft, stepsOf } from "./series-draft.js";
import {
  DRAFT_MODES,
  GAME_MODES,
  createSeries,
  normalizeTeamNames,
  recomputeStatus
} from "./series.js";

export function parseSeriesCreate(body, { online = false } = {}) {
  const input = plainObject(body);
  const draftMode = online ? "online" : (input.draftMode ?? "solo");
  if (typeof draftMode !== "string") {
    throw badRequest("draftMode must be a string.", "invalid_body");
  }
  if (input.teamA !== undefined && typeof input.teamA !== "string") {
    throw badRequest("teamA must be a string.", "invalid_body");
  }
  if (input.teamB !== undefined && typeof input.teamB !== "string") {
    throw badRequest("teamB must be a string.", "invalid_body");
  }
  if (!online && draftMode === "online") {
    throw badRequest("Use the online endpoint to create an online series.", "invalid_body");
  }
  return createSeries({
    teamA: input.teamA,
    teamB: input.teamB,
    bestOf: input.bestOf,
    gameMode: input.gameMode,
    draftMode
  });
}

const IMPORT_IGNORED_KEYS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "winsRequired",
  "status",
  "online",
  "viewer",
  "version",
  "serverTime",
  "draftMode",
  "currentGame"
]);
const IMPORT_KEYS = new Set(["teamA", "teamB", "bestOf", "gameMode", "games"]);
const GAME_KEYS = new Set([
  "id",
  "gameNumber",
  "blueTeam",
  "redTeam",
  "draft",
  "gameTimer",
  "suggestedDurationSeconds",
  "winner",
  "durationSeconds",
  "completedAt"
]);

function isoDate(value, fallback) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function parseImportedDraft(rawDraft, game, teams, knownHeroIds, label) {
  const raw = plainObject(rawDraft, `${label}.draft`);
  const gameMode = GAME_MODES.includes(raw.gameMode) ? raw.gameMode : "free-for-all";
  const draft = createDraft({
    blueTeam: game.blueTeam,
    redTeam: game.redTeam,
    teamA: teams[0],
    teamB: teams[1],
    gameMode,
    picksOnly: gameMode === "classic" || raw.picksOnly === true
  });
  const seen = new Set();
  const seenBySide = { blue: new Set(), red: new Set() }; // classic: both sides may take the same hero
  for (const kind of ["bans", "picks"]) {
    const group = plainObject(raw[kind], `${label}.draft.${kind}`);
    for (const side of ["blue", "red"]) {
      draft[kind][side] = heroIdList(
        group[side],
        `${label}.draft.${kind}.${side}`,
        5,
        knownHeroIds
      );
      for (const heroId of draft[kind][side]) {
        const used = gameMode === "classic" ? seenBySide[side] : seen;
        if (used.has(heroId)) {
          throw badRequest("{label} uses hero {heroId} more than once.", "invalid_body", {
            label,
            heroId
          });
        }
        used.add(heroId);
        seen.add(heroId);
      }
    }
  }
  if (raw.pickAssignments !== undefined) {
    const assignments = plainObject(raw.pickAssignments, `${label}.draft.pickAssignments`);
    for (const side of ["blue", "red"]) {
      draft.pickAssignments[side] = array(
        assignments[side] ?? [],
        `${label}.draft.pickAssignments.${side}`,
        5
      ).map(entry => {
        plainObject(entry, "pick assignment");
        if (!draft.picks[side].includes(entry.heroId) || !PICK_LANES.includes(entry.lane)) {
          throw badRequest("{label} has an invalid pick assignment.", "invalid_body", { label });
        }
        return { heroId: entry.heroId, lane: entry.lane };
      });
    }
  }
  if (draft.picksOnly && (draft.bans.blue.length || draft.bans.red.length)) {
    throw badRequest("{label} has bans in a draft without bans.", "invalid_body", { label });
  }
  const steps = stepsOf(draft);
  if (raw.actions !== undefined) {
    draft.actions = array(raw.actions, `${label}.draft.actions`, steps.length).map(
      (entry, index) => {
        plainObject(entry, "draft action");
        const step = steps[index];
        if (entry.team !== step.team || entry.action !== step.action) {
          throw badRequest("{label} has actions out of order.", "invalid_body", { label });
        }
        const heroId = entry.heroId ?? null;
        if (heroId !== null && !seen.has(heroId)) {
          throw badRequest(
            "{label} has an action on a hero that is not in the draft.",
            "invalid_body",
            { label }
          );
        }
        return {
          team: step.team,
          action: step.action,
          heroId,
          ...(PICK_LANES.includes(entry.lane) ? { lane: entry.lane } : {}),
          ...(entry.timedOut === true
            ? { timedOut: true, autoPicked: entry.autoPicked === true }
            : {}),
          completedAt: Number.isFinite(entry.completedAt) ? entry.completedAt : 0
        };
      }
    );
  }
  draft.started = true;
  draft.ready = { blue: true, red: true };
  draft.stepIndex = steps.length;
  draft.phase = "complete";
  draft.deadline = null;
  return draft;
}

/**
 * Builds a brand-new series from untrusted exported JSON. The id, owner, timestamps,
 * status and drafts are rebuilt by the server; only validated facts are copied. A Global Ban & Pick
 * series must keep the series rule (no hero twice per team, one Flowborn form per team), like a game
 * corrected afterwards and a tournament entered by hand.
 */
export function parseSeriesImport(payload, knownHeroIds, { flowbornIds = [] } = {}) {
  const input = plainObject(payload, "The imported file");
  for (const key of Object.keys(input)) {
    if (!IMPORT_KEYS.has(key) && !IMPORT_IGNORED_KEYS.has(key)) {
      throw badRequest("The imported file has an unexpected field: {value}.", "invalid_body", {
        value: key.slice(0, 40)
      });
    }
  }
  const teamA = plainObject(input.teamA, "teamA");
  const teamB = plainObject(input.teamB, "teamB");
  let names;
  try {
    names = normalizeTeamNames(
      text(teamA.name, "teamA.name", { min: 1, max: 40 }),
      text(teamB.name, "teamB.name", { min: 1, max: 40 })
    );
  } catch (error) {
    if (error instanceof DomainError) {
      throw badRequest(error.template ?? error.message, "invalid_body", error.params);
    }
    throw error;
  }
  const bestOf = integer(input.bestOf, "bestOf", { min: 1, max: 99 });
  const series = createSeries({
    teamA: names[0],
    teamB: names[1],
    bestOf,
    gameMode: input.gameMode
  });
  series.createdAt = isoDate(input.createdAt, series.createdAt);

  const games = array(input.games, "games", bestOf);
  series.games = games.map((rawGame, index) => {
    const label = `games[${index}]`;
    const game = plainObject(rawGame, label);
    for (const key of Object.keys(game)) {
      if (!GAME_KEYS.has(key)) {
        throw badRequest("{label} has an unexpected field: {value}.", "invalid_body", {
          label,
          value: key.slice(0, 40)
        });
      }
    }
    if (
      !names.includes(game.blueTeam) ||
      !names.includes(game.redTeam) ||
      game.blueTeam === game.redTeam
    ) {
      throw badRequest(
        "{label} must have the two series teams on opposite sides.",
        "invalid_body",
        { label }
      );
    }
    if (!names.includes(game.winner)) {
      throw badRequest("{label}.winner must be one of the series teams.", "invalid_body", {
        label
      });
    }
    const durationSeconds = integer(game.durationSeconds, `${label}.durationSeconds`, {
      min: 0,
      max: 86400
    });
    const cleanGame = { blueTeam: game.blueTeam, redTeam: game.redTeam };
    return {
      id: randomUUID(),
      gameNumber: index + 1,
      blueTeam: cleanGame.blueTeam,
      redTeam: cleanGame.redTeam,
      draft: parseImportedDraft(game.draft, cleanGame, names, knownHeroIds, label),
      gameTimer: { status: "finished", elapsedBeforeStart: durationSeconds, startedAt: null },
      suggestedDurationSeconds: durationSeconds,
      winner: game.winner,
      durationSeconds,
      completedAt: isoDate(game.completedAt, new Date().toISOString())
    };
  });
  if (series.gameMode === "global-ban-pick") {
    try {
      assertGlobalBanPick(
        series.games.flatMap(game => [
          { team: game.blueTeam, heroes: game.draft.picks.blue },
          { team: game.redTeam, heroes: game.draft.picks.red }
        ]),
        flowbornIds
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw badRequest(error.template, "invalid_body", error.params);
      }
      throw error;
    }
  }
  recomputeStatus(series);
  series.updatedAt = new Date().toISOString();
  return series;
}

const SERIES_STATUSES = ["active", "complete", "draw"];

/** Filters shared by the series list, the history and the "your scrims" statistics. */
export function parseSeriesFilters(query) {
  const filters = {};
  const choice = (key, allowed, target = key) => {
    if (query[key] === undefined || query[key] === "") {
      return;
    }
    const value = queryText(query[key], key, 20);
    if (!allowed.includes(value)) {
      throw badRequest("{key} must be one of: {value}.", "invalid_query", {
        key,
        value: allowed.join(", ")
      });
    }
    filters[target] = value;
  };
  choice("status", SERIES_STATUSES);
  choice("mode", GAME_MODES);
  choice("draftMode", DRAFT_MODES);
  choice("sort", ["updated", "oldest", "created"]);
  if (query.q !== undefined && query.q !== "") {
    const q = queryText(query.q, "q", 60);
    if (q) {
      filters.q = q;
    }
  }
  if (query.from !== undefined && query.from !== "") {
    filters.from = queryDate(query.from, "from");
  }
  if (query.to !== undefined && query.to !== "") {
    filters.to = queryDate(query.to, "to");
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw badRequest("from must not be after to.", "invalid_query");
  }
  return filters;
}
