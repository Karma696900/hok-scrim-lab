// The pieces the account pages are made of: a labelled field (label above, icon inside, hint under), the
// field of a 6-digit code, the line that shows what went wrong, the strength of a new password, the steps of
// a flow. Pure markup: the page that uses them gives the texts.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

export const passwordHint = () =>
  t("At least 12 characters. Longer is better: a short sentence works well.");

/**
 * A labelled field. `toggle` adds the eye that shows the password; `after` is markup that belongs to the
 * field (the strength of a password) and stays with it, so a message about the field lands under both.
 */
export function fieldHtml({
  id,
  label,
  type = "text",
  name = id,
  autocomplete,
  hint = "",
  extra = "",
  iconName = "",
  toggle = false,
  after = ""
}) {
  const eye = toggle
    ? `<button type="button" class="au-eye" data-auth-action="toggle-password" aria-pressed="false" aria-label="${t("Show the password")}">${icon("eye", "i--sm")}</button>`
    : "";
  return `<div class="au-field"><label class="label" for="${id}">${label}<span class="field">${iconName ? icon(iconName, "i--sm") : ""}<input id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}" ${extra}>${eye}</span>${hint ? `<small id="${id}-hint">${hint}</small>` : ""}</label>${after}</div>`;
}

/** The 6-digit code: big digits, the keyboard of numbers, and what a phone needs to offer the code it received. */
export const codeFieldHtml = ({ id, label, name = id, extra = "" }) =>
  `<div class="au-field"><label class="label" for="${id}">${label}<span class="field field--code"><input id="${id}" name="${name}" type="text" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="123456" ${extra}></span></label></div>`;

/** Where a refusal is written (the page moves it under the field that caused it). */
export const errorBox = (id = "auth-error") => `<p class="form-error" id="${id}" role="alert"></p>`;

/** The bars and the word under a new password; actions.js fills them while it is typed. */
export const strengthHtml = () =>
  `<div class="au-strength" aria-live="polite"><div class="meter-pw" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span class="au-strength__word" data-strength-word></span></div>`;

/**
 * The steps of a flow, the current one marked: `labels` in order, `current` counted from 0. A step that is
 * behind the person shows a tick.
 */
export function stepsHtml(labels, current) {
  return `<ol class="au-steps" aria-label="${t("Steps")}">${labels
    .map(
      (label, index) =>
        `<li class="${index < current ? "is-done" : index === current ? "is-now" : ""}"${index === current ? ' aria-current="step"' : ""}><span class="au-steps__n">${index < current ? icon("check", "i--sm") : index + 1}</span><span class="au-steps__label">${label}</span></li>`
    )
    .join("")}</ol>`;
}

export const submitHtml = (label, className = "btn btn--primary btn--lg btn--block") =>
  `<button class="${className}" type="submit">${label}</button>`;

/**
 * The recovery codes: ten tickets, then the two ways to keep them (the page that shows them gives the
 * buttons their actions). `escapeHtml` is the page's.
 */
export const codesHtml = (codes, escapeHtml) =>
  `<ol class="recovery-codes" aria-label="${t("Recovery codes")}">${codes.map(code => `<li><code>${escapeHtml(code)}</code></li>`).join("")}</ol>
    <div class="au-actions"><button class="btn" type="button" data-auth-action="copy-codes">${icon("copy")}${t("Copy")}</button><button class="btn" type="button" data-auth-action="download-codes">${icon("download")}${t("Download .txt")}</button></div>`;

/** What the account log calls each thing that happened. */
export function eventLabel(name) {
  switch (name) {
    case "register":
      return t("Account created");
    case "login":
      return t("Signed in");
    case "login_failed":
      return t("Wrong password");
    case "login_blocked":
      return t("Sign-in blocked (account locked)");
    case "mfa_enabled":
      return t("Two-factor authentication turned on");
    case "mfa_failed":
      return t("Wrong authenticator code");
    case "mfa_blocked":
      return t("Code entry blocked");
    case "enrol_failed":
      return t("Wrong code while setting up");
    case "recovery_used":
      return t("Recovery code used");
    case "recovery_failed":
      return t("Wrong recovery code");
    case "recovery_regenerated":
      return t("New recovery codes generated");
    case "password_changed":
      return t("Password changed");
    case "stepup_failed":
      return t("Wrong code on a sensitive action");
    case "logout":
      return t("Signed out");
    case "logout_all":
      return t("Signed out everywhere");
    default:
      return name.replaceAll("_", " ");
  }
}

/** "ok", "bad" or "": how the log colours an event (what went well, what was refused, the rest). */
export function eventTone(name) {
  if (/failed|blocked/.test(name)) {
    return "bad";
  }
  return /^(register|login|mfa_enabled|password_changed|recovery_regenerated|recovery_used)$/.test(
    name
  )
    ? "ok"
    : "";
}
