import { badRequest } from "../../platform/errors.js";
import { LANGUAGES } from "../../../shared/i18n.js";
import {
  HERO_ID_PATTERN,
  choice,
  cleanText as text,
  parseUuid as uuid,
  plainObject as object
} from "../../platform/validation.js";
import { TEAM_LANES } from "../teams/team-domain.js";

// What a person may enter in the community layer besides teams: scrim announcements and requests,
// messages, RSVPs, the public player profile, Discord preferences. Pure.

export const FORMATS = [1, 3, 5, 7];
export const HERO_RULES = ["global-ban-pick", "free-for-all"];
export const CONTROLS = ["online", "external"];
const RSVP_ANSWERS = ["going", "maybe", "no"];
export const REQUESTS_PER_DAY = 5;
const USER_LABELS = ["verified", "moderator", "organiser", "contributor"];
const MAX_WINDOW_MS = 7 * 24 * 3600_000;
const MAX_SCRIM_MS = 12 * 3600_000;
const TIMEZONE = /^UTC(?:[+-](?:0?[0-9]|1[0-4]))?$/;

const instant = (value, label) => {
  const time =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?Z$/.test(value)
        ? Date.parse(value)
        : NaN;
  if (!Number.isFinite(time) || time < Date.UTC(2020, 0, 1) || time > Date.UTC(2100, 0, 1)) {
    throw badRequest("{label} is not a valid date and time.", "invalid_body", { label });
  }
  return Math.round(time);
};

const format = value => {
  const number = typeof value === "string" && /^[0-9]$/.test(value) ? Number(value) : value;
  if (!FORMATS.includes(number)) {
    throw badRequest("The format is BO1, BO3, BO5 or BO7.", "invalid_body");
  }
  return number;
};

const slot = (body, maxMs, now) => {
  const startsAt = instant(body.startsAt, "Start");
  const endsAt = instant(body.endsAt, "End");
  if (endsAt <= startsAt) {
    throw badRequest("The end must be after the start.", "invalid_body");
  }
  if (endsAt - startsAt > maxMs) {
    throw badRequest("This window is too long.", "invalid_body");
  }
  if (endsAt <= now) {
    throw badRequest("This time is already over.", "invalid_body");
  }
  return { startsAt, endsAt };
};

/**
 * A "looking for a scrim" announcement: a window up to a week, a format, a hero rule, a control
 * mode, a short note.
 */
export function parsePost(body, now = Date.now()) {
  object(body);
  return {
    teamId: uuid(body.teamId, "team id"),
    ...slot(body, MAX_WINDOW_MS, now),
    format: format(body.format),
    heroRule: choice(body.heroRule, "Hero rule", HERO_RULES, "global-ban-pick"),
    control: choice(body.control, "Control", CONTROLS, "online"),
    note: text(body.note, "Note", { max: 200 })
  };
}

/** A request from one team to another for a precise time. */
export function parseRequest(body, now = Date.now()) {
  object(body);
  const fromTeamId = uuid(body.fromTeamId, "team id"),
    toTeamId = uuid(body.toTeamId, "team id");
  if (fromTeamId === toTeamId) {
    throw badRequest("A team cannot ask itself for a scrim.", "invalid_body");
  }
  return {
    fromTeamId,
    toTeamId,
    postId:
      body.postId === undefined || body.postId === null || body.postId === ""
        ? null
        : uuid(body.postId, "post id"),
    ...slot(body, MAX_SCRIM_MS, now),
    format: format(body.format),
    heroRule: choice(body.heroRule, "Hero rule", HERO_RULES, "global-ban-pick"),
    control: choice(body.control, "Control", CONTROLS, "online"),
    note: text(body.note, "Note", { max: 400 })
  };
}

/** A counter-proposal: another time (and, if wanted, another note). */
export function parseCounter(body, now = Date.now()) {
  object(body);
  return { ...slot(body, MAX_SCRIM_MS, now), note: text(body.note, "Note", { max: 400 }) };
}

export function parseMessage(body) {
  object(body);
  return text(body.text, "Message", { max: 600, min: 1, required: true });
}

export function parseRsvp(body) {
  object(body);
  if (!RSVP_ANSWERS.includes(body.answer)) {
    throw badRequest("The answer is going, maybe or no.", "invalid_body");
  }
  return body.answer;
}

/** The labels an administrator gives to a person: a list of known labels, no duplicates. */
export function parseLabels(body) {
  object(body);
  const labels = body.labels;
  if (
    !Array.isArray(labels) ||
    labels.length > USER_LABELS.length ||
    labels.some(label => !USER_LABELS.includes(label)) ||
    new Set(labels).size !== labels.length
  ) {
    throw badRequest("Labels must be a list of known, different labels.", "invalid_body");
  }
  return labels;
}

export function parseReport(body) {
  object(body);
  return text(body.reason, "Reason", { max: 400, min: 3, required: true });
}

/** The optional public profile of a player. */
export function parseProfile(body) {
  object(body);
  const timezone = text(body.timezone, "Time zone", { max: 10 });
  if (timezone && !TIMEZONE.test(timezone)) {
    throw badRequest("The time zone looks like UTC or UTC+2.", "invalid_body");
  }
  const known = new Set(LANGUAGES.map(language => language.code));
  const languages = body.languages ?? [];
  if (
    !Array.isArray(languages) ||
    languages.length > 5 ||
    languages.some(code => !known.has(code)) ||
    new Set(languages).size !== languages.length
  ) {
    throw badRequest("Languages must be up to 5 different language codes.", "invalid_body");
  }
  const heroes = body.mainHeroes ?? [];
  if (
    !Array.isArray(heroes) ||
    heroes.length > 3 ||
    heroes.some(id => typeof id !== "string" || !HERO_ID_PATTERN.test(id)) ||
    new Set(heroes).size !== heroes.length
  ) {
    throw badRequest("Main heroes are up to 3 different heroes.", "invalid_body");
  }
  return {
    bio: text(body.bio, "Bio", { max: 300 }),
    lane: choice(body.lane, "Lane", TEAM_LANES, ""),
    timezone,
    languages,
    mainHeroes: heroes
  };
}

export const DEFAULT_DISCORD_PREFS = { requests: true, reminders: true, results: true };

export function parseDiscordPrefs(body) {
  object(body);
  const prefs = {};
  for (const key of Object.keys(DEFAULT_DISCORD_PREFS)) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") {
      throw badRequest("{label} must be true or false.", "invalid_body", { label: key });
    }
    prefs[key] = body[key] ?? DEFAULT_DISCORD_PREFS[key];
  }
  return prefs;
}

/** The notification kinds that each preference covers. */
export const PREFERENCE_OF = {
  request: "requests",
  message: "requests",
  answer: "results",
  invitation: "results",
  reminder: "reminders"
};

/** Who may ask for, answer or discuss a scrim for a team: the staff and the captain. */
export const STAFF_ROLES = ["owner", "manager", "coach", "captain"];

/** A calendar file (iCalendar) of events: times in UTC, text escaped. */
export function toIcs(events, teamName, now = Date.now()) {
  const stamp = time =>
    new Date(time)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = value =>
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HOK Global Scrim Lab//Agenda//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escape(teamName)}`
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@hok-scrim-lab`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(event.endsAt)}`,
      `SUMMARY:${escape(event.title)}`,
      ...(event.note ? [`DESCRIPTION:${escape(event.note)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

// ---- Discord bot --------------------------------------------------------------------------------
/** The reminders sent before an event, in hours. */
export const REMINDER_HOURS = [6, 4, 2];
/** A Discord snowflake (channel, server, user id). */
export const SNOWFLAKE = /^[0-9]{5,25}$/;

export function parseChannel(body) {
  object(body);
  if (typeof body.channelId !== "string" || !SNOWFLAKE.test(body.channelId)) {
    throw badRequest("Choose a Discord channel.", "invalid_body");
  }
  return body.channelId;
}

/** "UTC+2" → minutes east of UTC (0 when empty or unknown). */
export function offsetMinutes(timezone) {
  const match = /^UTC([+-])([0-9]{1,2})$/.exec(timezone ?? "");
  return match ? (match[1] === "-" ? -1 : 1) * Number(match[2]) * 60 : 0;
}

/**
 * The Monday-morning digest is due when it is Monday 08:00 or later in the team's time zone; the
 * key names that Monday.
 */
export function digestWindow(now, timezone) {
  const local = new Date(now + offsetMinutes(timezone) * 60_000);
  return {
    due: local.getUTCDay() === 1 && local.getUTCHours() >= 8,
    key: local.toISOString().slice(0, 10)
  };
}
