// settings page, what happens on a click, a key or a submit: onClick, onClickHandler, onSubmit.
import { directionOf, isLanguage } from "../../../shared/i18n.js";
import { changeLanguage } from "../../app/language-address.js";
import { changeSetting } from "../../app/menu-preferences.js";
import { currentLanguage, t } from "../../app/browser-i18n.js";

export function onClick(ui, event) {
  const link = event.target.closest("[data-section]");
  if (!link) {
    return;
  }
  event.preventDefault();
  ui.markSection(link.dataset.section);
  ui.root.querySelector(`#settings-${link.dataset.section}`)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
}

// Language, theme and direction apply at once, like the switches of the top bar.
export function onClickHandler(event) {
  const picked = event.target.closest("[data-language]");
  if (picked) {
    const code = picked.dataset.language;
    if (!isLanguage(code) || code === currentLanguage()) {
      return;
    }
    changeLanguage(code);
    return;
  }
  const button = event.target.closest("[data-set-theme], [data-set-direction]");
  if (!button) {
    return;
  }
  const chosen = button.dataset.setTheme;
  const direction = button.dataset.setDirection;
  changeSetting(
    chosen
      ? { theme: chosen }
      : { direction: direction === directionOf(currentLanguage()) ? "auto" : direction }
  );
  for (const other of button.parentElement.children) {
    other.setAttribute("aria-pressed", String(other === button));
  }
}

export async function onSubmit(ui, event) {
  event.preventDefault();
  const next = ui.read();
  const error = ui.root.querySelector("#settings-error");
  error.textContent = "";
  try {
    if (ui.user) {
      await ui.flow.api("/api/me/preferences", { method: "PUT", body: next });
    }
    ui.flow.state.modules = next.modules;
    ui.flow.state.settings = next.settings;
    ui.flow.state.onboarded = true;
    ui.flow.saveLocal();
    ui.flow.applyModules();
    ui.flow.applySettings();
    ui.saved = JSON.stringify(next);
    ui.refresh();
    ui.flow.tell(t("Settings saved."));
  } catch (failure) {
    error.textContent = failure.message;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onSubmit };
