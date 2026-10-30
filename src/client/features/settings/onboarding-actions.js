// onboarding, what happens on a click, a key or a submit: onClick, onChange.
import { LANGUAGE_COOKIE, isLanguage } from "../../../shared/i18n.js";
import { MODULES } from "./parts.js";
import { currentLanguage } from "../../app/browser-i18n.js";
import { steps } from "./onboarding-shared.js";

export async function onClick(ui, event) {
  const language = event.target.closest("[data-language]");
  if (language) {
    if (isLanguage(language.dataset.language) && language.dataset.language !== currentLanguage()) {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LANGUAGE_COOKIE}=${language.dataset.language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      location.reload();
    }
    return;
  }
  const target = event.target.closest("button, a[data-start]");
  if (!target) {
    return;
  }
  if (target.matches("a[data-start]")) {
    ui.save(); // the choice is kept while the link opens its page
    return;
  }
  if ("back" in target.dataset) {
    ui.step -= 1;
    ui.paint();
  } else if ("next" in target.dataset) {
    if (ui.step === steps().length - 1) {
      if (await ui.save()) {
        ui.flow.go("/");
      }
    } else {
      ui.step += 1;
      ui.paint();
    }
  } else if ("skip" in target.dataset) {
    ui.chosen = new Set(MODULES);
    if (await ui.save()) {
      ui.flow.go("/");
    }
  }
}

export function onChange(ui, event) {
  const box = event.target.closest("input[data-module]");
  if (!box) {
    return;
  }
  if (box.checked) {
    ui.chosen.add(box.dataset.module);
  } else {
    ui.chosen.delete(box.dataset.module);
  }
  box.closest(".mod").classList.toggle("on", box.checked);
  box.closest(".mod").querySelector(".check").classList.toggle("on", box.checked);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange };
