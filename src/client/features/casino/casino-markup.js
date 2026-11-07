// casino page, markup: the landing, a roulette (its five lanes, the bans, the history) and the page of a roulette gone.
import { dateTime, t } from "../../app/browser-i18n.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { slotImage } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { sceneArtSlot } from "../../domain/scene-art.js";

/** The five lanes, in the order they are shown, with the site's lane names (icons and labels). */
export const LANES = [
  ["clash", "Clash Lane"],
  ["jungle", "Jungle"],
  ["mid", "Mid Lane"],
  ["farm", "Farm Lane"],
  ["roam", "Roamer"]
];
const SITE_LANE = Object.fromEntries(LANES);

const nameOf = (heroes, id) => {
  const hero = heroes.get(id);
  return hero ? hero.displayName || hero.name : id;
};

/** The card of a hero in a reel: its portrait and its name. */
export const heroCard = (view, heroes, id) => {
  const hero = heroes.get(id);
  return `<span class="casino-hero" data-hero="${view.esc(id)}"><span class="casino-hero__art">${hero ? slotImage(hero) : `<span class="image-fallback"></span>`}</span><b>${view.esc(nameOf(heroes, id))}</b></span>`;
};

const createButton = () =>
  `<button type="button" class="btn btn--primary" data-action="casino-create">${icon("dice", "i--sm")}${t("Create a roulette")}</button>`;

/** The basket's button, with how many compositions it holds. */
export const basketButton = (count = 0) =>
  `<button type="button" class="btn" data-action="casino-basket-open">${icon("basket", "i--sm")}${t("Basket")} <b class="casino-count">${Number(count) || 0}</b></button>`;

// the stage that opens the page, as on the other pages: the cover of a hero behind a veil, the title, what to do
const stage = ({ art = null, lead, actions = "" }) =>
  `<header class="page-head cs-stage keep-dark rise">${sceneArtSlot("cs-stage__art", art)}<div class="cs-stage__title"><h1>${t("Composition roulette")}</h1><p>${lead}</p></div>${actions ? `<div class="cs-stage__actions">${actions}</div>` : ""}</header>`;

/** /casino: what the roulette does, and the button that makes one. */
export const landingMarkup = (
  view,
  { art = null, basket = 0 } = {}
) => `<section class="casino casino--landing">
  ${stage({
    art,
    lead: t(
      "Choose a pool of heroes for each lane, spin, and get one hero per lane. Share the link: your friends watch the result live, no account needed."
    ),
    actions: `${createButton()}${basket ? basketButton(basket) : ""}`
  })}
  <div class="casino-board casino-board--demo" aria-hidden="true">${LANES.map(([, lane]) => `<div class="casino-slot"><div class="casino-square"><div class="casino-reel"><span class="casino-hero casino-hero--blank">?</span></div><span class="casino-square__lane">${laneLogos([lane], 22, { decorative: true })}</span></div></div>`).join("")}</div>
</section>`;

/** /casino/<id> when no roulette has that id (never made, or deleted after 7 days without use). */
export const missingMarkup = (
  view,
  { art = null } = {}
) => `<section class="casino casino--missing">
  ${stage({ art, lead: t("This roulette does not exist or has expired."), actions: createButton() })}
</section>`;

// what a lane can draw, for everyone (owner, 2026-11-07): its pool as small avatars, the drawn hero marked, a banned
// one greyed (it stays in the pool and comes back when it is unbanned)
const poolMarkup = (view, state, heroes, key) => {
  const pool = state.pools?.[key] ?? [];
  const banned = new Set(state.banned ?? []);
  const drawn = state.result?.[key] ?? null;
  if (!pool.length) {
    return `<div class="casino-slot__pool"><p class="casino-slot__count">${t("No hero in this pool")}</p></div>`;
  }
  const options = pool
    .map(id => {
      const hero = heroes.get(id);
      const kind = banned.has(id)
        ? " casino-option--banned"
        : id === drawn
          ? " casino-option--drawn"
          : "";
      const name = nameOf(heroes, id);
      const title = banned.has(id) ? `${name} (${t("Banned")})` : name;
      return `<li class="casino-option${kind}" data-hero="${view.esc(id)}" title="${view.esc(title)}"><span class="casino-option__art">${hero ? slotImage(hero) : '<span class="image-fallback"></span>'}</span>${banned.has(id) ? icon("ban", "casino-option__ban") : ""}<span class="visually-hidden">${view.esc(title)}</span></li>`;
    })
    .join("");
  return `<div class="casino-slot__pool"><p class="casino-slot__count">${t("{count, plural, one {# hero} other {# heroes}}", { count: pool.length })}</p><ul>${options}</ul></div>`;
};

const slotMarkup = (view, state, heroes, control, key) => {
  const lane = SITE_LANE[key];
  const id = state.result?.[key] ?? null;
  const spun = state.history.length > 0;
  const content = id
    ? heroCard(view, heroes, id)
    : `<span class="casino-hero casino-hero--blank">${spun ? t("No hero left in this pool") : t("Not spun yet")}</span>`;
  // a spectator respins on their own screen too (casino-local.js); only the creator bans, for everyone
  const tools = `<div class="casino-slot__tools"><button type="button" class="casino-toggle" data-action="casino-lane-toggle" data-lane="${key}" aria-pressed="false">${icon("refresh", "i--sm")}<span>${t("Respin")}</span></button>${
    control && id
      ? `<button type="button" class="btn btn--sm casino-ban" data-action="casino-ban" data-lane="${key}">${icon("ban", "i--sm")}${t("Banned")}</button>`
      : ""
  }</div>`;
  return `<div class="casino-slot" data-lane="${key}">
    <div class="casino-square">
      <div class="casino-reel" data-lane="${key}">${content}</div>
      <span class="casino-square__lane" title="${view.esc(laneLabel(lane))}">${laneLogos([lane], 22, { decorative: true })}<span class="visually-hidden">${view.esc(laneLabel(lane))}</span></span>
    </div>
    ${tools}
    ${poolMarkup(view, state, heroes, key)}
  </div>`;
};

const bannedMarkup = (view, state, heroes, control) =>
  state.banned.length
    ? `<section class="casino-banned"><h2>${t("Banned")}</h2><ul>${state.banned
        .map(
          id =>
            `<li>${heroCard(view, heroes, id)}${control ? `<button type="button" class="btn btn--ghost btn--sm" data-action="casino-unban" data-hero="${view.esc(id)}">${icon("undo", "i--sm")}${t("Put back")}</button>` : ""}</li>`
        )
        .join("")}</ul></section>`
    : "";

const entryLabel = (view, entry, heroes) => {
  if (entry.kind === "ban") {
    return t("Ban: {hero}, {lane} respun", {
      hero: nameOf(heroes, entry.hero),
      lane: laneLabel(SITE_LANE[entry.lanes[0]])
    });
  }
  if (entry.kind === "respin") {
    return t("Respin: {lanes}", {
      lanes: entry.lanes.map(l => laneLabel(SITE_LANE[l])).join(", ")
    });
  }
  return t("Full spin");
};

const historyMarkup = (view, state, heroes) =>
  state.history.length
    ? `<section class="casino-history"><h2>${t("Last spins")}</h2><ol>${state.history
        .map(
          entry =>
            `<li><time>${view.esc(dateTime(entry.at))}</time><span>${view.esc(entryLabel(view, entry, heroes))}</span><span class="casino-history__heroes">${LANES.map(([key]) => view.esc(entry.result[key] ? nameOf(heroes, entry.result[key]) : "—")).join(" · ")}</span></li>`
        )
        .join("")}</ol></section>`
    : "";

// a spectator spun on their own screen (`local`): it says so, and the way back to the roulette everyone sees
const localBanner = local =>
  local
    ? `<p class="casino-local" role="status">${icon("eye", "i--sm")}<span><b>${t("Your spin — only on your screen")}</b>${local.creatorSpun ? ` ${t("The creator spun.")}` : ""}</span><button type="button" class="btn btn--sm" data-action="casino-live">${t("Back to the live roulette")}</button></p>`
    : "";

/**
 * A roulette: its five lanes, the spin buttons and a Respin toggle per lane for everyone (a spectator spins on their
 * own screen only, `local`); for its creator (`control`) a Banned button per hero shown and the private control link.
 * `extra` is the pool editor (creator only).
 */
export const rollMarkup = (
  view,
  state,
  heroes,
  { control, extra = "", basket = 0, art = null, local = null }
) => `<section class="casino casino--roll" data-version="${Number(state.version)}">
  ${stage({
    art,
    lead: control
      ? t("Spin, respin a lane when a hero is banned, and keep the teams you like in the basket.")
      : t("Watching live: each spin of the creator shows here as it lands."),
    actions: `<button type="button" class="btn btn--sm" data-action="casino-copy-link">${icon("link", "i--sm")}${t("Copy the share link")}</button>${
      control
        ? `<button type="button" class="btn btn--sm" data-action="casino-copy-control">${icon("key", "i--sm")}${t("Copy my control link")}</button>`
        : `<span class="casino-watching">${icon("eye", "i--sm")}${t("Watching live")}</span>`
    }${basketButton(basket)}`
  })}
  <div class="casino-board">${LANES.map(([key]) => slotMarkup(view, state, heroes, control, key)).join("")}</div>
  ${localBanner(local)}
  <p class="casino-actions"><button type="button" class="btn btn--primary" data-action="casino-spin">${icon("dice", "i--sm")}${t("Spin all lanes")}</button><button type="button" class="btn" data-action="casino-respin">${icon("refresh", "i--sm")}${t("Respin the chosen lanes")}</button><button type="button" class="btn" data-action="casino-basket-add">${icon("plus", "i--sm")}${t("Add to the basket")}</button></p>
  ${bannedMarkup(view, state, heroes, control)}
  ${historyMarkup(view, state, heroes)}
  ${extra}
</section>`;
