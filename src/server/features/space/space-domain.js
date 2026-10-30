// The personal space of a person: the builds they keep on their account and the links with which they
// share their space (tier lists, builds, training sheet). Pure: the caller says which heroes exist and
// what time it is.
import { MAX_LEVEL, shapeBuild } from "../../../shared/build-model.js";
import { badRequest } from "../../platform/errors.js";
import { HERO_ID_PATTERN, integer, plainObject, text } from "../../platform/validation.js";

/** What a link can share, in the order the pages show them. */
export const SECTIONS = ["tierLists", "builds", "training"];
export const BUILDS_PER_HERO_MAX = 30;
export const BUILDS_IN_ALL_MAX = 300;
export const LINKS_MAX = 20;
/** The lifetimes a link can be given, in days; without one it lasts until its owner removes it. */
export const LINK_DAYS = [7, 30, 90];
const DAY = 86_400_000;
export const TOKEN_PREFIX = "sp_";
const TOKEN_PATTERN = /^sp_[A-Za-z0-9_-]{20,60}$/;

/** A build to keep: the hero it is for ("" for none), a name, the level it is read at, the build. */
export function parseBuild(body, knownHeroIds) {
  const input = plainObject(body, "The build");
  const heroId = input.heroId ?? "";
  if (
    typeof heroId !== "string" ||
    (heroId !== "" && !(HERO_ID_PATTERN.test(heroId) && knownHeroIds.has(heroId)))
  ) {
    throw badRequest("Choose a hero of the roster, or none.", "invalid_body");
  }
  const build = shapeBuild(input.build);
  const pieces =
    ["items", "utility", "late"].some(group => build[group].length) ||
    Object.values(build.arcana).some(entries => entries.length);
  if (!pieces) {
    throw badRequest("A build needs at least one item or arcana.", "invalid_body");
  }
  return {
    heroId,
    name: text(input.name ?? "", "name", { max: 60 }),
    level:
      input.level === undefined
        ? MAX_LEVEL
        : integer(input.level, "level", { min: 1, max: MAX_LEVEL }),
    build
  };
}

/** A link to give: what it shares (at least one part, each once), a name, how long it lasts. */
export function parseLink(body, now) {
  const input = plainObject(body, "The link");
  const wanted = input.sections;
  if (
    !Array.isArray(wanted) ||
    !wanted.length ||
    wanted.some(section => !SECTIONS.includes(section)) ||
    new Set(wanted).size !== wanted.length
  ) {
    throw badRequest("Choose what the link shares.", "invalid_body");
  }
  const days = input.days ?? null;
  if (days !== null && !LINK_DAYS.includes(days)) {
    throw badRequest("A link lasts 7, 30 or 90 days, or until you remove it.", "invalid_body");
  }
  return {
    label: text(input.label ?? "", "label", { max: 60 }),
    sections: SECTIONS.filter(section => wanted.includes(section)),
    expiresAt: days === null ? null : now + days * DAY
  };
}

/** The token a person pastes to open a space, or an error when it is not even shaped like one. */
export function parseToken(body) {
  const input = plainObject(body, "The request");
  if (typeof input.token !== "string" || !TOKEN_PATTERN.test(input.token)) {
    throw badRequest("This link is not valid.", "invalid_body");
  }
  return input.token;
}
