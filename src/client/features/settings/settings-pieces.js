// settings page, pieces page: card, choices, group, segment, and 3 more.
import { MODULES } from "./parts.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { currentTheme } from "../../app/display-preferences.js";
import { currentLanguage, t } from "../../app/browser-i18n.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as settingsPagePiecesPagePiecesPage } from "./settings-form.js";
import { onView as settingsPagePiecesPageActions } from "./settings-actions.js";
import { sectionsOf } from "./settings-form.js";
import { onClickHandler } from "./settings-actions.js";
import { canRegister } from "../../app/app-state.js";

// ---- the pieces of the page -------------------------------------------------------------------
export const card = (
  flow,
  id,
  iconName,
  title,
  text,
  body
) => `<section class="st-card" id="settings-${id}">
      <header class="st-card__head"><span class="st-card__ico">${icon(iconName)}</span><div><h2>${flow.esc(title)}</h2>${text ? `<p>${flow.esc(text)}</p>` : ""}</div></header>
      ${body}
    </section>`;

/** A choice of one among a few, drawn as tiles over radio buttons; `rich` tiles say what each one does. */
export const choices = (flow, name, list, selected, { rich = false, className = "" } = {}) =>
  `<div class="st-choices ${className}" role="radiogroup">${list
    .map(
      ([value, label, text, iconName]) =>
        `<label class="st-choice${rich ? " st-choice--rich" : ""}"><input type="radio" name="${name}" value="${flow.esc(value)}"${String(value) === String(selected) ? " checked" : ""}><span class="st-choice__box">${rich ? `<span class="st-choice__top">${iconName ? icon(iconName) : ""}<i class="st-choice__dot"></i></span>` : ""}<b>${flow.esc(label)}</b>${text ? `<small>${flow.esc(text)}</small>` : ""}</span></label>`
    )
    .join("")}</div>`;

export const group = (flow, title, body) =>
  `<fieldset class="st-group"><legend>${flow.esc(title)}</legend>${body}</fieldset>`;

export const segment = (flow, attribute, list, current, label) =>
  `<div class="seg" role="group" aria-label="${flow.esc(label)}">${list.map(([value, text]) => `<button type="button" ${attribute}="${value}" aria-pressed="${value === current}">${flow.esc(text)}</button>`).join("")}</div>`;

/** What the theme looks like, drawn with the tokens of that theme (a small window: bar, two cards, a button). */
export const themeTile = (flow, value, label, current) =>
  `<button type="button" class="st-theme" data-set-theme="${value}" aria-pressed="${value === current}"><span class="st-shot${value === "dark" ? " keep-dark" : ""}"${value === "light" ? ' data-theme="light"' : ""} aria-hidden="true"><i class="st-shot__bar"></i><i class="st-shot__card"></i><i class="st-shot__card st-shot__card--b"></i><i class="st-shot__btn"></i></span><span class="st-theme__name">${flow.esc(label)}</span></button>`;

export const linkTile = (flow, href, iconName, title, text = "") =>
  `<a class="st-link" href="${href}"><span class="st-link__ico">${icon(iconName)}</span><span class="st-link__text"><b>${flow.esc(title)}</b>${text ? `<small>${flow.esc(text)}</small>` : ""}</span>${icon("right", "i--sm i--dir")}</a>`;

export function show(flow, app) {
  const ui = { flow };
  bindTo(ui, settingsPagePiecesPagePiecesPage, settingsPagePiecesPageActions);
  ui.root = pageRoot(app, ui.flow.hydration);
  ui.user = ui.flow.state.auth.user;
  ui.enabled = new Set(ui.flow.state.modules ?? MODULES);
  ui.settings = ui.flow.state.settings;
  ui.language = currentLanguage();
  ui.theme = currentTheme();
  const hero = sceneHero(5);
  const nav = [
    ["parts", "grid", t("Parts of the site")],
    ["series", "swords", t("New series")],
    ["interface", "sun", t("Interface")],
    ["notifications", "bell", t("Notifications")],
    ...(ui.user
      ? [
          ["account", "user", t("Account")],
          ["api", "key", t("API keys")]
        ]
      : [])
  ];

  ui.sections = sectionsOf(ui);

  const figures = [
    ["parts", t("Parts of the site")],
    ["format", t("Series format")],
    ["language", t("Language")]
  ];

  ui.root.innerHTML = `<header class="page-head st-stage keep-dark card--feature rise">${sceneArtSlot("st-stage__art", hero)}<div class="st-stage__veil" aria-hidden="true"></div>
            <div class="st-stage__main">
              <div class="crumb">${t("Your account")}${icon("right", "i--dir")}${t("Settings")}</div>
              <h1>${t("Settings")}</h1>
              <p>${ui.user ? t("Your choices are kept on your account.") : t("Your choices are kept in this browser. Sign in to keep them everywhere.")}</p>
            </div>
            <ul class="st-figures st-figures--${figures.length}">${figures.map(([id, label]) => `<li><b data-fig="${id}">–</b><span>${label}</span></li>`).join("")}</ul>
          </header>
          <form id="settings-form" class="st-layout" novalidate>
            <nav class="st-rail rise d-1" aria-label="${t("Sections")}">
              ${ui.user ? `<div class="st-rail__me">${avatarMarkup(ui.user, 44)}<div><b>${ui.flow.esc(ui.user.name)}</b><small>${ui.user.tag ? `#${ui.flow.esc(ui.user.tag)}` : ""}</small></div></div>` : ""}
              <ul>${nav.map(([id, name, label], index) => `<li><a href="#settings-${id}" data-section="${id}"${index === 0 ? ' class="on"' : ""}>${icon(name)}<span>${ui.flow.esc(label)}</span></a></li>`).join("")}</ul>
              ${ui.user ? "" : `<div class="st-rail__cta"><a class="btn btn--primary btn--block" href="/login?next=%2Fsettings">${t("Sign in")}</a>${canRegister() ? `<a class="btn btn--block" href="/register">${t("Create account")}</a>` : ""}</div>`}
            </nav>
            <div class="st-main">${ui.sections.join("")}</div>
            <div class="st-savebar" id="settings-savebar" hidden>
              <span class="st-savebar__msg">${icon("info")}<span id="settings-status" role="status">${t("You have unsaved changes.")}</span></span>
              <p class="form-error" id="settings-error" role="alert"></p>
              <div class="hstack"><button class="btn btn--ghost btn--sm" type="button" id="settings-discard">${t("Discard changes")}</button><button class="btn btn--primary btn--sm" type="submit">${icon("check", "i--sm")}${t("Save settings")}</button></div>
            </div>
          </form>`;
  fillSceneArt(ui.root.querySelector(".st-stage__art"), hero);

  ui.form = ui.root.querySelector("#settings-form");
  ui.bar = ui.root.querySelector("#settings-savebar");

  ui.saved = JSON.stringify(ui.read());

  ui.paintFigures();

  ui.form.addEventListener("input", ui.refresh);
  ui.form.addEventListener("change", ui.refresh);

  ui.root.querySelector("#settings-discard").addEventListener("click", () => {
    const before = JSON.parse(ui.saved);
    for (const box of ui.form.querySelectorAll('input[name="module"]')) {
      box.checked = before.modules.includes(box.value);
    }
    for (const name of ["bestOf", "gameMode", "draftMode"]) {
      for (const radio of ui.form.querySelectorAll(`input[name="${name}"]`)) {
        radio.checked = String(before.settings[name]) === radio.value;
      }
    }
    ui.form.elements.startPage.value = before.settings.startPage;
    ui.form.elements.reduceMotion.checked = before.settings.reduceMotion;
    ui.refresh();
  });

  ui.form.querySelector(".st-rail").addEventListener("click", ui.onClick);
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ui.markSection(entry.target.id.replace("settings-", ""));
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const section of ui.root.querySelectorAll(".st-card")) {
      spy.observe(section);
    }
  }

  ui.form.addEventListener("click", onClickHandler);

  ui.form.addEventListener("submit", ui.onSubmit);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { card, choices, group, segment, themeTile, linkTile, show };
