import { randomUUID } from "node:crypto";
import { DomainError } from "../../platform/errors.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { assertGlobalBanPick, createDraft, rewriteDraftHeroes } from "./series-draft.js";

const TEAM_NAME_MAX_LENGTH = 40;
export const DRAFT_MODES = ["solo", "two-players", "online"];
/**
 * Global Ban & Pick (bans, a team never reuses a hero), Free For All (picks only, a hero is taken
 * once), Classic (picks only, both sides may take the same hero).
 */
export const GAME_MODES = ["global-ban-pick", "free-for-all", "classic"];

/** Trims, bounds and checks a team name. Control characters are rejected, not stripped. */
function normalizeTeamName(value, fallback) {
  const name =
    String(value ?? "")
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ") || fallback;
  if (name.length > TEAM_NAME_MAX_LENGTH) {
    throw new DomainError("Team names are limited to {TEAM_NAME_MAX_LENGTH} characters.", {
      TEAM_NAME_MAX_LENGTH
    });
  }
  if (/[\u0000-\u001f\u007f<>]/.test(name)) {
    throw new DomainError("Team names cannot contain control characters, < or >.");
  }
  return name;
}

export function normalizeTeamNames(teamA, teamB) {
  const first = normalizeTeamName(teamA, "Team A");
  const second = normalizeTeamName(teamB, "Team B");
  if (first.toLocaleLowerCase() === second.toLocaleLowerCase()) {
    throw new DomainError("The two teams must have different names.");
  }
  return [first, second];
}

export function createSeries({ teamA, teamB, bestOf, gameMode, draftMode = "solo" }) {
  const maximumGames = Number(bestOf);
  if (!Number.isInteger(maximumGames) || maximumGames < 1 || maximumGames > 99) {
    throw new DomainError("Best-of must be a whole number between 1 and 99.");
  }
  if (!GAME_MODES.includes(gameMode)) {
    throw new DomainError("Choose a supported game mode.");
  }
  if (!DRAFT_MODES.includes(draftMode)) {
    throw new DomainError("Choose a supported draft control mode.");
  }
  const [teamAName, teamBName] = normalizeTeamNames(teamA, teamB);

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    teamA: { name: teamAName },
    teamB: { name: teamBName },
    bestOf: maximumGames,
    winsRequired: Math.floor(maximumGames / 2) + 1,
    gameMode,
    draftMode,
    status: "active",
    games: [],
    currentGame: null
  };
}

export function startNextGame(series, blueTeamName) {
  const score = getSeriesScore(series);
  if (
    series.status !== "active" ||
    series.currentGame ||
    series.games.length >= series.bestOf ||
    score.teamA >= series.winsRequired ||
    score.teamB >= series.winsRequired
  ) {
    throw new DomainError("This series cannot start another game.");
  }
  const teamAName = series.teamA.name;
  const teamBName = series.teamB.name;
  const blueTeam = blueTeamName || (series.games.length % 2 === 0 ? teamAName : teamBName);
  if (![teamAName, teamBName].includes(blueTeam)) {
    throw new DomainError("Blue side must be assigned to one of the series teams.");
  }
  const redTeam = blueTeam === teamAName ? teamBName : teamAName;
  const draft = createDraft({
    blueTeam,
    redTeam,
    teamA: teamAName,
    teamB: teamBName,
    gameMode: series.gameMode,
    picksOnly: series.gameMode !== "global-ban-pick"
  });
  series.currentGame = {
    id: randomUUID(),
    gameNumber: series.games.length + 1,
    blueTeam,
    redTeam,
    draft,
    gameTimer: { status: "idle", elapsedBeforeStart: 0, startedAt: null }
  };
  series.updatedAt = new Date().toISOString();
  return series.currentGame;
}

export function completeCurrentGame(series, { winner, durationSeconds }) {
  const game = series.currentGame;
  if (!game) {
    throw new DomainError("There is no game in progress.");
  }
  if (![series.teamA.name, series.teamB.name].includes(winner)) {
    throw new DomainError("Winner must be one of the series teams.");
  }
  const seconds = Number(durationSeconds);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
    throw new DomainError("Game duration must be valid seconds.");
  }
  if (game.draft.phase !== "complete") {
    throw new DomainError("Finish the draft waiting phase before recording a result.");
  }

  const completed = {
    ...game,
    winner,
    durationSeconds: seconds,
    completedAt: new Date().toISOString()
  };
  series.games.push(completed);
  series.currentGame = null;
  const score = getSeriesScore(series);
  if (score.teamA >= series.winsRequired || score.teamB >= series.winsRequired) {
    series.status = "complete";
  } else if (series.games.length >= series.bestOf) {
    series.status = score.teamA === score.teamB ? "draw" : "complete";
  }
  series.updatedAt = new Date().toISOString();
  return completed;
}
/** Recomputes series.status from its recorded games. */
export function recomputeStatus(series) {
  const score = getSeriesScore(series);
  if (score.teamA >= series.winsRequired || score.teamB >= series.winsRequired) {
    series.status = "complete";
  } else if (series.games.length >= series.bestOf) {
    series.status = score.teamA === score.teamB ? "draw" : "complete";
  } else {
    series.status = "active";
  }
  return series.status;
}

/** Targeted edit of a recorded game's duration (replaces the old whole-object PUT). */
export function setGameDuration(series, gameIndex, durationSeconds) {
  const game = series.games[gameIndex];
  if (!game) {
    throw new DomainError("This game does not exist.");
  }
  const seconds = Number(durationSeconds);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
    throw new DomainError("Game duration must be valid seconds.");
  }
  game.durationSeconds = seconds;
  series.updatedAt = new Date().toISOString();
  return game;
}

function requireTimer(series, verb) {
  const game = series.currentGame;
  if (!game) {
    throw new DomainError("There is no game in progress.");
  }
  if (game.draft.started === false) {
    throw new DomainError(
      verb === "starting"
        ? "Start the draft before starting the game timer."
        : verb === "pausing"
          ? "Start the draft before pausing the game timer."
          : "Start the draft before finishing the game timer."
    );
  }
  return game;
}

export function startGameTimer(series, now = Date.now()) {
  const timer = requireTimer(series, "starting").gameTimer;
  if (timer.status !== "running") {
    timer.startedAt = now;
    timer.status = "running";
  }
  return timer;
}

export function pauseGameTimer(series, now = Date.now()) {
  const timer = requireTimer(series, "pausing").gameTimer;
  if (timer.status === "running") {
    timer.elapsedBeforeStart += Math.max(0, Math.floor((now - timer.startedAt) / 1000));
    timer.startedAt = null;
    timer.status = "paused";
  }
  return timer;
}

export function finishGameTimer(series, now = Date.now()) {
  const game = requireTimer(series, "finishing");
  const timer = game.gameTimer;
  if (timer.status === "running") {
    timer.elapsedBeforeStart += Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  }
  timer.startedAt = null;
  timer.status = "finished";
  game.suggestedDurationSeconds = timer.elapsedBeforeStart;
  return timer;
}

/**
 * Corrects the bans/picks of a game that already has its draft finished (recorded games, or the
 * current game once its draft is over). In Global Ban & Pick the series rule still holds: a team
 * cannot use a hero (or any Flowborn form, once) in two games of the series.
 */
export function editGameDraft(series, game, edit, { heroes, flowbornIds = [] }) {
  if (game === series.currentGame && !["waiting", "complete"].includes(game.draft.phase)) {
    throw new DomainError(
      "The draft is still in progress: finish it before editing its bans and picks."
    );
  }
  const draft = structuredClone(game.draft);
  rewriteDraftHeroes(draft, edit, heroes);
  if (series.gameMode === "global-ban-pick") {
    const others = [...series.games, ...(series.currentGame ? [series.currentGame] : [])].filter(
      item => item !== game
    );
    const entriesOf = (item, picks) => [
      { team: item.blueTeam, heroes: picks.blue },
      { team: item.redTeam, heroes: picks.red }
    ];
    const reference = others.flatMap(item => entriesOf(item, item.draft.picks));
    assertGlobalBanPick([...reference, ...entriesOf(game, draft.picks)], flowbornIds, {
      from: reference.length
    });
  }
  game.draft = draft;
  series.updatedAt = new Date().toISOString();
  return game;
}
