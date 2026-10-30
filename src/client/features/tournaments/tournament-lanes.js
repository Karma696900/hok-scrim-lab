// The lane each pick was played in: setting it, sliding it, and proposing the lanes the heroes usually play.
import { LANES, toDraft } from "./tournament-model.js";
import { suggestLanes } from "../../../shared/lane-suggestion.js";
import { t } from "../../app/browser-i18n.js";

/**
 * Puts `lane` ("" or null = none) on a pick. The lane leaves the hero of the same side that had
 * it: a team plays each lane once.
 */
export function setLane(view, gameIndex, side, index, lane) {
  const game = view.editor.games[gameIndex];
  if (!game?.picks[side][index]) {
    return false;
  }
  if (lane) {
    const at = game.lanes[side].indexOf(lane);
    if (at >= 0 && at !== index) {
      game.lanes[side][at] = null;
    }
  }
  game.lanes[side][index] = lane || null;
  return true;
}

/** A lane slid from one hero to another of the same side: they swap. */
export function moveLane(view, from, to) {
  const [fromGame, fromSide, fromIndex] = from.split(":");
  const [toGame, toSide, toIndex] = to.split(":");
  if (fromGame !== toGame || fromSide !== toSide || fromIndex === toIndex) {
    return false;
  }
  const game = view.editor.games[Number(toGame)];
  if (!game.picks[toSide][Number(toIndex)]) {
    return false;
  }
  const lanes = game.lanes[toSide];
  [lanes[Number(fromIndex)], lanes[Number(toIndex)]] = [
    lanes[Number(toIndex)],
    lanes[Number(fromIndex)]
  ];
  return true;
}

/**
 * Proposes the lanes still empty on a game from the lanes the heroes are listed for (see
 * shared/lane-suggestion.js). Returns how many it filled; what was entered is kept.
 */
export function suggestForGame(view, game) {
  let filled = 0;
  for (const side of ["blue", "red"]) {
    const slots = game.picks[side].map((heroId, at) => ({
      heroId: heroId || null,
      heroLanes: heroId ? view.heroById(heroId)?.lanes : [],
      lane: game.lanes[side][at]
    }));
    suggestLanes(slots, LANES).forEach((lane, at) => {
      if (lane && !game.lanes[side][at]) {
        game.lanes[side][at] = lane;
        filled += 1;
      }
    });
  }
  return filled;
}

export async function prepareProposal(view) {
  const found = [];
  const pages = Math.max(1, Math.ceil(view.list.total / 25));
  for (let at = 1; at <= pages; at += 1) {
    const answer = await view.api(view.listUrl(at));
    for (const item of answer.items) {
      const series = toDraft(
        await view.api(`/api/admin/tournaments/${encodeURIComponent(item.id)}`)
      );
      let filled = 0;
      let games = 0;
      for (const game of series.games) {
        const count = view.suggestForGame(game);
        filled += count;
        games += count ? 1 : 0;
      }
      if (filled) {
        found.push({ series, event: item.event, stage: item.stage, filled, games });
      }
    }
  }
  view.proposal = found;
}

export const proposalMarkup = view =>
  view.proposal === null
    ? ""
    : view.proposal.length
      ? `<div class="note tn-note" role="status"><b>${t("{series, plural, one {# series} other {# series}} can get lanes proposed ({count, plural, one {# lane} other {# lanes}} in all).", { series: view.proposal.length, count: view.proposal.reduce((sum, item) => sum + item.filled, 0) })}</b> ${t("Only lanes that the heroes' own lanes make certain are proposed; the ones you entered are kept, and you can change any of them afterwards in the editor.")}<span class="hstack"><button type="button" class="btn btn--primary btn--sm" data-suggest-apply>${t("Apply")}</button><button type="button" class="btn btn--sm" data-suggest-cancel>${t("Cancel")}</button></span></div>`
      : `<div class="note tn-note" role="status">${t("Nothing more can be proposed with certainty.")} <button type="button" class="btn btn--sm" data-suggest-cancel>${t("Close")}</button></div>`;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { setLane, moveLane, suggestForGame, prepareProposal, proposalMarkup };
