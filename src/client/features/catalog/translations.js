// The Translations section of the Catalog (administrators): what the staff writes is translated by
// itself into every language of the site; here the administrator sees how far it is, corrects a
// translation, keeps a text as typed, or asks for another round. Nothing here is needed for the
// site to work: a text that is not translated is shown as it was typed. On the left the state of the
// translator (how far it is, the quota, the languages, the buttons); on the right the texts of a language.
import { currentLanguage } from "../../app/browser-i18n.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as translationsParts } from "./translations-parts.js";
import { onView as translationsMarkup } from "./translations-markup.js";
import { onView as translationsLoadingPolling } from "./translations-loading-polling.js";
import { onView as translationsActions } from "./translations-actions.js";

export function createTranslationsPanel({ api, tell }) {
  const page = { api, tell };
  bindTo(
    page,
    translationsParts,
    translationsMarkup,
    translationsLoadingPolling,
    translationsActions
  );
  page.esc = escapeHtml;
  page.status = null;
  page.list = { rows: [], total: 0, page: 1, pageSize: 50 };
  page.view = {
    language: currentLanguage() === "en" ? "fr" : currentLanguage(),
    state: "",
    search: "",
    page: 1
  };
  page.timer = null;
  page.busy = false;

  return {
    load: page.load,
    markup: page.markup,
    statusCard: page.statusCard,
    onClick: page.onClick,
    onChange: page.onChange,
    onInput: page.onInput,
    stop: page.stop,
    waiting: page.waiting,
    loadStatus: page.loadStatus
  };
}
