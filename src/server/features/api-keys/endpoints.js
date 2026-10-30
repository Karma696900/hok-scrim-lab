// The addresses of the public API (/api/v1), the one list the gateway matches a request against, the
// discovery answer is made from, and docs/API.md follows. Every address is a READ (GET) of something the
// application already serves to its signed-in people: the API forwards to the same code, so the same
// rules (who sees which series, what a team shared) apply to a key as to the person who made it.
//
// Not here, on purpose: the lists the staff edit with (the builds and the official ratings: they reach the
// public through the sheet of the hero), everything under /api/admin, the sign-in and account security routes, anything
// that writes, and the files (exports, calendars, pictures).

const ID = "[^/]+";
const at = (...parts) => new RegExp(`^${parts.join("")}$`);

export const API_ENDPOINTS = [
  // ---- the game -------------------------------------------------------------------------------------
  {
    scope: "game",
    path: "/heroes",
    pattern: at("/heroes"),
    summary: "The heroes of the Global roster (name, classes, lanes, picture)."
  },
  {
    scope: "game",
    path: "/heroes/:id",
    pattern: at("/heroes/", ID),
    summary:
      "One hero: its sheet (skills, art), its recommended builds, its combos, its official ratings and the competitive figures."
  },
  {
    scope: "game",
    path: "/catalog",
    pattern: at("/catalog"),
    summary:
      "The items, the arcana, the battle spells, the stats and the tags of the game, in one answer."
  },
  {
    scope: "game",
    path: "/catalog/:family",
    pattern: at("/catalog/(?:items|arcana|spells|stats|tags)"),
    summary: "One family of the catalogue: items, arcana, spells, stats or tags."
  },
  {
    scope: "game",
    path: "/catalog/:family/:id",
    pattern: at("/catalog/(?:items|arcana|spells|stats|tags)/", "[0-9]{1,10}"),
    summary: "One item, arcana, spell, stat or tag, by its number."
  },

  // ---- the competitive scene ------------------------------------------------------------------------
  {
    scope: "competitive",
    path: "/tournaments",
    pattern: at("/tournaments"),
    summary: "The tournament series entered by the staff (query: q, page)."
  },
  {
    scope: "competitive",
    path: "/tournaments/:id",
    pattern: at("/tournaments/", ID),
    summary: "One tournament series with all its games: bans, picks, lanes, winner, duration."
  },
  {
    scope: "competitive",
    path: "/popular/drafts",
    pattern: at("/popular/drafts"),
    summary: "The drafts that win and are played most in the tournament games."
  },
  {
    scope: "competitive",
    path: "/popular/heroes",
    pattern: at("/popular/heroes"),
    summary: "The heroes that win and are played most in the tournament games, by lane."
  },

  // ---- your scrims ----------------------------------------------------------------------------------
  {
    scope: "scrims",
    path: "/series",
    pattern: at("/series"),
    summary:
      "Your series, and the ones a team of yours shared (query: page, pageSize, view=summary|full, filters)."
  },
  {
    scope: "scrims",
    path: "/series/:id",
    pattern: at("/series/", ID),
    summary: "One series with every game of it."
  },
  {
    scope: "scrims",
    path: "/stats/overview",
    pattern: at("/stats/overview"),
    summary: "The statistics of your scrims (figures under the minimum sample are withheld)."
  },
  {
    scope: "scrims",
    path: "/stats/heroes",
    pattern: at("/stats/heroes"),
    summary: "The per-hero statistics of your scrims."
  },
  {
    scope: "scrims",
    path: "/heroes/:id/scrims",
    pattern: at("/heroes/", ID, "/scrims"),
    summary: "What your scrims say of one hero: picks, bans, synergies, matchups."
  },

  // ---- your tier lists ------------------------------------------------------------------------------
  {
    scope: "tier-lists",
    path: "/tier-lists",
    pattern: at("/tier-lists"),
    summary: "Your tier lists, and the ones shared with you (query: page, pageSize, lane, q)."
  },
  {
    scope: "tier-lists",
    path: "/tier-lists/:id",
    pattern: at("/tier-lists/", ID),
    summary: "One tier list with its placements."
  },

  // ---- your teams -----------------------------------------------------------------------------------
  {
    scope: "teams",
    path: "/me/teams",
    pattern: at("/me/teams"),
    summary: "The teams you belong to, with your role in each."
  },
  {
    scope: "teams",
    path: "/teams",
    pattern: at("/teams"),
    summary: "The teams of the community (query: q, page)."
  },
  {
    scope: "teams",
    path: "/teams/:id",
    pattern: at("/teams/", ID),
    summary: "One team: its members and its settings that you may see."
  },
  {
    scope: "teams",
    path: "/teams/:id/events",
    pattern: at("/teams/", ID, "/events"),
    summary: "The agenda of one of your teams."
  },
  {
    scope: "teams",
    path: "/teams/:id/series",
    pattern: at("/teams/", ID, "/series"),
    summary: "The series that this team shared with its members."
  },
  {
    scope: "teams",
    path: "/me/agenda",
    pattern: at("/me/agenda"),
    summary: "Your agenda: the events of all your teams (query: from, to)."
  },

  // ---- your training --------------------------------------------------------------------------------
  {
    scope: "training",
    path: "/training/focus",
    pattern: at("/training/focus"),
    summary: "The heroes you work on."
  },
  {
    scope: "training",
    path: "/training/notes",
    pattern: at("/training/notes"),
    summary: "Your training notebook."
  },
  {
    scope: "training",
    path: "/training/combos",
    pattern: at("/training/combos"),
    summary: "The combos you have acquired."
  },
  {
    scope: "training",
    path: "/training/combos/review",
    pattern: at("/training/combos/review"),
    summary: "The combos that are due for a check."
  },
  {
    scope: "training",
    path: "/training/maps",
    pattern: at("/training/maps"),
    summary: "The maps of the situations."
  },
  {
    scope: "training",
    path: "/training/scenarios",
    pattern: at("/training/scenarios"),
    summary: "The situations prepared by the staff."
  },
  {
    scope: "training",
    path: "/training/scenarios/:id",
    pattern: at("/training/scenarios/", ID),
    summary: "One situation."
  },
  {
    scope: "training",
    path: "/training/reflex",
    pattern: at("/training/reflex"),
    summary: "Your reflex training results."
  },
  {
    scope: "training",
    path: "/space",
    pattern: at("/space"),
    summary: "Your personal space (the builds and notes you keep)."
  }
];

/** The endpoint a request path is, or null (the API then answers "unknown endpoint"). */
export const endpointOf = path =>
  API_ENDPOINTS.find(endpoint => endpoint.pattern.test(path)) ?? null;
