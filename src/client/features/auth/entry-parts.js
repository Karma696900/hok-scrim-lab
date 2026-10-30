// entry, small helpers: frame, googleButton, tabs, switchLine, and 7 more.
import {
  codeFieldHtml,
  codesHtml,
  errorBox,
  fieldHtml,
  passwordHint,
  stepsHtml,
  strengthHtml,
  submitHtml
} from "./forms.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { perks } from "../../domain/account-perks.js";
import { sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { t } from "../../app/browser-i18n.js";

export const frame = ({
  title,
  lead = "",
  body,
  tabs = "",
  steps = "",
  badge = "",
  consent = false
}) => `<div class="authpage">
      <aside class="au-art keep-dark">
        ${sceneArtSlot("au-art__img", sceneHero(0))}
        <div class="au-art__veil" aria-hidden="true"></div>
        <a class="au-brand" href="/"><img src="/logo.svg" alt="" width="34" height="42"><span>HOK Global<br>Scrim Lab</span></a>
        <div class="au-pitch">
          <p class="au-hook">${t("The scrim lab for Honor of Kings Global.")}</p>
          <ul class="au-perks">${perks()
            .map(
              ([name, text]) => `<li><span class="au-perks__ico">${icon(name)}</span>${text}</li>`
            )
            .join("")}</ul>
        </div>
      </aside>
      <div class="au-main">
        <div class="au-top"><a class="btn btn--ghost btn--sm" href="/">${icon("left", "i--sm i--dir")}${t("Back to the overview")}</a></div>
        <section class="au-card" aria-labelledby="auth-title">
          ${tabs}${steps}${badge}
          <h1 id="auth-title">${escapeHtml(title)}</h1>
          ${lead ? `<p class="au-lead">${escapeHtml(lead)}</p>` : ""}
          ${body}
        </section>
        <p class="au-legal">${consent ? `${t("By creating an account, you accept the {terms} and the {privacy}.", { terms: `<a href="/terms">${t("terms of use")}</a>`, privacy: `<a href="/privacy">${t("privacy policy")}</a>` })} ` : ""}<a href="/terms">${t("Terms of use")}</a> · <a href="/privacy">${t("Privacy policy")}</a> · <a href="/contact">${t("Contact")}</a></p>
      </div>
    </div>`;

export const googleButton = view =>
  view.session.config.google
    ? `<a class="btn btn--block auth-google" href="/auth/google?returnTo=${encodeURIComponent(view.nextPath())}">${icon("google")}${t("Continue with Google")}</a><p class="au-note">${t("Google sign-in also asks for your authenticator code.")}</p><div class="or">${t("or")}</div>`
    : "";

export const tabs = (view, active) =>
  view.session.config.registration
    ? `<nav class="au-tabs" aria-label="${t("Account")}"><a class="${active === "login" ? "on" : ""}" href="/login${view.nextQuery()}"${active === "login" ? ' aria-current="page"' : ""}>${t("Sign in")}</a><a class="${active === "register" ? "on" : ""}" href="/register${view.nextQuery()}"${active === "register" ? ' aria-current="page"' : ""}>${t("Create account")}</a></nav>`
    : "";

export const switchLine = (view, text, href, label) =>
  `<p class="au-switch">${text} <a href="${href}${view.nextQuery()}">${label}</a></p>`;

export const pseudoField = () =>
  fieldHtml({
    id: "name",
    label: t("Pseudo"),
    autocomplete: "nickname",
    iconName: "user",
    extra: 'required autofocus maxlength="60"',
    hint: t("Shown to other players. You also get a unique tag that never changes.")
  });

/** A password typed twice, with its strength under the first. */
export const passwordFields = () =>
  `${fieldHtml({ id: "password", label: t("Password"), type: "password", autocomplete: "new-password", iconName: "lock", toggle: true, extra: 'required minlength="12" maxlength="128" aria-describedby="password-hint" data-password-meter', hint: passwordHint(), after: strengthHtml() })}
      ${fieldHtml({ id: "confirm", label: t("Repeat the password"), type: "password", autocomplete: "new-password", iconName: "key", extra: 'required maxlength="128"' })}`;

export const login = view =>
  frame({
    title: t("Sign in"),
    lead: t("Use your email and password, then confirm with your authenticator."),
    tabs: view.tabs("login"),
    body: `${view.googleButton()}
          <form class="auth-form" data-auth-form="login" novalidate>
            ${fieldHtml({ id: "email", label: t("Email"), type: "email", autocomplete: "username", iconName: "mail", extra: 'required autofocus inputmode="email" maxlength="254"' })}
            ${fieldHtml({ id: "password", label: t("Password"), type: "password", autocomplete: "current-password", iconName: "lock", toggle: true, extra: 'required maxlength="1000"' })}
            ${errorBox()}
            ${submitHtml(t("Continue"))}
          </form>
          ${view.session.config.registration ? view.switchLine(t("No account yet?"), "/register", t("Create one")) : ""}`
  });

export const register = view =>
  view.session.config.registration
    ? frame({
        title: t("Create an account"),
        lead: t("Two-factor authentication is required: you will set it up right after."),
        tabs: view.tabs("register"),
        steps: accountSteps(0),
        consent: true,
        body: `${view.googleButton()}
          <form class="auth-form" data-auth-form="register" novalidate>
            ${pseudoField()}
            ${fieldHtml({ id: "email", label: t("Email"), type: "email", autocomplete: "username", iconName: "mail", extra: 'required inputmode="email" maxlength="254"', hint: t("Used to sign in. We never send mail.") })}
            ${passwordFields()}
            ${errorBox()}
            ${submitHtml(t("Create account"))}
          </form>
          ${view.switchLine(t("Already registered?"), "/login", t("Sign in"))}`
      })
    : frame({
        title: t("Registration is closed"),
        lead: t("This server does not accept new accounts."),
        body: view.switchLine("", "/login", t("Sign in"))
      });

export const profile = () =>
  frame({
    title: t("Choose your pseudo"),
    lead: t(
      "Your Google name is not used. Choose the pseudo other players will see, and a password: the authenticator comes next."
    ),
    steps: accountSteps(0),
    body: `<form class="auth-form" data-auth-form="profile" novalidate>
            ${pseudoField()}
            ${passwordFields()}
            ${errorBox()}
            ${submitHtml(t("Continue"))}
          </form>`
  });

export const mfa = view =>
  frame({
    title: t("Enter your code"),
    lead: view.session.useRecovery
      ? t("Use one of the recovery codes you saved. Each works once.")
      : t("Open your authenticator app and type the 6-digit code."),
    steps: signInSteps(1),
    badge: `<span class="au-badge">${icon("phone", "i--xl")}</span>`,
    body: `<form class="auth-form" data-auth-form="mfa" novalidate>
            ${
              view.session.useRecovery
                ? fieldHtml({
                    id: "recoveryCode",
                    label: t("Recovery code"),
                    autocomplete: "off",
                    iconName: "key",
                    extra:
                      'required autofocus maxlength="20" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX"'
                  })
                : codeFieldHtml({
                    id: "code",
                    label: t("6-digit code"),
                    extra: "required autofocus"
                  })
            }
            ${errorBox()}
            ${submitHtml(t("Verify"))}
          </form>
          <div class="au-links"><button class="au-link" type="button" data-auth-action="toggle-recovery">${view.session.useRecovery ? t("Use my authenticator instead") : t("I lost my device: use a recovery code")}</button><a class="au-link" href="/login">${t("Start again")}</a></div>`
  });

export const setup = view => {
  if (view.session.recovery) {
    return frame({
      title: t("Save your recovery codes"),
      lead: t(
        "If you lose your phone, these codes are the only way back in. Each works once. They are shown only now."
      ),
      steps: accountSteps(2),
      body: `${codesHtml(view.session.recovery, escapeHtml)}
            <form class="auth-form" data-auth-form="finish" novalidate>
              <label class="au-check"><input type="checkbox" id="saved" required><span>${t("I stored these codes somewhere safe (password manager, paper).")}</span></label>
              ${errorBox()}
              ${submitHtml(t("Continue"))}
            </form>`
    });
  }
  if (!view.session.setup) {
    return frame({
      title: t("Set up two-factor authentication"),
      lead: t("Loading…"),
      steps: accountSteps(1),
      body: `<div class="loading-line"></div>`
    });
  }
  const setup = view.session.setup;
  return frame({
    title: t("Set up two-factor authentication"),
    lead: t(
      "Scan the QR code with an authenticator app (Google Authenticator, Aegis, 1Password, Authy…), then type the code it shows."
    ),
    steps: accountSteps(1),
    body: `<div class="au-qr">
            <div class="au-qr__code"><img class="qr" src="${escapeHtml(setup.qr)}" alt="${t("QR code to add {account} to your authenticator app", { account: escapeHtml(setup.account) })}" width="220" height="220"></div>
            <div class="au-qr__side">
              <p>${t("Cannot scan? Enter this key manually:")}</p>
              <div class="au-qr__key"><code class="setup-key" id="setup-key">${escapeHtml(setup.secret)}</code><button class="btn btn--sm" type="button" data-auth-action="copy-key">${icon("copy", "i--sm")}${t("Copy")}</button></div>
              <p class="au-note">${t("Account: {account} · time-based, 6 digits", { account: escapeHtml(setup.account) })}</p>
            </div>
          </div>
          <form class="auth-form" data-auth-form="enrol" novalidate>
            ${codeFieldHtml({ id: "code", label: t("6-digit code"), extra: "required autofocus" })}
            ${errorBox()}
            ${submitHtml(t("Turn on and sign in"))}
          </form>`
  });
};

/** The steps of a new account (register, or the pseudo after Google) and those of a sign-in. */
const accountSteps = current =>
  stepsHtml([t("Account"), t("Authenticator"), t("Recovery codes")], current);

const signInSteps = current => stepsHtml([t("Sign in"), t("Authenticator")], current);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { googleButton, tabs, switchLine, login, register, mfa, setup };
