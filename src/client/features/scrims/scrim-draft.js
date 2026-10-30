import { t } from "../../app/browser-i18n.js";
import { api, fetchSeries, serverNow } from "../../app/api-client.js";
import { currentHero, currentSeries } from "../../app/roster-data.js";
import { heroSheet } from "../../domain/hero-of-the-day.js";
import { escapeHtml, heroCard, slotImage, tell } from "../../lib/dom.js";
import { formatDuration } from "../../lib/format.js";
import { state } from "../../app/app-state.js";
import { reloadSeries } from "./board.js";

// The draft board and the draft editor are only needed on the Scrims page: their code is fetched
// when somebody opens it.
export let draftViewInstance = null;

let draftEditorInstance = null;

let draftModules = null;

export function loadDraftModules() {
  return (draftModules ??= Promise.all([
    import("../draft/draft-view.js"),
    import("../draft/draft-editor.js")
  ]).then(([view, editor]) => {
    draftViewInstance = view.createDraftView({
      escapeHtml,
      imageMarkup: slotImage,
      heroCardMarkup: (hero, options) => heroCard(hero, options),
      getHero: heroId => currentHero(heroId),
      // the wide cover of a hero (its stored Camp sheet), for the cards of the picks; null when it has none
      getCover: heroId =>
        heroSheet(currentHero(heroId)).then(details => details?.art?.cover ?? null),
      formatDuration: seconds => formatDuration(seconds)
    });
    draftEditorInstance = editor.createDraftEditor({
      escapeHtml,
      imageMarkup: slotImage,
      getHero: heroId => currentHero(heroId),
      getHeroes: () => state.heroes.filter(hero => hero.availableGlobal !== false),
      onSave: async (target, edit) => {
        const series = currentSeries();
        const path =
          target.gameIndex === "current" ? "game/draft" : `games/${target.gameIndex}/draft`;
        await api(`/api/series/${encodeURIComponent(series.id)}/${path}`, {
          method: "PATCH",
          body: { ...edit, expectedVersion: series.version }
        });
        await reloadSeries(series.id);
        tell(t("Draft corrected"));
      }
    });
  }));
}

/** A game whose deadline has passed and which only the server can move on (auto-pick, end of the wait). */
export const isDue = (draft, now) =>
  Boolean(
    draft.started !== false &&
    draft.deadline &&
    now >= draft.deadline &&
    ["draft", "waiting"].includes(draft.phase)
  );

/**
 * A game whose deadline has passed is only resolved by the server when somebody asks (the clock of the
 * open board does, once it is up). Asked BEFORE the board is first drawn, the page opens on the real
 * state: drawn first as it was and redrawn a second later, a board whose draft was over moved as a whole
 * (the pool of heroes goes, the two teams take its place: a layout shift of 0.2 on a phone). A failure
 * is not shown here: the clock of the board asks again and says why it cannot.
 */
export async function settleActiveSeries() {
  const series = currentSeries();
  const draft = series?.currentGame?.draft;
  if (!draft || state.viewGameIndex !== null || state.advancing || !isDue(draft, serverNow())) {
    return;
  }
  state.advancing = true;
  state.advanceBlockedUntil = Date.now() + 1000;
  try {
    await api(`/api/series/${encodeURIComponent(series.id)}/game/advance`, {
      method: "POST",
      body: {}
    });
    state.series = await fetchSeries();
  } catch {
    // see above
  } finally {
    state.advancing = false;
  }
}

export const draftView = {
  reset: () => draftViewInstance?.reset(),
  frame: () => draftViewInstance.frame(),
  mount: (...args) => draftViewInstance.mount(...args),
  update: (...args) => draftViewInstance.update(...args),
  tick: (...args) => draftViewInstance?.tick(...args),
  isMounted: () => Boolean(draftViewInstance?.isMounted())
};

export const draftEditor = { open: (...args) => draftEditorInstance.open(...args) };
