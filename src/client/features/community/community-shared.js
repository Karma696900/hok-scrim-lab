// What the community pages have in common: the values a form offers, the words for them and the
// way times are written.
import { t } from "../../app/browser-i18n.js";
import { dateTimeLabel, format } from "./labels.js";
import { escapeHtml } from "../../lib/dom.js";

export const LEVELS = ["casual", "amateur", "semi-pro", "pro"];
export const REGIONS = ["EU", "NA", "SEA", "LATAM", "MENA", "SA", "OCE", "EA"];
export const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
export const FORMATS = [1, 3, 5, 7];
export const ROLES = ["manager", "coach", "captain", "analyst", "player", "sub"];
export const KINDS = [
  "scrim",
  "tournament",
  "practice",
  "vod",
  "meeting",
  "availability",
  "unavailable"
];
export const KIND_ICONS = {
  scrim: "swords",
  tournament: "trophy",
  practice: "target",
  vod: "video",
  meeting: "users",
  availability: "clock",
  unavailable: "ban"
};
export const HERO_RULES = ["global-ban-pick", "free-for-all"];
export const CONTROLS = ["online", "external"];
/** Who may ask for, answer or discuss a scrim for a team (the server checks it again). */
export const STAFF = ["owner", "manager", "coach", "captain"];
export const TIMEZONES = [
  "",
  "UTC",
  ...Array.from({ length: 14 }, (_, index) => `UTC+${index + 1}`),
  ...Array.from({ length: 12 }, (_, index) => `UTC-${index + 1}`)
];

export const levelLabel = level =>
  ({ casual: t("Casual"), amateur: t("Amateur"), "semi-pro": t("Semi-pro"), pro: t("Pro") })[
    level
  ] ?? level;
export const ruleLabel = rule =>
  rule === "global-ban-pick" ? t("Global Ban & Pick") : t("Free For All");
export const controlLabel = control =>
  control === "online" ? t("Online room") : t("External lobby");
export const statusLabel = status =>
  ({
    pending: t("Pending"),
    countered: t("Counter-proposal"),
    accepted: t("Accepted"),
    declined: t("Declined"),
    cancelled: t("Cancelled")
  })[status] ?? status;
export const labelName = label =>
  ({
    verified: t("Verified"),
    moderator: t("Moderator"),
    organiser: t("Organiser"),
    contributor: t("Contributor")
  })[label] ?? label;

/** The tone of the pill of a request's status (the pill classes of the design system). */
export const statusTone = status =>
  ({
    accepted: "",
    declined: " pill--red",
    cancelled: " pill--grey",
    pending: " pill--warn",
    countered: " pill--warn"
  })[status] ?? " pill--grey";

let zone = null;
/** The time zone of the person ("Europe/Paris"); asked once, the first look is slow on a phone. */
export const zoneName = () => (zone ??= Intl.DateTimeFormat().resolvedOptions().timeZone);
export const dayLabel = time => format(time, { weekday: "long", day: "numeric", month: "long" });
export const hourLabel = time => format(time, { hour: "2-digit", minute: "2-digit" });
/** The value of a datetime-local input (the viewer's own time zone) for an instant. */
export const localInput = time =>
  new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const dayKey = time => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
/** "Tue, Oct 6, 4:00 PM–6:00 PM", as markup (escaped). */
export const slotText = (startsAt, endsAt) =>
  `${escapeHtml(dateTimeLabel(startsAt))}–${escapeHtml(hourLabel(endsAt))}`;

/** The <option> tags of a select. */
export const options = (values, selected, label = value => value) =>
  values
    .map(
      value =>
        `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(label(value))}</option>`
    )
    .join("");
