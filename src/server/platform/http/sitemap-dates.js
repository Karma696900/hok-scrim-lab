// The <lastmod> of the sitemap: the day a page really changed, so that search engines come back to read it (they stop
// trusting a sitemap whose dates move every day). Only the pages whose change is known carry one: the tier list (the
// day of its last game or rating) and a hero page (its latest balance change). The others carry none.
import { heroPath } from "../../../shared/hero-slug.js";

const TIER_LIST_PAGES = [
  "/tier-list",
  ...["clash", "jungle", "mid", "farm", "roam"].map(lane => `/tier-list/${lane}`)
];

/** The latest day (YYYY-MM-DD) of `days` not after `today`; null when none. */
export function lastChange(days, today) {
  let latest = null;
  for (const value of days ?? []) {
    const day = typeof value === "string" ? value.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today && (latest === null || day > latest)) {
      latest = day;
    }
  }
  return latest;
}

/** address -> day, for the pages whose last change is known. */
export function sitemapDates({ tierListDay, changes, heroes, today }) {
  const dates = new Map();
  const tierList = lastChange([tierListDay], today);
  if (tierList) {
    for (const page of TIER_LIST_PAGES) {
      dates.set(page, tierList);
    }
  }
  for (const hero of heroes) {
    const day = lastChange(changes?.[hero.id], today);
    if (day) {
      dates.set(heroPath(heroes, hero.id), day);
    }
  }
  return dates;
}
