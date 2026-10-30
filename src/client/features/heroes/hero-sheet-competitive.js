// The competitive tab: what the tournaments say about the hero.
import { gapLine } from "./hero-sheet-parts.js";
import * as heroStats from "./hero-stats.js";
import { rowsOf } from "./hero-panels.js";
import { t } from "../../app/browser-i18n.js";
import { activeTab } from "./hero-sheet-tabs.js";

// ---- the page -----------------------------------------------------------------------------------

/** One panel: the content of a tab. Only the open one is shown. */
export const panel = (key, id, body) =>
  `<section class="hs-panel hs-panel--${key}" id="${id}" role="tabpanel" aria-labelledby="hero-tab-${key}" data-panel="${key}" tabindex="0"${key === activeTab ? "" : " hidden"}>${body}</section>`;

const pill = text => `<span class="pill pill--grey">${text}</span>`;

/** The competitive tab: the statistics of the tournaments, the pairings and the scrims of the person. */
export function competitivePanel(sheet, ctx) {
  const quiet = !sheet.tournament.totalGames;
  const howTo = {
    span: 5,
    html: `<section class="hs-mod hs-mod--card hs-mod--how"><header class="hs-mod__head"><h2>${t("How the numbers are made")}</h2></header><ol class="hs-steps"><li><b>1</b><span>${t("Every game comes from a tournament series that the staff entered by hand.")}</span></li><li><b>2</b><span>${t("Pick rate and ban rate count the games of the period in which the hero was picked or banned.")}</span></li><li><b>3</b><span>${t("A small sample is flagged, never hidden: read it with care.")}</span></li></ol></section>`
  };
  const stats = {
    span: quiet ? 7 : 12,
    html: `<section class="hs-mod hs-mod--card hs-mod--tournament"><header class="hs-mod__head"><h2>${t("Competitive statistics")}</h2>${pill(t("Tournaments"))}</header><div id="tournament-body">${heroStats.tournamentSection(sheet, ctx)}</div></section>`
  };
  const withPairings = heroStats.hasPairings(sheet.tournament);
  const withScrims = Boolean(sheet.scrims?.totalGames);
  const pairings = withPairings
    ? {
        span: 12,
        html: `<section class="hs-mod hs-mod--card hs-mod--pairs"><header class="hs-mod__head"><h2>${t("Pairings")}</h2>${pill(t("Tournaments"))}</header>${heroStats.pairingsSection(sheet, ctx)}</section>`
      }
    : null;
  const scrims = withScrims
    ? {
        span: 12,
        html: `<section class="hs-mod hs-mod--card hs-mod--scrims"><header class="hs-mod__head"><h2>${t("Your scrims")}</h2>${pill(t("Your games"))}</header>${heroStats.scrimsSection(sheet.scrims, ctx)}</section>`
      }
    : null;
  // what has no number yet is one line each, under the blocks that have some
  const gaps = [
    !withPairings && !quiet
      ? gapLine(
          t("Pairings"),
          quiet
            ? t("No tournament has been entered yet.")
            : t("This hero has no won game in this period.")
        )
      : "",
    !withScrims
      ? gapLine(
          t("Your scrims"),
          t("No recorded games in your scrims yet. Results appear here once you save games.")
        )
      : ""
  ].filter(Boolean);
  return `${rowsOf([stats, pairings, howTo, scrims])}${gaps.length ? `<ul class="hs-gaps hs-gaps--end">${gaps.join("")}</ul>` : ""}`;
}
