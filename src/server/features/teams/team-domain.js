import { badRequest } from "../../platform/errors.js";
import { choice, cleanText as text, plainObject as object } from "../../platform/validation.js";
import { LANGUAGES } from "../../../shared/i18n.js";

// Teams of the community layer: what a user may enter, and who may do what in a roster. Pure.

const TEAM_ROLES = ["owner", "manager", "coach", "captain", "analyst", "player", "sub"];
/**
 * Roles an invitation or a role change can give (the owner is the creator; ownership is not handed
 * out here).
 */
export const ASSIGNABLE_ROLES = TEAM_ROLES.filter(role => role !== "owner");
export const TEAM_LEVELS = ["casual", "amateur", "semi-pro", "pro"];
export const TEAM_REGIONS = ["EU", "NA", "SEA", "LATAM", "MENA", "SA", "OCE", "EA"];
export const TEAM_LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
export const MAX_TEAMS_PER_USER = 5;
const MIN_TEAM_SIZE = 7;
const MAX_MEMBERS = 20;
const DEFAULT_TEAM_SIZE = 10;
const TIMEZONE = /^UTC(?:[+-](?:0?\d|1[0-4]))?$/;
const TAG = /^[A-Z0-9]{2,5}$/;

/**
 * Comparison key of a team name: no case, no accents, no spacing differences ("Alpha Esports" and
 * "alpha esports" are one name).
 */
export const nameKey = name =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

/** The profile of a team, as its owner types it. */
export function parseTeam(body) {
  object(body);
  const name = text(body.name, "Team name", { max: 40, min: 2, required: true });
  const tag = text(body.tag, "Team tag", { max: 5, required: true }).toUpperCase();
  if (!TAG.test(tag)) {
    throw badRequest("The team tag is 2 to 5 letters or digits.", "invalid_body");
  }
  const timezone = text(body.timezone, "Time zone", { max: 10 });
  if (timezone && !TIMEZONE.test(timezone)) {
    throw badRequest("The time zone looks like UTC or UTC+2.", "invalid_body");
  }
  const known = new Set(LANGUAGES.map(language => language.code));
  const languages = body.languages === undefined ? [] : body.languages;
  if (
    !Array.isArray(languages) ||
    languages.length > 5 ||
    languages.some(code => !known.has(code)) ||
    new Set(languages).size !== languages.length
  ) {
    throw badRequest("Languages must be up to 5 different language codes.", "invalid_body");
  }
  return {
    name,
    nameKey: nameKey(name),
    tag,
    description: text(body.description, "Description", { max: 600 }),
    region: choice(body.region, "Region", TEAM_REGIONS, ""),
    timezone,
    languages,
    level: choice(body.level, "Level", TEAM_LEVELS, "casual"),
    maxMembers: parseMaxMembers(body.maxMembers)
  };
}

/** How many members (and pending invitations) the team accepts: a whole number from 7 to 20. */
export function parseMaxMembers(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TEAM_SIZE;
  }
  const number = typeof value === "string" && /^[0-9]{1,3}$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < MIN_TEAM_SIZE || number > MAX_MEMBERS) {
    throw badRequest("The member limit is a whole number from {min} to {max}.", "invalid_body", {
      min: MIN_TEAM_SIZE,
      max: MAX_MEMBERS
    });
  }
  return number;
}

/** A role and, for players and substitutes, a lane. */
export function parseMemberRole(body) {
  object(body);
  const role = choice(body.role, "Role", ASSIGNABLE_ROLES, "player");
  const lane = choice(body.lane, "Lane", TEAM_LANES, "");
  return { role, lane: role === "player" || role === "sub" ? lane : "" };
}

export function parseInvitation(body) {
  const { role, lane } = parseMemberRole(body);
  const tag = text(body.tag, "Player tag", { max: 9, required: true })
    .replace(/^#/, "")
    .toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(tag)) {
    throw badRequest(
      "A player tag is 6 letters or digits, as shown on their profile.",
      "invalid_body"
    );
  }
  return { tag, role, lane };
}

/** Who may change a roster: the owner and the managers. */
export const canManage = role => role === "owner" || role === "manager";

/**
 * Who may put a series on the team, so that the members can read it: the staff who lead the team (the
 * owner, the managers and the coaches). The person must also own the series.
 */
export const canShareSeries = role => role === "owner" || role === "manager" || role === "coach";
/** How many teams one series can be on. */
export const SERIES_TEAMS_MAX = 5;

// ---- Agenda -------------------------------------------------------------------------------------
const EVENT_KINDS = [
  "availability",
  "unavailable",
  "scrim",
  "tournament",
  "practice",
  "vod",
  "meeting"
];
export const MAX_EVENTS_PER_TEAM = 500;
const MAX_EVENT_MS = 24 * 3600_000;
const EARLIEST = Date.UTC(2020, 0, 1),
  LATEST = Date.UTC(2100, 0, 1);

/** Who may add and change events: the staff and the captain. */
export const canSchedule = role =>
  role === "owner" || role === "manager" || role === "coach" || role === "captain";

const instant = (value, label) => {
  const time =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?Z$/.test(value)
        ? Date.parse(value)
        : NaN;
  if (!Number.isFinite(time) || time < EARLIEST || time > LATEST) {
    throw badRequest("{label} is not a valid date and time.", "invalid_body", { label });
  }
  return Math.round(time);
};

/** An event as typed: a kind, a title, a start and an end (UTC), a note. */
export function parseEvent(body) {
  object(body);
  const kind = choice(body.kind, "Kind", EVENT_KINDS, "scrim");
  const startsAt = instant(body.startsAt, "Start");
  const endsAt = instant(body.endsAt, "End");
  if (endsAt <= startsAt) {
    throw badRequest("The end must be after the start.", "invalid_body");
  }
  if (endsAt - startsAt > MAX_EVENT_MS) {
    throw badRequest("An event lasts at most 24 hours.", "invalid_body");
  }
  const title =
    text(body.title, "Title", {
      max: 80,
      required: kind !== "availability" && kind !== "unavailable"
    }) || (kind === "unavailable" ? "Unavailable" : "Available");
  const repeat =
    body.repeatWeeks === undefined || body.repeatWeeks === null || body.repeatWeeks === ""
      ? 0
      : Number(body.repeatWeeks);
  if (!Number.isInteger(repeat) || repeat < 0 || repeat > 12) {
    throw badRequest(
      "A weekly repetition is a whole number of weeks from 0 to 12.",
      "invalid_body"
    );
  }
  return {
    kind,
    title,
    startsAt,
    endsAt,
    note: text(body.note, "Note", { max: 400 }),
    repeatWeeks: repeat
  };
}

/**
 * The window of a list request: both bounds are optional UTC instants (default: from an hour ago,
 * 60 days).
 */
export function parseWindow(query, now = Date.now()) {
  const from = query.from === undefined ? now - 3600_000 : instant(Number(query.from), "From");
  const to = query.to === undefined ? from + 60 * 24 * 3600_000 : instant(Number(query.to), "To");
  if (to <= from || to - from > 366 * 24 * 3600_000) {
    throw badRequest("The window is at most one year.", "invalid_query");
  }
  return { from, to };
}
