import { icon } from "../../shared/icons.js";
import { t } from "./browser-i18n.js";
import { openPalette } from "../shell/open-palette.js";
import { escapeHtml } from "../lib/dom.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../domain/scene-art.js";
import { canRegister } from "./app-state.js";

/**
 * The page of a place the visitor cannot use: its title, then ONE card that says why and, for someone who is not signed in,
 * the way in (a bare title and a line left the whole page empty).
 */
export function gatePage({ crumb, title, message, signedIn, next }) {
  const way = signedIn
    ? ""
    : `<div class="hstack wrap"><a class="btn btn--primary" href="/login?next=${encodeURIComponent(next)}">${t("Sign in")}</a>${canRegister() ? `<a class="btn btn--ghost" href="/register">${t("Create account")}</a>` : ""}</div>`;
  return `<div class="page-head"><div><div class="crumb">${crumb}</div><h1>${title}</h1></div></div>
    <section class="card gate">${icon("lock", "i--lg")}<div><b>${message}</b>${way}</div></section>`;
}

// The page of an address that does not exist: a stage with the cover of a hero, the address that was asked
// for, a search that opens the palette and the ways back (the overview, the previous page, the heroes). The menu is not
// repeated here: it is the top bar's.

/** Draws the page into `app`. */
export function renderNotFound(app) {
  const hero = sceneHero(7);
  app.innerHTML = `<div class="lost">
      <header class="page-head nf-stage keep-dark card--feature rise">${sceneArtSlot("nf-stage__art", hero)}<div class="nf-stage__veil" aria-hidden="true"></div>
        <b class="nf-code" aria-hidden="true">404</b>
        <div class="nf-stage__main">
          <h1>${t("Page not found")}</h1>
          <p>${t("This page does not exist or has moved.")}</p>
          <p class="nf-path">${icon("link", "i--sm")}<code>${escapeHtml(location.pathname)}</code></p>
          <form class="field nf-search" role="search">${icon("search")}<input type="search" placeholder="${escapeHtml(t("Search a hero, an item, an arcana, a team…"))}" aria-label="${escapeHtml(t("Search a hero, an item, an arcana, a team…"))}" autocomplete="off"><kbd class="kbd">Ctrl K</kbd></form>
          <div class="nf-actions"><a class="btn btn--primary" href="/">${icon("home")}${t("Back to the overview")}</a><button type="button" class="btn" data-nf-back>${icon("left", "i--dir")}${t("Go back")}</button><a class="btn" href="/heroes">${icon("book")}${t("Browse heroes")}</a></div>
        </div>
      </header>
    </div>`;
  fillSceneArt(app.querySelector(".nf-stage__art"), hero);

  // the search is the palette of the top bar: the field opens it, as the one of the bar does
  const field = app.querySelector(".nf-search input");
  field.addEventListener("focus", () => {
    field.blur();
    openPalette();
  });
  app.querySelector(".nf-search").addEventListener("submit", event => {
    event.preventDefault();
    openPalette();
  });
  app.querySelector("[data-nf-back]").addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      location.assign("/");
    }
  });
}
