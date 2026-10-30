import { currentLanguage, t } from "../../app/browser-i18n.js";

// Words and dates of the community, shared by its pages and by the notifications of the top bar.

export const roleLabel = role =>
  ({
    owner: t("Owner"),
    manager: t("Manager"),
    coach: t("Coach"),
    captain: t("Captain"),
    analyst: t("Analyst"),
    player: t("Player"),
    sub: t("Substitute")
  })[role] ?? role;

export const kindLabel = kind =>
  ({
    availability: t("Available"),
    unavailable: t("Unavailable"),
    scrim: t("Scrim"),
    tournament: t("Tournament match"),
    practice: t("Practice"),
    vod: t("VOD review"),
    meeting: t("Meeting")
  })[kind] ?? kind;

/** A time (milliseconds, or an ISO string) written with the options of Intl.DateTimeFormat. */
export const format = (time, options) =>
  new Intl.DateTimeFormat(currentLanguage(), options).format(new Date(time));

export const dateTimeLabel = time =>
  format(time, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

/** "5 minutes ago", "yesterday": in the language of the page. */
export const ago = time => {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  const formatter = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: "auto" });
  if (minutes < 60) {
    return formatter.format(-minutes, "minute");
  }
  if (minutes < 1440) {
    return formatter.format(-Math.round(minutes / 60), "hour");
  }
  return formatter.format(-Math.round(minutes / 1440), "day");
};
