// The season of the game today, read from the balance changes of the heroes (their Camp sheets name the season of
// each change: "S15"). The tier list names it in its title and its heading: players search "tier list season 15".

/** The number of the latest season already published on `today` (YYYY-MM-DD), or null. */
export function latestSeason(changes, today) {
  let best = null;
  for (const change of changes) {
    const number = Number(/^S(\d{1,3})$/.exec(String(change?.seasonName ?? "").trim())?.[1]);
    const day = typeof change?.publishedAt === "string" ? change.publishedAt.slice(0, 10) : "";
    if (Number.isInteger(number) && day && day <= today && (best === null || number > best)) {
      best = number;
    }
  }
  return best;
}
