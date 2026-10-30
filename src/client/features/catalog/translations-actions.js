// translations, what happens on a click, a key or a submit: onClick, onChange, onInput.
import { t } from "../../app/browser-i18n.js";
import { STATES } from "./translations-shared.js";
import { textOf } from "./translations-parts.js";

/** A click inside the panel. True when it was one of its buttons. */
export function onClick(page, event, root, repaint) {
  const target = event.target.closest("button");
  if (!target) {
    return false;
  }
  const { trSave, trReset, trKeep, trPage, trState, trWant } = target.dataset;
  if (target.matches("[data-tr-sweep]")) {
    void page.run(
      async () => {
        await page.api("/api/admin/translations/sweep", { method: "POST" });
      },
      repaint,
      page.status.provider ? t("The translation has started") : null
    );
  } else if (target.matches("[data-tr-retry]")) {
    void page.run(
      () => page.api("/api/admin/translations/retry", { method: "POST", body: {} }),
      repaint,
      t("The failed texts will be tried again")
    );
  } else if (trSave) {
    void page.run(
      () =>
        page.api(`/api/admin/translations/${encodeURIComponent(trSave)}/${page.view.language}`, {
          method: "PUT",
          body: { text: textOf(root, trSave) }
        }),
      repaint,
      t("Translation saved")
    );
  } else if (trReset) {
    void page.run(
      () =>
        page.api(`/api/admin/translations/${encodeURIComponent(trReset)}/${page.view.language}`, {
          method: "DELETE"
        }),
      repaint,
      t("Back to the automatic translation")
    );
  } else if (trKeep) {
    void page.run(
      () =>
        page.api(`/api/admin/translations/${encodeURIComponent(trKeep)}/keep`, { method: "POST" }),
      repaint,
      t("This text stays as typed in every language")
    );
  } else if (trWant) {
    void page.run(
      () =>
        page.api("/api/admin/translations/languages", {
          method: "POST",
          body: { language: trWant }
        }),
      repaint,
      t("This language will be translated.")
    );
  } else if (target.matches("[data-tr-want-all]")) {
    void page.run(
      () => page.api("/api/admin/translations/languages", { method: "POST", body: { all: true } }),
      repaint,
      t("Every language will be translated.")
    );
  } else if (trPage !== undefined) {
    page.view.page = Math.max(1, Number(trPage));
    void page.run(async () => {}, repaint, null);
  } else if (trState !== undefined) {
    page.view.state = STATES.includes(trState) ? trState : "";
    page.view.page = 1;
    void page.run(async () => {}, repaint, null);
  } else {
    return false;
  }
  return true;
}

/** A change of the language: true when it was ours. */
export function onChange(page, event, repaint) {
  if (event.target.id !== "tr-language") {
    return false;
  }
  page.view.language = event.target.value;
  page.view.page = 1;
  void page.run(async () => {}, repaint, null);
  return true;
}

/** What is typed in the filter (the list is asked for again once the typing stops). */
export function onInput(page, event, repaint) {
  if (event.target.id !== "tr-search") {
    return false;
  }
  page.view.search = event.target.value;
  page.view.page = 1;
  clearTimeout(page.onInput.timer);
  page.onInput.timer = setTimeout(() => {
    void (async () => {
      try {
        await page.loadList();
      } catch (error) {
        page.tell(error.message);
      }
      repaint({ keepFocus: "#tr-search" });
    })();
  }, 300);
  return true;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange, onInput };
