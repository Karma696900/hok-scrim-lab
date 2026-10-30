// auth security, small helpers: stageHero, pill, head, block, and 9 more.
import { avatarMarkup } from "./auth-avatar.js";
import {
  codeFieldHtml,
  codesHtml,
  errorBox,
  eventLabel,
  eventTone,
  fieldHtml,
  passwordHint,
  strengthHtml
} from "./forms.js";
import { currentLanguage, dateTime, t } from "../../app/browser-i18n.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";

export const stageHero = () => sceneHero(6);

export const pill = (on, label = on ? t("On") : t("Off")) =>
  `<span class="pill${on ? "" : " pill--warn"}">${on ? '<i class="ac-dot"></i>' : ""}${label}</span>`;

export const head = (id, iconName, title, stateHtml = "") =>
  `<header class="ac-head"><span class="ac-ico">${icon(iconName)}</span><h2 id="${id}">${title}</h2>${stateHtml}</header>`;

export const block = (id, iconName, title, stateHtml, body, delay) =>
  `<section class="ac-block rise d-${delay}" aria-labelledby="${id}-title">${head(`${id}-title`, iconName, title, stateHtml)}${body}</section>`;

export const shortDay = time =>
  new Intl.DateTimeFormat(currentLanguage(), { day: "numeric", month: "short" }).format(
    new Date(time)
  );

export function authenticator(page, overview) {
  return block(
    "ac-mfa",
    "shieldcheck",
    t("Two-factor authentication"),
    pill(overview.mfa),
    overview.mfa
      ? `<p class="ac-text">${t("Account: {account} · time-based, 6 digits", { account: page.esc(overview.email) })}</p>`
      : `<p class="ac-text">${t("Two-factor authentication is off on this account.")}</p>
           <div class="ac-actions"><button class="btn btn--primary" type="button" data-auth-action="set-up">${icon("shieldcheck")}${t("Sign in again to set it up")}</button></div>`,
    1
  );
}

export function password(overview) {
  if (!overview.hasPassword) {
    return block(
      "ac-password",
      "lock",
      t("Password"),
      `<span class="pill pill--grey">${icon("google", "i--sm")}${t("Google")}</span>`,
      `<p class="ac-text">${t("This account signs in with Google and has no password.")}</p>`,
      2
    );
  }
  return block(
    "ac-password",
    "lock",
    t("Change password"),
    "",
    `<form class="auth-form" data-auth-form="password" novalidate>
        ${fieldHtml({ id: "currentPassword", label: t("Current password"), type: "password", autocomplete: "current-password", iconName: "lock", toggle: true, extra: 'required maxlength="1000"' })}
        ${fieldHtml({ id: "newPassword", label: t("New password"), type: "password", autocomplete: "new-password", iconName: "key", extra: 'required minlength="12" maxlength="128" aria-describedby="newPassword-hint" data-password-meter', hint: passwordHint(), after: strengthHtml() })}
        ${codeFieldHtml({ id: "code", label: t("Authenticator code"), extra: "required" })}
        ${errorBox("auth-error-password")}
        <button class="btn btn--primary" type="submit">${icon("check")}${t("Change password")}</button>
      </form>`,
    2
  );
}

export function recoveryCodes(page, overview) {
  const left = overview.recoveryRemaining;
  const ticks = Array.from(
    { length: Math.max(RECOVERY_SET, left) },
    (_, index) => `<i${index < left ? ' class="on"' : ""}></i>`
  ).join("");
  const fresh = page.session.recovery
    ? `<div class="ac-fresh"><p class="ac-text"><b>${t("New recovery codes")}</b> ${t("Shown only now. The old ones no longer work.")}</p>${codesHtml(page.session.recovery, page.esc)}</div>`
    : "";
  return block(
    "ac-codes",
    "key",
    t("Recovery codes"),
    overview.mfa ? "" : pill(false),
    overview.mfa
      ? `${fresh}<div class="ac-left"><b>${left}</b><span>${t("Recovery codes left")}</span><span class="ac-ticks" aria-hidden="true">${ticks}</span></div>
          <p class="ac-text">${t("Generate a fresh set (the old ones stop working).")}</p>
          <form class="auth-form" data-auth-form="recovery" novalidate>
            ${codeFieldHtml({ id: "recoveryCodeAuth", label: t("Authenticator code"), name: "code", extra: "required" })}
            ${errorBox("auth-error-recovery")}
            <button class="btn" type="submit">${icon("refresh")}${t("Generate new codes")}</button>
          </form>`
      : `<p class="ac-text">${t("Available once two-factor authentication is on.")}</p>`,
    3
  );
}

export function sessions(page, overview, lastLogin) {
  const user = page.state.auth.user;
  return block(
    "ac-sessions",
    "phone",
    t("Sessions"),
    "",
    `<div class="ac-me">${user ? avatarMarkup(user, 48) : ""}<div><b>${page.esc(overview.name)}</b><small>${page.esc(overview.email)}</small></div><span class="pill">${t("Current")}</span></div>
      ${lastLogin ? `<p class="ac-text">${t("Last sign-in")}: ${page.esc(dateTime(lastLogin.at))}</p>` : ""}
      <div class="ac-danger"><p class="ac-text">${t("Sign out of every browser and device, including this one.")}</p><button class="btn btn--danger" type="button" data-auth-action="logout-all">${icon("logout")}${t("Sign out everywhere")}</button></div>`,
    1
  );
}

/** The rights over one's data (GDPR): a copy of everything, and the erasure of the account. Each asks for the authenticator code. */
export function yourData(overview) {
  return block(
    "ac-data",
    "shieldcheck",
    t("Your data"),
    "",
    `<p class="ac-text">${t("Download a copy of everything the site holds about you. Passwords, authenticator secrets and recovery codes are not in it.")}</p>
      <form class="auth-form" data-auth-form="export" novalidate>
        ${codeFieldHtml({ id: "exportCode", label: t("Authenticator code"), name: "code", extra: "required" })}
        ${errorBox("auth-error-export")}
        <button class="btn" type="submit">${icon("download")}${t("Download my data")}</button>
      </form>
      <div class="ac-danger ac-danger--stack">
        <p class="ac-text">${t("Delete your account for good: your series, tier lists, notes and results are erased. The teams you created go to another member, or are deleted if nobody else is in them. This cannot be undone.")}</p>
        <form class="auth-form" data-auth-form="delete" novalidate>
          ${overview.hasPassword ? fieldHtml({ id: "deletePassword", name: "password", label: t("Password"), type: "password", autocomplete: "current-password", iconName: "lock", toggle: true, extra: 'required maxlength="1000"' }) : ""}
          ${codeFieldHtml({ id: "deleteCode", label: t("Authenticator code"), name: "code", extra: "required" })}
          <label class="au-check"><input type="checkbox" name="sure" required><span>${t("I understand that my account will be deleted for good.")}</span></label>
          ${errorBox("auth-error-delete")}
          <button class="btn btn--danger" type="submit">${icon("trash")}${t("Delete my account")}</button>
        </form>
      </div>`,
    2
  );
}

export function activity(page, overview) {
  const rows = overview.events
    .map(
      item =>
        `<tr><td>${page.esc(dateTime(item.at))}</td><td><span class="ac-what${eventTone(item.event) ? ` ac-what--${eventTone(item.event)}` : ""}"><i></i>${page.esc(eventLabel(item.event))}</span></td><td class="muted">${page.esc(item.detail)}</td></tr>`
    )
    .join("");
  return block(
    "ac-log",
    "clock",
    t("Recent activity"),
    "",
    `<div class="table-scroll"><table class="table auth-table"><thead><tr><th scope="col">${t("When")}</th><th scope="col">${t("What")}</th><th scope="col">${t("Detail")}</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="muted">${t("Nothing yet.")}</td></tr>`}</tbody></table></div>`,
    2
  );
}

/** Draws the cover of the stage once the page is on the screen. */
export const paintArt = root => fillSceneArt(root.querySelector(".ac-stage__art"), stageHero());

export const view = page => {
  const overview = page.session.overview;
  if (!overview) {
    return `<div class="loading-line"></div>`;
  }
  const lastLogin = overview.events.find(item => item.event === "login");
  const low = overview.mfa && overview.recoveryRemaining <= 3;
  return `<header class="page-head ac-stage keep-dark card--feature rise">${sceneArtSlot("ac-stage__art", stageHero())}<div class="ac-stage__veil" aria-hidden="true"></div>
        <div class="ac-stage__main">
          <div class="crumb"><a class="link" href="/settings">${t("Settings")}</a>${icon("right", "i--dir")}${t("Security")}</div>
          <h1>${t("Security")}</h1>
          <p>${t("{name} · {email} · signs in with {method}", { name: page.esc(overview.name), email: page.esc(overview.email), method: overview.viaGoogle ? t("Google") : t("email and password") })}</p>
        </div>
        <ul class="account-stats ac-figures">
          <li><b>${overview.mfa ? t("On") : t("Off")}</b><span>${t("Authenticator")}</span></li>
          <li><b>${overview.recoveryRemaining}</b><span>${t("Recovery codes left")}</span></li>
          <li><b>${lastLogin ? page.esc(shortDay(lastLogin.at)) : "—"}</b><span>${t("Last sign-in")}</span></li>
        </ul>
      </header>
      ${low ? `<div class="note note--warn rise" role="status">${icon("warn", "i--sm")}<span>${t("{count, plural, one {Only # recovery code left: generate new ones below.} other {Only # recovery codes left: generate new ones below.}}", { count: overview.recoveryRemaining })}</span></div>` : ""}
      <div class="ac-grid">
        <div class="ac-col">${page.authenticator(overview)}${password(overview)}${page.recoveryCodes(overview)}</div>
        <div class="ac-col">${page.sessions(overview, lastLogin)}${yourData(overview)}</div>
      </div>
      <div class="ac-wide">${page.activity(overview)}</div>`;
};

const RECOVERY_SET = 10; // the codes of a full set

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { authenticator, recoveryCodes, sessions, activity, view };
