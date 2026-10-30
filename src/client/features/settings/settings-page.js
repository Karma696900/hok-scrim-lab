// Settings (opened from the account menu): the parts of the site in the menu (the community is always on),
// the defaults of a new series, the language, the theme, the reading direction, the start page and the
// animations, the links to the rest of the account and the API keys. A signed-in person keeps them on their
// account; a visitor in this browser. A stage with the figures that matter, a rail of sections that follows
// the page, one card per section, and a bar that asks for the save. Loaded on demand.
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as settingsPagePiecesPage } from "./settings-pieces.js";

export function createSettingsPage({
  hydration,
  api,
  tell,
  state,
  applyModules,
  applySettings,
  saveLocal
}) {
  const flow = { hydration, state, api, tell, saveLocal, applyModules, applySettings };
  bindTo(flow, settingsPagePiecesPage);
  flow.esc = escapeHtml;

  return {
    show: flow.show
  };
}
