import { DomainError, badRequest } from "../../platform/errors.js";
import { assertGlobalBanPick } from "../series/series-draft.js";
import { TEAM_MAX, clean } from "./tournament-domain-shared.js";
import { parseGame } from "./tournament-game-parser.js";
export { pickOrderStats } from "./tournament-stats.js";
export { heroTournamentStats } from "./tournament-stats.js";

const EVENT_MAX = 160;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD that is a real calendar day. */
export function parseDay(value, label) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw badRequest("{label} must be a date like 2026-09-30.", "invalid_body", { label });
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest("{label} must be a date like 2026-09-30.", "invalid_body", { label });
  }
  return value;
}

/**
 * How sure a series is (see migration 035). Whether the order of its picks is known is a separate fact (migration 038):
 * a series that says nothing about it knows the order unless it is a plain list of heroes.
 */
export const VERIFICATIONS = ["verified", "video", "listed"];
export const knowsPickOrder = verification => verification !== "listed";

const TO_CHECK_LINES = 40;
const TO_CHECK_LINE_MAX = 200;
/** What is still to check in a series, as a short list of lines (kept as text, one line each). */
function parseToCheck(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > TO_CHECK_LINES) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label: "toCheck",
      max: TO_CHECK_LINES
    });
  }
  return value.map(line => clean(line, "toCheck", { max: TO_CHECK_LINE_MAX })).filter(Boolean);
}

/** The video or the page the series was read from: no series without the way back to its source. */
function parseSourceUrl(value) {
  if (value === undefined || value === null || value === "") {
    throw badRequest("{label} is required.", "invalid_body", { label: "sourceUrl" });
  }
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:") {
      throw new Error("scheme");
    }
    return url.toString().slice(0, 500);
  } catch {
    throw badRequest("{label} must be an https URL.", "invalid_body", { label: "sourceUrl" });
  }
}

/**
 * A series as the page sends it, validated and normalised. `known` is the set of Global hero ids.
 * Games are numbered by their position; there cannot be more games than the best-of allows.
 */
export function parseTournamentSeries(input, known, { flowbornIds = [] } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("{label} must be a JSON object.", "invalid_body", { label: "The series" });
  }
  const event = clean(input.event, "event", { max: EVENT_MAX, required: true });
  const stage = clean(input.stage, "stage", { max: 80 });
  const teamA = clean(input.teamA, "teamA", { max: TEAM_MAX, required: true });
  const teamB = clean(input.teamB, "teamB", { max: TEAM_MAX, required: true });
  const RULES = ["classic", "free-for-all", "global-ban-pick"];
  const rule = input.rule ?? "free-for-all";
  if (!RULES.includes(rule)) {
    throw badRequest("Invalid rule.", "invalid_body");
  }
  if (teamA.toLocaleLowerCase() === teamB.toLocaleLowerCase()) {
    throw badRequest("The two teams must have different names.", "invalid_body");
  }
  if (!Number.isInteger(input.bestOf) || input.bestOf < 1 || input.bestOf > 9) {
    throw badRequest("{label} must be a whole number between {min} and {max}.", "invalid_body", {
      label: "bestOf",
      min: 1,
      max: 9
    });
  }
  const playedOn = parseDay(input.playedOn, "playedOn");
  if (playedOn > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) {
    throw badRequest(
      "A series that has really been played cannot be in the future.",
      "invalid_body"
    );
  }
  const patch = clean(input.patch, "patch", { max: 40 });
  const sourceUrl = parseSourceUrl(input.sourceUrl);
  const note = clean(input.note, "note", { max: 500 });
  const verification = input.verification ?? "verified";
  if (!VERIFICATIONS.includes(verification)) {
    throw badRequest("Invalid verification.", "invalid_body");
  }
  const pickOrderKnown = input.pickOrderKnown ?? knowsPickOrder(verification);
  if (typeof pickOrderKnown !== "boolean") {
    throw badRequest("{label} must be true or false.", "invalid_body", { label: "pickOrderKnown" });
  }
  const toCheck = parseToCheck(input.toCheck);
  if (!Array.isArray(input.games) || input.games.length < 1) {
    throw badRequest("A series needs at least one game.", "invalid_body");
  }
  if (input.games.length > input.bestOf) {
    throw badRequest("A best-of-{bestOf} series cannot have {count} games.", "invalid_body", {
      bestOf: input.bestOf,
      count: input.games.length
    });
  }
  const games = input.games.map((game, index) => parseGame(game, index, { teamA, teamB }, known));
  // The Ultimate Battle is the deciding last game of a Global Ban & Pick series, played with the classic draft
  // rules: the series is tied before it, it is the game number best-of, and nothing comes after it.
  games.forEach((game, index) => {
    if (!game.ultimateBattle) {
      return;
    }
    const before = games.slice(0, index);
    const tied = before.filter(item => item.winner === teamA).length * 2 === before.length;
    if (
      rule !== "global-ban-pick" ||
      index !== games.length - 1 ||
      games.length !== input.bestOf ||
      !tied
    ) {
      throw badRequest(
        "The Ultimate Battle is the deciding last game of a Global Ban & Pick series.",
        "invalid_body"
      );
    }
  });
  // Global Ban & Pick: no hero twice per team over the series (except in the Ultimate Battle, which is
  // classic), one Flowborn form per team.
  if (rule === "global-ban-pick") {
    try {
      assertGlobalBanPick(
        games
          .filter(game => !game.ultimateBattle)
          .flatMap(game => [
            { team: game.blueTeam, heroes: game.picks.blue },
            { team: game.redTeam, heroes: game.picks.red }
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
  const wins = { [teamA]: 0, [teamB]: 0 };
  for (const game of games) {
    wins[game.winner] += 1;
  }
  return {
    event,
    stage,
    teamA,
    teamB,
    bestOf: input.bestOf,
    rule,
    playedOn,
    patch,
    sourceUrl,
    note,
    verification,
    pickOrderKnown,
    toCheck,
    games,
    score: { teamA: wins[teamA], teamB: wins[teamB] }
  };
}
