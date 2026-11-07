// casino page, markup: the landing, a roulette (its five lanes, the bans, the history) and the page of a roulette gone.
import { dateTime, t } from "../../app/browser-i18n.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { slotImage } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";

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
  `<button type="button" class="btn" data-action="casino-create">${icon("dice", "i--sm")}${t("Create a roulette")}</button>`;

/** /casino: what the roulette does, and the button that makes one. */
export const landingMarkup = () => `<section class="casino casino--landing">
  <header class="casino-head">
    <h1>${t("Composition roulette")}</h1>
    <p class="casino-lede">${t("Choose a pool of heroes for each lane, spin, and get one hero per lane. Share the link: your friends watch the result live, no account needed.")}</p>
  </header>
  <div class="casino-board casino-board--demo" aria-hidden="true">${LANES.map(([, lane]) => `<div class="casino-slot"><span class="casino-slot__lane">${laneLogos([lane], 22, { decorative: true })}</span><div class="casino-reel"><span class="casino-hero casino-hero--blank">?</span></div></div>`).join("")}</div>
  <p class="casino-actions">${createButton()}</p>
</section>`;

/** /casino/<id> when no roulette has that id (never made, or deleted after 7 days without use). */
export const missingMarkup = () => `<section class="casino casino--missing">
  <h1>${t("Composition roulette")}</h1>
  <p>${t("This roulette does not exist or has expired.")}</p>
  <p class="casino-actions">${createButton()}</p>
</section>`;

const slotMarkup = (view, state, heroes, control, key) => {
  const lane = SITE_LANE[key];
  const id = state.result?.[key] ?? null;
  const spun = state.history.length > 0;
  const content = id
    ? heroCard(view, heroes, id)
    : `<span class="casino-hero casino-hero--blank">${spun ? t("No hero left in this pool") : t("Not spun yet")}</span>`;
  const tick = control
    ? `<label class="casino-tick"><input type="checkbox" name="casino-lane" value="${key}"><span>${t("Respin")}</span></label>`
    : "";
  const ban =
    control && id
      ? `<button type="button" class="btn btn--ghost btn--sm" data-action="casino-ban" data-lane="${key}">${icon("ban", "i--sm")}${t("Banned")}</button>`
      : "";
  return `<div class="casino-slot" data-lane="${key}">
    <span class="casino-slot__lane">${laneLogos([lane], 22, { decorative: true })}<span>${view.esc(laneLabel(lane))}</span></span>
    <div class="casino-reel" data-lane="${key}">${content}</div>
    ${tick || ban ? `<div class="casino-slot__tools">${tick}${ban}</div>` : ""}
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

/**
 * A roulette: its five lanes for everyone; for its creator (`control`) the spin buttons, a tick per lane to respin
 * it, a Banned button per hero shown and the private control link. `extra` is the pool editor (creator only).
 */
export const rollMarkup = (
  view,
  state,
  heroes,
  { control, extra = "" }
) => `<section class="casino" data-version="${Number(state.version)}">
  <header class="casino-head">
    <h1>${t("Composition roulette")}</h1>
    <p class="casino-share">
      <button type="button" class="btn btn--ghost btn--sm" data-action="casino-copy-link">${icon("link", "i--sm")}${t("Copy the share link")}</button>
      ${control ? `<button type="button" class="btn btn--ghost btn--sm" data-action="casino-copy-control">${icon("key", "i--sm")}${t("Copy my control link")}</button>` : `<span class="casino-watching">${icon("eye", "i--sm")}${t("Watching live")}</span>`}
    </p>
  </header>
  <div class="casino-board">${LANES.map(([key]) => slotMarkup(view, state, heroes, control, key)).join("")}</div>
  ${
    control
      ? `<p class="casino-actions"><button type="button" class="btn" data-action="casino-spin">${icon("dice", "i--sm")}${t("Spin all lanes")}</button><button type="button" class="btn btn--ghost" data-action="casino-respin">${icon("refresh", "i--sm")}${t("Respin ticked lanes")}</button></p>`
      : ""
  }
  ${bannedMarkup(view, state, heroes, control)}
  ${historyMarkup(view, state, heroes)}
  ${extra}
</section>`;
