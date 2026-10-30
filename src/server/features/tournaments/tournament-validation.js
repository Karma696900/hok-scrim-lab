import { badRequest } from "../../platform/errors.js";
import {
  HERO_ID_PATTERN,
  array,
  count,
  httpsUrl,
  plainObject,
  text
} from "../../platform/validation.js";
import { ALLOWED_LICENSES, assertGlobalRegion, csvToHeroRows } from "./competitive-import.js";

/**
 * Manual competitive import (admin only). Heroes are matched by Camp Global hero id, never by name.
 * Required provenance: source, sourceUrl, region, patch, updatedAt, licence + attribution (CC
 * BY-SA).
 */
export function parseCompetitiveImport(body, knownHeroIds) {
  const input = plainObject(body);
  const meta = plainObject(input.meta, "meta");
  if (meta.confirmGlobalOnly !== true) {
    throw badRequest(
      "Set meta.confirmGlobalOnly to true: only Honor of Kings Global data may be imported.",
      "invalid_body"
    );
  }
  const region = text(meta.region, "meta.region", { min: 2, max: 60 });
  try {
    assertGlobalRegion(`${region} ${meta.source ?? ""}`);
  } catch (error) {
    throw badRequest(error.template ?? error.message, "foreign_data", error.params);
  }
  const license = text(meta.license ?? "", "meta.license", { min: 1, max: 40 });
  if (!ALLOWED_LICENSES.includes(license)) {
    throw badRequest("meta.license must be one of: {value}.", "invalid_body", {
      value: ALLOWED_LICENSES.join(", ")
    });
  }
  const updatedAt = text(meta.updatedAt ?? "", "meta.updatedAt", { min: 8, max: 40 });
  if (!Number.isFinite(Date.parse(updatedAt))) {
    throw badRequest("meta.updatedAt must be a date (YYYY-MM-DD).", "invalid_body");
  }
  const totalGames = count(meta.totalGames, "meta.totalGames", 1_000_000);
  if (totalGames < 1) {
    throw badRequest("meta.totalGames must be at least 1.", "invalid_body");
  }

  let rawRows;
  if (input.csv !== undefined) {
    if (typeof input.csv !== "string" || input.csv.length > 300_000) {
      throw badRequest("csv must be text of at most 300 KB.", "invalid_body");
    }
    try {
      rawRows = csvToHeroRows(input.csv);
    } catch (error) {
      throw badRequest(error.template ?? error.message, "invalid_body", error.params);
    }
  } else {
    rawRows = input.heroes;
  }
  const rows = array(rawRows, "heroes", 400).map((row, index) => {
    plainObject(row, `heroes[${index}]`);
    const heroId = typeof row.heroId === "string" ? row.heroId.trim() : row.heroId;
    if (typeof heroId !== "string" || !HERO_ID_PATTERN.test(heroId)) {
      throw badRequest(
        "heroes[{index}].heroId is required (the Camp Global hero id).",
        "invalid_body",
        { index }
      );
    }
    if (!knownHeroIds.has(heroId)) {
      throw badRequest(
        "heroes[{index}].heroId {heroId} is not a known Global hero id.",
        "unknown_hero",
        { index, heroId }
      );
    }
    const picks = count(row.picks, `heroes[${index}].picks`, totalGames);
    const bans = count(row.bans, `heroes[${index}].bans`, totalGames);
    const wins = count(row.wins, `heroes[${index}].wins`, totalGames);
    if (wins > picks) {
      throw badRequest("heroes[{index}] has more wins than picks.", "invalid_body", { index });
    }
    return { heroId, picks, bans, wins };
  });
  if (!rows.length) {
    throw badRequest("heroes must contain at least one row.", "invalid_body");
  }
  if (new Set(rows.map(row => row.heroId)).size !== rows.length) {
    throw badRequest("heroes contains the same heroId twice.", "invalid_body");
  }
  return {
    source: text(meta.source ?? "", "meta.source", { min: 2, max: 120 }),
    sourceUrl: httpsUrl(meta.sourceUrl, "meta.sourceUrl"),
    region,
    patch: text(meta.patch ?? "", "meta.patch", { min: 1, max: 40 }),
    updatedAt,
    license,
    attribution: text(meta.attribution ?? "", "meta.attribution", { min: 10, max: 600 }),
    totalGames,
    rows
  };
}
