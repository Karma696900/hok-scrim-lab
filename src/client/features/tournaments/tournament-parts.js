// Small helpers of the page: the heroes, the names of the teams, the order of the slots.
import { GROUPS, PICKS } from "./tournament-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { laneName } from "../../domain/lanes.js";
import { responsive } from "../../../shared/media.js";
import { t } from "../../app/browser-i18n.js";

export const rise = (view, depth = "") => (view.entered ? "" : ` rise${depth}`);

export const heroes = view => view.state.heroes.filter(hero => hero.availableGlobal !== false);

export const heroById = (view, id) => view.state.heroes.find(hero => hero.id === id);

export const heroName = hero => hero.displayName || hero.name;

export const teamName = (view, token, series = view.editor) =>
  (token === "A" ? series.teamA : series.teamB).trim() ||
  (token === "A" ? t("Team A") : t("Team B"));

export const other = token => (token === "A" ? "B" : "A");

export const scoreOf = series => ({
  A: series.games.filter(game => game.winner === "A").length,
  B: series.games.filter(game => game.winner === "B").length
});

/** The heroes a slot cannot take: the ones already in the game; in an Ultimate Battle both teams may pick the same hero (the lineups are submitted blind), so a pick only looks at its own side. */
export const usedIn = (view, game) => {
  const mine =
    game.ultimateBattle && view.active?.group === "picks" ? game.picks[view.active.side] : null;
  return new Set(
    (mine
      ? [...mine, ...game.bans.blue, ...game.bans.red]
      : [...game.picks.blue, ...game.picks.red, ...game.bans.blue, ...game.bans.red]
    ).filter(Boolean)
  );
};

// ---- the lane each pick was played in: five logos to slide onto the heroes (or click a logo, then a hero)

export const laneText = lane => (lane ? laneName(lane) : t("No lane yet"));

export const listUrl = (view, at) =>
  `/api/admin/tournaments?page=${at}${view.query ? `&q=${encodeURIComponent(view.query)}` : ""}${view.verify ? `&verification=${view.verify}` : ""}`;

export const portrait = (hero, size) =>
  `<span class="pt s-${size}">${hero.image ? `<img ${responsive(hero.image, size)} alt="${escapeHtml(heroName(hero))}" width="${size}" height="${size}" loading="lazy" decoding="async">` : ""}</span>`;

/** The Ultimate Battle: the last game of a Global Ban & Pick series, the one that decides a tied series. */
export const canBeUltimate = (view, index) =>
  view.editor.rule === "global-ban-pick" &&
  index === view.editor.games.length - 1 &&
  view.editor.games.length === view.editor.bestOf;

// ---- slots ------------------------------------------------------------------------------------

export const orderOf = gameIndex =>
  GROUPS.flatMap(([group, side]) =>
    Array.from({ length: PICKS }, (_, index) => ({ game: gameIndex, group, side, index }))
  );

export const sameSlot = (a, b) =>
  a.game === b.game && a.group === b.group && a.side === b.side && a.index === b.index;

// ---- actions ----------------------------------------------------------------------------------

/**
 * The lanes in the order of the picks; the server wants five entries, a lane (or null) for each
 * pick.
 */
export const laneBody = game => ({
  blue: game.lanes.blue.map((lane, index) => (game.picks.blue[index] ? lane : null)),
  red: game.lanes.red.map((lane, index) => (game.picks.red[index] ? lane : null))
});

// ---- sliding a lane onto a hero (the click-then-click way above does the same without a pointer drag)

export const cellOf = event => event.target.closest?.("[data-cell]");

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { rise, heroes, heroById, teamName, usedIn, listUrl, canBeUltimate };
