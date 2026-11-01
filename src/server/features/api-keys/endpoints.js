// The addresses of the public API (/api/v1), the one list the gateway matches a request against, the
// discovery answer, the OpenAPI document (gateway-openapi.js), the MCP tools (gateway-mcp.js) and the /developers
// page are made from, and docs/API.md follows. Every address is a READ (GET) of something the application already
// serves to its signed-in people: the API forwards to the same code, so the same rules (who sees which series,
// what a team shared) apply to a key as to the person who made it.
//
// An entry: the scope a key needs, the path (":name" is a part of the address), the pattern it is matched
// with, the name of the tool an AI calls it by (also the OpenAPI operationId), a summary, and the query
// parameters it reads. Its example answer is in endpoint-examples.js.
//
// Not here, on purpose: the lists the staff edit with (the builds and the official ratings: they reach the
// public through the sheet of the hero and the public tier list), everything under /api/admin, the sign-in and
// account security routes, anything that writes, and the files (exports, calendars, pictures).

const ID = "[^/]+";
const at = (...parts) => new RegExp(`^${parts.join("")}$`);
const param = (name, description) => ({ name, description });

const PAGE = param("page", "The page of the list, from 1.");
const PAGE_SIZE = param("pageSize", "How many entries a page holds.");
const SEARCH = param("q", "Words to look for.");
/** The filters of the series and of the statistics of your scrims. */
const SERIES_FILTERS = [
  param("status", "active, complete or draw."),
  param("mode", "The game mode: global-ban-pick, free-for-all or classic."),
  param("draftMode", "The draft mode of the series."),
  SEARCH,
  param("from", "The first day, YYYY-MM-DD."),
  param("to", "The last day, YYYY-MM-DD.")
];
const POPULAR_FILTERS = [
  param("from", "The first day of the period, YYYY-MM-DD (the period spans 3 months at least)."),
  param("to", "The last day of the period, YYYY-MM-DD."),
  param("rule", "Only the games of one draft rule (empty: every rule)."),
  param("minGames", "The fewest games a draft or a hero needs to be ranked, 1 to 50.")
];
const MIN_GAMES = param("minGames", "The fewest games a figure needs to be shown.");

/** The families of the catalogue (the `:family` part of its addresses). */
export const CATALOG_FAMILIES = ["items", "arcana", "spells", "stats", "tags"];

export const API_ENDPOINTS = [
  // ---- the game -------------------------------------------------------------------------------------
  {
    scope: "game",
    path: "/heroes",
    pattern: at("/heroes"),
    tool: "list_heroes",
    summary: "The heroes of the Global roster (name, classes, lanes, picture)."
  },
  {
    scope: "game",
    path: "/heroes/:id",
    pattern: at("/heroes/", ID),
    tool: "get_hero",
    summary:
      "One hero: its sheet (skills, art), its recommended builds, its combos, its official ratings and the competitive figures.",
    query: [param("since", "Count the tournament games from this day on, YYYY-MM-DD.")]
  },
  {
    scope: "game",
    path: "/tier-list",
    pattern: at("/tier-list"),
    tool: "get_tier_list",
    summary:
      "The public tier list of each lane: tournament results first, the editors' ratings for the heroes played too little."
  },
  {
    scope: "game",
    path: "/catalog",
    pattern: at("/catalog"),
    tool: "get_catalog",
    summary:
      "The items, the arcana, the battle spells, the stats and the tags of the game, in one answer."
  },
  {
    scope: "game",
    path: "/catalog/:family",
    pattern: at(`/catalog/(?:${CATALOG_FAMILIES.join("|")})`),
    tool: "list_catalog_family",
    summary: "One family of the catalogue: items, arcana, spells, stats or tags."
  },
  {
    scope: "game",
    path: "/catalog/:family/:id",
    pattern: at(`/catalog/(?:${CATALOG_FAMILIES.join("|")})/`, "[0-9]{1,10}"),
    tool: "get_catalog_entry",
    summary:
      "One item, arcana, spell, stat or tag, by its number: everything its page shows (stats and tags by their number)."
  },

  // ---- the competitive scene ------------------------------------------------------------------------
  {
    scope: "competitive",
    path: "/tournaments",
    pattern: at("/tournaments"),
    tool: "list_tournaments",
    summary: "The tournament series entered by the staff.",
    query: [SEARCH, PAGE]
  },
  {
    scope: "competitive",
    path: "/tournaments/:id",
    pattern: at("/tournaments/", ID),
    tool: "get_tournament",
    summary: "One tournament series with all its games: bans, picks, lanes, winner, duration."
  },
  {
    scope: "competitive",
    path: "/popular/drafts",
    pattern: at("/popular/drafts"),
    tool: "popular_drafts",
    summary: "The drafts that win and are played most in the tournament games.",
    query: POPULAR_FILTERS
  },
  {
    scope: "competitive",
    path: "/popular/heroes",
    pattern: at("/popular/heroes"),
    tool: "popular_heroes",
    summary: "The heroes that win and are played most in the tournament games, by lane.",
    query: POPULAR_FILTERS
  },

  // ---- your scrims ----------------------------------------------------------------------------------
  {
    scope: "scrims",
    path: "/series",
    pattern: at("/series"),
    tool: "list_series",
    summary: "Your series, and the ones a team of yours shared.",
    query: [
      PAGE,
      PAGE_SIZE,
      param("view", "summary (lighter) or full."),
      param("sort", "updated, oldest or created."),
      ...SERIES_FILTERS
    ]
  },
  {
    scope: "scrims",
    path: "/series/:id",
    pattern: at("/series/", ID),
    tool: "get_series",
    summary: "One series with every game of it."
  },
  {
    scope: "scrims",
    path: "/stats/overview",
    pattern: at("/stats/overview"),
    tool: "scrim_stats_overview",
    summary: "The statistics of your scrims (figures under the minimum sample are withheld).",
    query: [...SERIES_FILTERS, MIN_GAMES]
  },
  {
    scope: "scrims",
    path: "/stats/heroes",
    pattern: at("/stats/heroes"),
    tool: "scrim_stats_heroes",
    summary: "The per-hero statistics of your scrims.",
    query: [
      ...SERIES_FILTERS,
      MIN_GAMES,
      PAGE,
      PAGE_SIZE,
      param("order", "How the heroes are sorted (presence by default)."),
      param("hero", "Only the heroes whose name holds these letters.")
    ]
  },
  {
    scope: "scrims",
    path: "/heroes/:id/scrims",
    pattern: at("/heroes/", ID, "/scrims"),
    tool: "hero_scrim_stats",
    summary: "What your scrims say of one hero: picks, bans, synergies, matchups."
  },

  // ---- your tier lists ------------------------------------------------------------------------------
  {
    scope: "tier-lists",
    path: "/tier-lists",
    pattern: at("/tier-lists"),
    tool: "list_my_tier_lists",
    summary: "Your tier lists, and the ones shared with you.",
    query: [PAGE, PAGE_SIZE, param("lane", "Only the lists of one lane."), SEARCH]
  },
  {
    scope: "tier-lists",
    path: "/tier-lists/:id",
    pattern: at("/tier-lists/", ID),
    tool: "get_my_tier_list",
    summary: "One tier list with its placements."
  },

  // ---- your teams -----------------------------------------------------------------------------------
  {
    scope: "teams",
    path: "/me/teams",
    pattern: at("/me/teams"),
    tool: "my_teams",
    summary: "The teams you belong to, with your role in each."
  },
  {
    scope: "teams",
    path: "/teams",
    pattern: at("/teams"),
    tool: "list_teams",
    summary: "The teams of the community.",
    query: [
      SEARCH,
      PAGE,
      PAGE_SIZE,
      param("level", "Only the teams of one level."),
      param("region", "Only the teams of one region.")
    ]
  },
  {
    scope: "teams",
    path: "/teams/:id",
    pattern: at("/teams/", ID),
    tool: "get_team",
    summary: "One team: its members and its settings that you may see."
  },
  {
    scope: "teams",
    path: "/teams/:id/events",
    pattern: at("/teams/", ID, "/events"),
    tool: "team_events",
    summary: "The agenda of one of your teams."
  },
  {
    scope: "teams",
    path: "/teams/:id/series",
    pattern: at("/teams/", ID, "/series"),
    tool: "team_series",
    summary: "The series that this team shared with its members."
  },
  {
    scope: "teams",
    path: "/me/agenda",
    pattern: at("/me/agenda"),
    tool: "my_agenda",
    summary: "Your agenda: the events of all your teams.",
    query: [
      param("from", "The start of the window, in milliseconds since 1970."),
      param("to", "The end of the window, in milliseconds since 1970.")
    ]
  },

  // ---- your training --------------------------------------------------------------------------------
  {
    scope: "training",
    path: "/training/focus",
    pattern: at("/training/focus"),
    tool: "training_focus",
    summary: "The heroes you work on."
  },
  {
    scope: "training",
    path: "/training/notes",
    pattern: at("/training/notes"),
    tool: "training_notes",
    summary: "Your training notebook."
  },
  {
    scope: "training",
    path: "/training/combos",
    pattern: at("/training/combos"),
    tool: "training_combos",
    summary: "The combos you have acquired."
  },
  {
    scope: "training",
    path: "/training/combos/review",
    pattern: at("/training/combos/review"),
    tool: "training_combos_due",
    summary: "The combos that are due for a check."
  },
  {
    scope: "training",
    path: "/training/maps",
    pattern: at("/training/maps"),
    tool: "training_maps",
    summary: "The maps of the situations."
  },
  {
    scope: "training",
    path: "/training/scenarios",
    pattern: at("/training/scenarios"),
    tool: "list_training_scenarios",
    summary: "The situations prepared by the staff."
  },
  {
    scope: "training",
    path: "/training/scenarios/:id",
    pattern: at("/training/scenarios/", ID),
    tool: "get_training_scenario",
    summary: "One situation."
  },
  {
    scope: "training",
    path: "/training/reflex",
    pattern: at("/training/reflex"),
    tool: "training_reflex",
    summary: "Your reflex training results."
  },
  {
    scope: "training",
    path: "/space",
    pattern: at("/space"),
    tool: "my_space",
    summary: "Your personal space (the builds and notes you keep)."
  },

  // ---- your account ---------------------------------------------------------------------------------
  // answered by the gateway itself (gateway.js), never by the application
  {
    scope: "account",
    path: "/me",
    pattern: at("/me"),
    tool: "whoami",
    summary: "Who the key belongs to (tag and name, never the email), its scopes and its expiry."
  }
];

/** The endpoint a request path is, or null (the API then answers "unknown endpoint"). */
export const endpointOf = path =>
  API_ENDPOINTS.find(endpoint => endpoint.pattern.test(path)) ?? null;
