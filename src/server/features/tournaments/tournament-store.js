import { createTtlCache } from "../../platform/cache.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as tournamentStoreParse } from "./tournament-store-parse.js";
import { onView as tournamentStoreTournamentSuggestions } from "./tournament-store-tournament-suggestions.js";
import { onView as tournamentStoreCompetitiveImports } from "./tournament-store-competitive-imports.js";

export function createCompetitiveStore({ pool, inTransaction }) {
  const ctx = { inTransaction, pool };
  bindTo(
    ctx,
    tournamentStoreParse,
    tournamentStoreTournamentSuggestions,
    tournamentStoreCompetitiveImports
  );

  // The games, the summary and the results computed from them (the popularity pages) live for 30 s and
  // are all dropped by any write; a read that began before a write is not kept after it.
  // (at most 24 entries: the games of a period are a few MB, and the period is chosen by the visitor)
  ctx.cache = createTtlCache({ ttlMs: 30_000, maxEntries: 24 });

  return {
    createTournament: ctx.createTournament,

    replaceTournament: ctx.replaceTournament,

    deleteTournament: ctx.deleteTournament,

    getTournament: ctx.getTournament,

    listTournaments: ctx.listTournaments,

    tournamentSuggestions: ctx.tournamentSuggestions,

    competitiveGames: ctx.competitiveGames,

    competitiveSummary: ctx.competitiveSummary,

    rememberCompetitive: ctx.rememberCompetitive,

    createCompetitiveImport: ctx.createCompetitiveImport,
    listCompetitiveImports: ctx.listCompetitiveImports,
    deleteCompetitiveImport: ctx.deleteCompetitiveImport,
    getHeroCompetitive: ctx.getHeroCompetitive
  };
}
