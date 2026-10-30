// The pages that are downloaded only when somebody opens them (client/app/lazy-pages.js): which module draws which view.
// The build finds the chunk of each module (scripts/build/build.mjs, `pages` of the manifest) and the page handler
// asks the browser to fetch the chunk of the view it serves together with the HTML (platform/http/pages.js), instead of
// after the main script has found out which page it must draw: one round trip less before the page can be drawn.
// app/lazy-views.js is where a view meets its loader; src/shared/view-modules.test.js keeps the two in step.
export const VIEW_MODULES = {
  home: "client/features/home/home-page.js",
  "tier-lists": "client/features/tier-lists/tier-list-page.js",
  scrims: "client/features/scrims/scrims-page.js",
  history: "client/features/history/history-page.js",
  heroes: "client/features/heroes/hero-pages.js",
  hero: "client/features/heroes/hero-pages.js",
  "build-lab": "client/features/build-lab/build-lab-page.js",
  items: "client/features/gamedata/gamedata-page.js",
  arcana: "client/features/gamedata/gamedata-page.js",
  spells: "client/features/gamedata/gamedata-page.js",
  popular: "client/features/popular/popular-page.js",
  ratings: "client/features/ratings/rating-editor.js",
  space: "client/features/space/space-page.js",
  "space-shared": "client/features/space/space-page.js",
  guides: "client/features/guides/guide-editor.js",
  catalog: "client/features/catalog/catalog-page.js",
  settings: "client/features/settings/settings-page.js",
  welcome: "client/features/settings/onboarding.js",
  training: "client/features/training/training-pages.js",
  find: "client/features/community/community-pages.js",
  inbox: "client/features/community/community-pages.js",
  agenda: "client/features/community/community-pages.js",
  discord: "client/features/community/community-pages.js",
  player: "client/features/community/community-pages.js",
  reports: "client/features/community/community-pages.js",
  teams: "client/features/teams/team-page.js",
  team: "client/features/teams/team-page.js",
  tournaments: "client/features/tournaments/tournament-page.js",
  terms: "client/features/legal/legal-page.js",
  privacy: "client/features/legal/legal-page.js",
  cookies: "client/features/legal/legal-page.js",
  legal: "client/features/legal/legal-page.js",
  contact: "client/features/legal/legal-page.js"
};

// What a page needs in memory before it can be drawn. Every page shows a portrait or the name of a hero, so the roster
// is always loaded; the series of the person and their tier lists are only read by a few pages, and the others no longer
// wait for them (they are fetched when somebody opens one of those pages). The server preloads the same calls with the
// HTML (platform/http/pages.js) and the browser loads them in app/roster-data.js: one table, so that they cannot differ.
// src/shared/view-needs.test.js keeps it in step with the files that read the series and the tier lists.

/** The pages that read `state.series` (the list of series of the person). */
const NEEDS_SERIES = new Set(["scrims", "live", "history", "player"]);

/** The pages that read `state.tierLists`. */
const NEEDS_TIER_LISTS = new Set(["tier-lists"]);

/** The data a view needs, among "heroes", "series" and "tierLists". */
export function needsOf(view) {
  return [
    "heroes",
    ...(NEEDS_SERIES.has(view) ? ["series"] : []),
    ...(NEEDS_TIER_LISTS.has(view) ? ["tierLists"] : [])
  ];
}

/** The API calls that load each kind of data (the client requests exactly these addresses). */
export const DATA_CALLS = {
  heroes: "/api/heroes",
  series: "/api/series?pageSize=100",
  tierLists: "/api/tier-lists?pageSize=100"
};
