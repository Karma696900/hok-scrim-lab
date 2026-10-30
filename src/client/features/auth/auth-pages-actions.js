// auth pages, what happens on a click, a key or a submit: onSubmit, onClick.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { fieldOf, nextPath, nextQuery, stepPath } from "./auth-pages-parts.js";

const SIGN_IN_FORMS = new Set(["login", "register", "profile", "mfa", "enrol", "finish"]);

/** The forms of the sign-in flow: login, register, profile, code, enrolment, recovery codes. False when the message was written under a field. */
async function submitSignIn(page, { kind, form, data, fail }) {
  if (kind === "login") {
    const result = await page.api("/api/auth/login", {
      method: "POST",
      body: { email: data.email, password: data.password }
    });
    page.session.setup = null;
    page.go(stepPath(result.step));
  } else if (kind === "register") {
    const result = await page.api("/api/auth/register", {
      method: "POST",
      body: { name: data.name, email: data.email, password: data.password }
    });
    page.session.setup = null;
    page.go(stepPath(result.step));
  } else if (kind === "profile") {
    const result = await page.api("/api/auth/profile/complete", {
      method: "POST",
      body: { name: data.name, password: data.password, confirm: data.confirm }
    });
    page.session.setup = null;
    page.go(stepPath(result.step));
  } else if (kind === "mfa") {
    await page.api("/api/auth/mfa/verify", {
      method: "POST",
      body: page.session.useRecovery ? { recoveryCode: data.recoveryCode } : { code: data.code }
    });
    location.assign(nextPath());
  } else if (kind === "enrol") {
    const result = await page.api("/api/auth/mfa/enrol/confirm", {
      method: "POST",
      body: { code: data.code }
    });
    page.session.recovery = result.recoveryCodes;
    page.session.setup = null;
    page.go(`/login/setup${nextQuery()}`, { replace: true, force: true });
  } else if (kind === "finish") {
    if (!form.querySelector("#saved").checked) {
      fail(t("Confirm that you saved the codes."));
      return false;
    }
    page.session.recovery = null;
    location.assign(nextPath());
  }
  return true;
}

/** The forms of the account page: password, export, delete, new recovery codes. */
async function submitAccount(page, { kind, form, data, fail, button }) {
  if (kind === "password") {
    await page.api("/api/auth/password", {
      method: "POST",
      body: {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        code: data.code
      }
    });
    page.tell(t("Password changed. Other sessions were closed."));
    form.reset();
    page.session.overview = await page.api("/api/auth/security");
    page.go("/account", { replace: true, force: true });
  } else if (kind === "export") {
    const copy = await page.api("/api/auth/export", {
      method: "POST",
      body: { code: data.code }
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" })
    );
    link.download = `hok-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    form.reset();
    button.disabled = false;
    page.tell(t("Your data was downloaded."));
  } else if (kind === "delete") {
    if (!form.querySelector("[name=sure]").checked) {
      fail(t("Tick the box to confirm."));
      return false;
    }
    await page.api("/api/auth/delete-account", {
      method: "POST",
      body: { password: data.password ?? "", code: data.code }
    });
    location.assign("/");
  } else if (kind === "recovery") {
    const result = await page.api("/api/auth/recovery-codes", {
      method: "POST",
      body: { code: data.code }
    });
    page.session.recovery = result.recoveryCodes;
    page.session.overview = await page.api("/api/auth/security");
    page.go("/account", { replace: true, force: true });
  }
  return true;
}

export async function onSubmit(page, event) {
  const form = event.target.closest("[data-auth-form]");
  if (!form) {
    return false;
  }
  event.preventDefault();
  const kind = form.dataset.authForm;
  const data = Object.fromEntries(new FormData(form));
  const errorElement = form.querySelector(".form-error") || document.querySelector("#auth-error");
  const button = form.querySelector('button[type="submit"]');
  /** Writes what went wrong under the field it is about (or above the button), and goes there. */
  const fail = (message, error = {}) => {
    const input = fieldOf(form, kind, error);
    for (const marked of form.querySelectorAll("[aria-invalid]")) {
      marked.removeAttribute("aria-invalid");
    }
    errorElement.textContent = message;
    errorElement.hidden = false;
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.closest(".au-field")?.append(errorElement);
    }
    button.disabled = false;
    (input ?? form.querySelector("input"))?.focus();
  };
  errorElement.textContent = "";
  button.disabled = true;
  try {
    if ((kind === "register" || kind === "profile") && data.password !== data.confirm) {
      return fail(t("The two passwords are different."), { code: "password_mismatch" });
    }
    const ok = await (SIGN_IN_FORMS.has(kind) ? submitSignIn : submitAccount)(page, {
      kind,
      form,
      data,
      fail,
      button
    });
    if (!ok) {
      return;
    }
  } catch (error) {
    fail(error.message, error);
    if (error.code === "challenge_expired") {
      page.go("/login", { replace: true });
    }
  }
  return true;
}

export async function onClick(page, event) {
  const button = event.target.closest("[data-auth-action]");
  if (!button) {
    return false;
  }
  const action = button.dataset.authAction;
  if (action === "toggle-recovery") {
    page.session.useRecovery = !page.session.useRecovery;
    page.go("/login/mfa" + nextQuery(), { replace: true, force: true });
  } else if (action === "toggle-password") {
    // the eye shows or hides every password of the form at once (a new password and its repeat)
    const shown = button.getAttribute("aria-pressed") !== "true";
    for (const input of button
      .closest("form")
      .querySelectorAll('input[autocomplete$="password"], input[data-shown]')) {
      input.type = shown ? "text" : "password";
      input.toggleAttribute("data-shown", shown);
    }
    button.setAttribute("aria-pressed", String(shown));
    button.setAttribute("aria-label", shown ? t("Hide the password") : t("Show the password"));
    button.innerHTML = icon(shown ? "eyeoff" : "eye", "i--sm");
  } else if (action === "copy-key") {
    await navigator.clipboard.writeText(page.session.setup.secret.replaceAll(" ", ""));
    page.tell(t("Copied."));
  } else if (action === "copy-codes") {
    await navigator.clipboard.writeText(page.session.recovery.join("\n"));
    page.tell(t("Recovery codes copied"));
  } else if (action === "download-codes") {
    const blob = new Blob(
      [
        [
          t("HOK Global Scrim Lab recovery codes"),
          new Date().toISOString(),
          t("Each code works once."),
          "",
          ...page.session.recovery,
          ""
        ].join("\n")
      ],
      { type: "text/plain" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "hok-recovery-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  } else if (action === "set-up") {
    // the authenticator is set up while signing in: leave this session and come back through it
    await page.api("/auth/logout", { method: "POST" });
    location.assign(`/login?next=${encodeURIComponent("/account")}`);
  } else if (action === "logout-all") {
    await page.api("/api/auth/logout-all", { method: "POST", body: {} });
    location.assign("/login");
  }
  return true;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onSubmit, onClick };
