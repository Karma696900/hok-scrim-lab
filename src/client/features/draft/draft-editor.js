// Dialog to correct the bans and picks of a game (a mistake noticed after the draft). 4 rows of 5
// slots; click a slot, then a hero in the grid. The server validates everything (and the series
// rules).
import { banSlots } from "../../../shared/draft-model.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as draftEditorParts } from "./draft-editor-parts.js";
import { clone, pad } from "./draft-editor-parts.js";

export function createDraftEditor({ getHeroes, getHero, imageMarkup, onSave }) {
  const view = { onSave, getHero, imageMarkup, getHeroes };
  bindTo(view, draftEditorParts);
  view.dialog = null;
  view.draft = null; // { bans: {blue, red}, picks: {blue, red} } of fixed length 5 (null = empty)
  view.active = { side: "blue", kind: "bans", index: 0 };
  view.target = null;
  view.search = "";

  return {
    open(options) {
      view.target = {
        ...options,
        draft: options.draft,
        original: {
          bans: { blue: banSlots(options.draft, "blue"), red: banSlots(options.draft, "red") },
          picks: { blue: pad(options.draft.picks.blue), red: pad(options.draft.picks.red) }
        }
      };
      view.draft = clone(view.target.original);
      view.active = {
        side: "blue",
        kind: options.draft.picksOnly ? "picks" : "bans",
        index: Math.max(
          0,
          view.draft[options.draft.picksOnly ? "picks" : "bans"].blue.findIndex(value => !value)
        )
      };
      view.search = "";
      view.ensureDialog();
      view.paint();
      view.dialog.showModal();
    }
  };
}
