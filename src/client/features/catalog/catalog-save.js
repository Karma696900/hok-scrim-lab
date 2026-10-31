// Reading the catalog from the server, saving an entry, choosing its picture.
import { t } from "../../app/browser-i18n.js";
import { unchosen } from "./catalog-search.js";

export const pathOf = view => `/api/admin/catalog/${view.tab}`;

export async function reload(view) {
  view.catalog = await view.api("/api/catalog");
}

export async function save(view) {
  if (view.busy || !view.editing) {
    return;
  }
  // a stat or a tag typed but not chosen: said at once, without drawing the form again (what was typed stays)
  const loose = unchosen(view.root);
  if (loose) {
    loose.focus({ preventScroll: true });
    loose.scrollIntoView({ block: "nearest" });
    view.tell(t("A name was typed but not chosen from the list: {name}", { name: loose.value }));
    return;
  }
  view.busy = true;
  view.error = "";
  try {
    const draft = view.readDraft();
    if (view.unfinished(draft)) {
      throw new Error(t("A condition is not finished: fill it in or remove it."));
    }
    if (view.editing.id) {
      await view.api(`${view.pathOf()}/${view.editing.id}`, {
        method: "PUT",
        body: view.bodyOf({ ...draft, id: view.editing.id })
      });
    } else {
      await view.api(view.pathOf(), { method: "POST", body: view.bodyOf(draft) });
    }
    view.tell(t("Saved"));
    const keep =
      view.tab === "items"
        ? { category: draft.category, shopCategory: draft.shopCategory ?? null }
        : view.tab === "arcana" || view.tab === "tags"
          ? { color: draft.color }
          : {};
    await view.reload();
    // ready for the next one on a wide screen; a phone shows one thing at a time, so it goes back to the list
    view.editing = narrowScreen()
      ? null
      : { id: null, draft: { ...view.emptyDraft[view.tab](), ...keep } };
    view.paint();
    view.root.querySelector('#catalog-form [name="name"]')?.focus({ preventScroll: true });
  } catch (problem) {
    view.error = problem.message;
    view.paint();
  } finally {
    view.busy = false;
  }
}

export async function chooseImage(view, file) {
  if (!file || !view.editing) {
    return;
  }
  const draft = view.readDraft();
  try {
    const response = await fetch(
      `/api/admin/catalog/images${view.tab === "arcana" ? "?kind=arcana" : ""}`,
      {
        method: "POST",
        headers: { "content-type": file.type },
        body: file
      }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || t("Request failed ({status}).", { status: response.status }));
    }
    draft.imageId = data.id;
    view.error = "";
    view.paint();
  } catch (problem) {
    view.error = problem.message;
    view.paint();
  }
}

export const narrowScreen = () => window.matchMedia("(max-width: 960px)").matches;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { pathOf, reload, save, chooseImage };
