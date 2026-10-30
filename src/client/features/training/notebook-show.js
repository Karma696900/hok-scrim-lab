// notebook, small helpers: show.
import { zoneHead } from "./training-shared.js";
import { t } from "../../app/browser-i18n.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as notebookPartsParts } from "./notebook-parts.js";
import { onView as notebookPartsNote } from "./notebook-notes.js";
import { onView as notebookPartsPage } from "./notebook-paint.js";
import { onView as notebookPartsActions } from "./notebook-actions.js";

export async function show(view) {
  const page = { view };
  bindTo(page, notebookPartsParts, notebookPartsNote, notebookPartsPage, notebookPartsActions);
  page.root = page.view.kit.root();
  page.overview = page.view.kit.overview;
  const query = new URLSearchParams(location.search);
  page.notes = page.overview.notes;
  page.heroIds = page.overview.focus;
  page.filter = {
    kind: "all",
    heroId: page.view.heroOf(query.get("hero")) ? query.get("hero") : ""
  };
  page.editing = null; // null: the form is closed; {…}: the note being written (id = null for a new one)

  page.root.innerHTML = `${page.view.kit.chrome({
    zone: "notebook",
    hero: page.view.heroOf(page.filter.heroId) ?? page.view.heroOf(page.heroIds[0]) ?? null,
    ...zoneHead("notebook")
  })}
      <div class="trn-notes" id="trn-notes">
        <section class="trn-notes__list" id="note-list-region" aria-label="${t("Notebook")}"></section>
        <aside class="trn-notes__side" id="note-form-holder"></aside>
      </div>`;
  page.view.kit.paintChrome();
  await page.paintAll();

  page.root.onclick = page.onClick;

  page.root.onchange = page.onChange;

  page.root.onsubmit = page.onSubmit;
  page.root.oninput = null;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
