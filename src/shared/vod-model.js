// The review of a video (a VOD): the address of the video and the moments worth a second look, typed
// one per line as "12:30 flash missed". The page uses these rules to read what a person typed and to
// build the link that opens the video at a moment; the server uses them to refuse what is not fine.

export const VOD_URL_MAX = 500;
export const VOD_MARKS_MAX = 30;
export const VOD_MARK_TEXT_MAX = 200;
/** A video is shorter than a day. */
export const VOD_SECONDS_MAX = 86_399;

const pad = number => String(number).padStart(2, "0");

/** 754 → "12:34", 3723 → "1:02:03". */
export function clockText(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

// h:mm:ss, or m:ss with the minutes counted past the hour (75:30 is an hour and a quarter in)
const CLOCK = /^(\d{1,2}):([0-5]\d):([0-5]\d)$|^(\d{1,4}):([0-5]\d)$/;

/** "12:34" → 754, "1:02:03" → 3723; null when it is not a time inside a video. */
export function parseClock(value) {
  const match = CLOCK.exec(String(value ?? "").trim());
  if (!match) {
    return null;
  }
  const seconds =
    match[1] === undefined
      ? Number(match[4]) * 60 + Number(match[5])
      : Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds <= VOD_SECONDS_MAX ? seconds : null;
}

// a time, an optional dash, then what to look at
const MARK_LINE = /^(\d{1,4}(?::\d{2}){1,2})(?:\s+[-–—])?\s+(\S.*)$/u;

/**
 * The moments of a text, one per line ("12:30 flash missed"), in the order of the video. When a line
 * is wrong, `problem` says which one (counted from 1) and why: "format" (no time, or no words after
 * it), "long" (too many characters) or "many" (too many moments); `marks` then holds what came
 * before it.
 */
export function parseMarks(source) {
  const marks = [];
  for (const [index, raw] of String(source ?? "")
    .split(/\r?\n/)
    .entries()) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line) {
      continue;
    }
    const match = MARK_LINE.exec(line);
    const at = match ? parseClock(match[1]) : null;
    const problem = reason => ({ marks, problem: { reason, line: index + 1 } });
    if (at === null) {
      return problem("format");
    }
    if (match[2].length > VOD_MARK_TEXT_MAX) {
      return problem("long");
    }
    if (marks.length >= VOD_MARKS_MAX) {
      return problem("many");
    }
    marks.push({ at, text: match[2] });
  }
  return { marks: marks.sort((left, right) => left.at - right.at), problem: null };
}

/** The moments as they are typed, one per line (what `parseMarks` reads). */
export const marksText = marks =>
  marks.map(mark => `${clockText(mark.at)} ${mark.text}`).join("\n");

// a name with at least one dot and letters in the last part: no "localhost", no numeric address
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/;

/**
 * The address of a video, written the same way every time, or null when it is not one: it must be
 * an https:// address of a site, without a login, a port or spaces. (Nothing is fetched from it; it
 * is only shown as a link.)
 */
export function vodAddress(value) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text || text.length > VOD_URL_MAX || /[\s\u0000-\u001f\u007f<>"'`\\]/.test(text)) {
    return null;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const fine =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    HOST.test(url.hostname) &&
    url.href.length <= VOD_URL_MAX;
  return fine ? url.href : null;
}

/** The site of a video, to show next to its link ("youtube.com"); "" when the address is not fine. */
export const vodHost = value => {
  const address = vodAddress(value);
  return address ? new URL(address).hostname.replace(/^www\./, "") : "";
};

/**
 * The address that opens the video at a moment, for the sites that take it in the address (YouTube,
 * Twitch videos, bilibili); the address itself for the others. Null when the address is not fine.
 */
export function vodLink(value, seconds = 0) {
  const address = vodAddress(value);
  if (!address || !seconds) {
    return address;
  }
  const url = new URL(address);
  const host = url.hostname.replace(/^(?:www|m)\./, "");
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    (host === "bilibili.com" && url.pathname.startsWith("/video/"))
  ) {
    url.searchParams.set("t", String(seconds));
  } else if (host === "twitch.tv" && url.pathname.startsWith("/videos/")) {
    url.searchParams.set(
      "t",
      `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m${seconds % 60}s`
    );
  }
  return url.href;
}

// The key a hero name is matched by when the series of the broadcasts (Liquipedia, YouTube, Facebook) are read: lower
// case letters and digits only. It is the same rule as `key()` in scripts/vod-drafts/lp_parse.py, so a name an
// administrator types on a hero sheet finds the hero the way the script reads it.

/** "Sun Ce" -> "sunce"; "Zhuge Liang (HoK)" -> "zhugeliang"; accents and symbols are dropped. */
export function heroNameKey(name) {
  let low = String(name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!low.includes("flowborn")) {
    low = low.replace(/\(.*?\)/g, "");
  }
  const key = low.replace(/[^a-z0-9]/g, "");
  return key.endsWith("hok") && key.length > 6 ? key.slice(0, -3) : key;
}

/** What can be kept as another name of a hero: something a key can be made of, not longer than the column. */
export const HERO_ALIAS_MAX = 80;
