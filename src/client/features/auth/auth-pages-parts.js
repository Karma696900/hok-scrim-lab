// auth pages, small helpers: nextPath, nextQuery, stepPath, loadFor, and 3 more.
import { escapeHtml } from "../../lib/escape.js";
import { fillSceneArt, sceneHero } from "../../domain/scene-art.js";
import { heroesReady } from "../../app/roster-data.js";
import { icon } from "../../../shared/icons.js";
import { safeNext } from "../../../shared/routes.js";
import { t } from "../../app/browser-i18n.js";

export const nextPath = () => safeNext(new URLSearchParams(location.search).get("next"));

export const nextQuery = () =>
  new URLSearchParams(location.search).get("next") ? `?next=${encodeURIComponent(nextPath())}` : "";

/** Where the sign-in goes next, by the step the server named. */
export const stepPath = step =>
  step === "mfa"
    ? `/login/mfa${nextQuery()}`
    : step === "profile"
      ? `/login/profile${nextQuery()}`
      : `/login/setup${nextQuery()}`;

export async function loadFor(page, view) {
  if (view === "login" || view === "register") {
    page.session.config = await page.api("/api/auth/config").catch(() => page.session.config);
  }
  if ((view === "login" || view === "register") && page.state.auth.user) {
    page.go(nextPath(), { replace: true });
    return false;
  }
  if (view === "profile") {
    const status = await page.api("/api/auth/challenge");
    if (status.step !== "profile") {
      page.go(
        status.step === "mfa"
          ? `/login/mfa${nextQuery()}`
          : status.step === "enroll"
            ? `/login/setup${nextQuery()}`
            : `/login${nextQuery()}`,
        { replace: true }
      );
      return false;
    }
  }
  if (view === "mfa" || view === "setup") {
    const status = await page.api("/api/auth/challenge");
    if (status.step === "profile") {
      page.go(`/login/profile${nextQuery()}`, { replace: true });
      return false;
    }
    if (view === "mfa" && status.step !== "mfa") {
      page.go(status.step === "enroll" ? `/login/setup${nextQuery()}` : `/login${nextQuery()}`, {
        replace: true
      });
      return false;
    }
    if (view === "setup" && status.step !== "enroll" && !page.session.recovery) {
      page.go(status.step === "mfa" ? `/login/mfa${nextQuery()}` : `/login${nextQuery()}`, {
        replace: true
      });
      return false;
    }
    if (view === "setup" && !page.session.recovery && !page.session.setup) {
      page.session.setup = await page.api("/api/auth/mfa/enrol/start", {
        method: "POST",
        body: {}
      });
    }
  }
  if (view === "account") {
    if (!page.state.auth.user) {
      page.go(`/login?next=${encodeURIComponent("/account")}`, { replace: true });
      return false;
    }
    page.session.overview = await page.api("/api/auth/security");
  }
  return true;
}

/** The field a refusal is about, so that its message can be written under it. */
export function fieldOf(form, kind, error) {
  const id = {
    invalid_name: "name",
    invalid_email: "email",
    invalid_credentials: "password",
    weak_password: kind === "password" ? "newPassword" : "password",
    same_password: "newPassword",
    password_mismatch: "confirm",
    invalid_code: form.querySelector("#recoveryCode")
      ? "recoveryCode"
      : kind === "recovery"
        ? "recoveryCodeAuth"
        : "code",
    invalid_password:
      kind === "password" ? (error.status === 401 ? "currentPassword" : "newPassword") : "password"
  }[error.code];
  return id ? form.querySelector(`#${id}`) : null;
}

/** Renders an auth view into `root`; returns false when it redirected elsewhere. */
export async function render(page, root, view) {
  if (!root.dataset.ssr) {
    root.innerHTML = `<div class="loading-line"></div>`;
  }
  try {
    if (!(await page.loadFor(view))) {
      return false;
    }
  } catch (error) {
    root.innerHTML = `<div class="empty card">${icon("warn")}<b>${t("Something went wrong")}</b><span role="alert">${escapeHtml(error.message)}</span><a class="btn" href="/login">${t("Back to sign in")}</a></div>`;
    return true;
  }
  const keepFocus = root.dataset.ssr ? document.activeElement : null;
  root.innerHTML = page.pages[view]();
  delete root.dataset.ssr;
  if (!keepFocus || keepFocus === document.body) {
    root.querySelector("[autofocus]")?.focus();
  }
  // the cover of the hero of the day: with the roster that loads behind the sign-in pages
  if (view === "account") {
    page.security.paintArt(root);
  } else {
    heroesReady().then(() => fillSceneArt(root.querySelector(".au-art__img"), sceneHero(0)));
  }
  return true;
}

export function reset(page) {
  page.session.setup = null;
  page.session.recovery = null;
  page.session.overview = null;
  page.session.useRecovery = false;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { loadFor, render, reset };
