// What is typed in the form of the Catalog page, and what the API takes: the form read back as a draft (what was typed
// is never lost when a row is added), the draft as the body of a request, and an entry as a draft. The page gives
// the parts it owns (the root, the entry being edited, the open section) as functions, like the conditions editor.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as catalogDraftRead } from "./catalog-draft-read.js";
import { onView as catalogDraftBody } from "./catalog-draft-body.js";
import { numberOrNull } from "./catalog-draft-read.js";

export function createCatalogDrafts({ getRoot, getEditing, getTab, statOf, when }) {
  const view = { getRoot, getEditing, getTab, when, statOf };
  bindTo(view, catalogDraftRead, catalogDraftBody);

  return {
    numberOrNull,
    readDraft: view.readDraft,
    unfinished: view.unfinished,
    bodyOf: view.bodyOf,
    draftOfEntry: view.draftOfEntry
  };
}
