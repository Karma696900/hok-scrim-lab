// notebook, page: place, paintList, paintSide, paintAll, and 3 more.

// ---- the page --------------------------------------------------------------------------------
export const place = page => page.root.querySelector("#trn-notes");

export async function paintList(page) {
  page.root.querySelector("#note-list-region").innerHTML = await page.listHtml();
}

export async function paintSide(page) {
  const side = page.root.querySelector("#note-form-holder");
  side.innerHTML = page.editing ? await page.formMarkup() : page.glanceHtml();
  page.place().classList.toggle("is-editing", Boolean(page.editing));
}

export const paintAll = page => Promise.all([page.paintList(), page.paintSide()]);

/** The notes changed: the stage and the entries say so too. */
export const noteChanged = page => {
  page.overview.notes = page.notes;
  page.view.kit.refreshChrome();
};

export const readForm = page => {
  const form = page.root.querySelector("#note-form");
  const data = new FormData(form);
  page.editing = {
    ...page.editing,
    kind: data.get("kind"),
    heroId: data.get("heroId") || "",
    title: data.get("title"),
    body: data.get("body"),
    status: data.get("status")
  };
  for (const input of form.querySelectorAll("[data-hint]")) {
    page.editing.steps[Number(input.dataset.hint)].hint = input.value;
  }
  if (data.has("url")) {
    page.editing.url = data.get("url");
  }
  if (data.has("marks")) {
    page.editing.marksText = data.get("marks");
  }
};

/** Opens the editor on a note and puts the cursor in its title. */
export async function openEditor(page, note) {
  page.editing = note;
  await page.paintAll();
  const title = page.root.querySelector("#note-title");
  title?.focus({ preventScroll: true });
  title?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "nearest"
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { place, paintList, paintSide, paintAll, noteChanged, readForm, openEditor };
