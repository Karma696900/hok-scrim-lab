// The window of time the statistics are about, and how it is kept.
import { t } from "../../app/browser-i18n.js";

const WINDOW_KEY = "hok.statsWindow";

export const WINDOWS = ["all", "year", "12m", "6m", "3m", "from"];

const pad = value => String(value).padStart(2, "0");

const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The recency window the visitor chose, kept in the browser: { kind, date }. */
export function readWindow() {
  try {
    const saved = JSON.parse(localStorage.getItem(WINDOW_KEY) || "null");
    if (
      saved &&
      WINDOWS.includes(saved.kind) &&
      (saved.kind !== "from" || /^\d{4}-\d{2}-\d{2}$/.test(saved.date))
    ) {
      return saved;
    }
  } catch {
    /* unreadable: the default applies */
  }
  return { kind: "all", date: "" };
}

export function saveWindow(value) {
  try {
    localStorage.setItem(WINDOW_KEY, JSON.stringify(value));
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
}

/** The first day included in a window (YYYY-MM-DD), or null for every game. */
export function sinceOf({ kind, date }, today = new Date()) {
  if (kind === "year") {
    return `${today.getFullYear()}-01-01`;
  }
  if (kind === "12m" || kind === "6m" || kind === "3m") {
    const back = new Date(
      today.getFullYear(),
      today.getMonth() - Number.parseInt(kind, 10),
      today.getDate()
    );
    return isoDay(back);
  }
  return kind === "from" && date ? date : null;
}

export const windowLabel = kind =>
  ({
    all: t("All time"),
    year: t("This year"),
    "12m": t("Last 12 months"),
    "6m": t("Last 6 months"),
    "3m": t("Last 3 months"),
    from: t("From a date")
  })[kind];
