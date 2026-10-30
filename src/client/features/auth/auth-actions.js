import { onInput, onSubmit } from "../../app/event-actions.js";
import { t } from "../../app/browser-i18n.js";
import { loadAuthPages } from "../../app/lazy-pages.js";
import { state } from "../../app/app-state.js";

/**
 * 0 to 4, to draw the bars under a new password: nothing typed is 0, fewer than 12 characters is the first bar
 * ("too short": the server refuses it), then one more bar for each of mixed case, a digit and a symbol (or 16
 * characters). It only judges what the eye sees; the server decides.
 */
function passwordScore(value) {
  if (!value) {
    return 0;
  }
  if (value.length < 12) {
    return 1;
  }
  let score = 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) {
    score += 1;
  }
  if (/\d/.test(value)) {
    score += 1;
  }
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 16) {
    score += 1;
  }
  return score;
}

/** The word that goes with the bars. */
function strengthWord(value) {
  if (!value) {
    return "";
  }
  if (value.length < 12) {
    return t("Too short");
  }
  return [t("Weak"), t("Fair"), t("Good"), t("Strong")][passwordScore(value) - 1];
}

export function installAuthActions() {
  onSubmit(
    event => event.target.closest("[data-auth-form]"),
    async event => {
      await (await loadAuthPages()).onSubmit(event, state.view);
      return;
    }
  );

  // Typing in a field of an account form: what was said against the field is not true any more, and the bars
  // under a new password follow what is typed.
  onInput(
    event => event.target.closest?.("[data-auth-form]"),
    event => {
      const input = event.target;
      const field = input.closest(".au-field");
      if (input.hasAttribute("aria-invalid")) {
        input.removeAttribute("aria-invalid");
        field?.querySelector(".form-error")?.replaceChildren();
      }
      if (input.matches("[data-password-meter]")) {
        const scope = field ?? input.closest("form");
        const meter = scope?.querySelector(".meter-pw");
        if (meter) {
          meter.dataset.score = String(passwordScore(input.value));
        }
        const word = scope?.querySelector("[data-strength-word]");
        if (word) {
          word.textContent = strengthWord(input.value);
        }
      }
    }
  );
}
