// The two pages of the API: the public documentation (/developers, drawn from the OpenAPI description, indexed),
// and the API page of a signed-in person (/me/api, private): their keys (make, list with the last use, revoke,
// the secret shown once) and how to connect an AI assistant.
import { t } from "../../app/browser-i18n.js";
import { canRegister } from "../../app/app-state.js";
import { icon } from "../../../shared/icons.js";
import { aiSetupHtml } from "./api-ai-setup.js";
import { mountApiKeys } from "./api-keys.js";
import { docHtml } from "./developers-doc.js";

export function createDevelopersPages({ api, escapeHtml, tell, state }) {
  const esc = escapeHtml;
  let description = null; // the OpenAPI document, read once

  /** Every [data-copy] button copies the code of its figure. */
  const bindCopy = root =>
    root.addEventListener("click", async event => {
      const button = event.target.closest("[data-copy]");
      const code = button?.closest("figure")?.querySelector("code");
      if (!code) {
        return;
      }
      try {
        await navigator.clipboard.writeText(code.textContent);
        tell(t("Copied."));
      } catch {
        tell(t("Select the text and copy it."));
      }
    });

  const head = (title, lead, action) =>
    `<header class="page-head api-head"><div><h1>${esc(title)}</h1><p class="muted">${esc(lead)}</p></div>${action}</header>`;

  async function showDocs(app) {
    app.innerHTML = `<div class="api-page dev-page">${head(
      t("HOK API: Honor of Kings data for your programs"),
      t(
        "Read the heroes, items, arcana, spells, tier list and tournament drafts of Honor of Kings Global, and your own scrims, from a program or an AI assistant. Read-only, free, with a key."
      ),
      `<a class="btn btn--primary" href="/me/api">${icon("key", "i--sm")}${t("Get a key")}</a>`
    )}<div class="api-page__body" id="dev-body"><p class="muted">${t("Loading…")}</p></div></div>`;
    const body = app.querySelector("#dev-body");
    try {
      description ??= await api("/api/v1/openapi.json");
      body.innerHTML = docHtml(esc, description, location.origin);
    } catch (error) {
      body.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`;
    }
    bindCopy(body);
  }

  function showConsole(app) {
    const user = state.auth.user;
    const docs = `<a class="btn" href="/developers">${icon("book", "i--sm")}${t("Documentation")}</a>`;
    if (!user || user.isGuest) {
      app.innerHTML = `<div class="api-page">${head(
        t("API"),
        t("Read your data and the data of the game from your own programs and AI assistants."),
        docs
      )}<section class="card api-card api-visitor">${icon("lock")}<div><h2>${t("Sign in to make API keys")}</h2><p class="muted">${t("A key belongs to an account: it reads what you can read, and nothing more.")}</p><span class="hstack"><a class="btn btn--primary btn--sm" href="/login?next=%2Fme%2Fapi">${t("Sign in")}</a>${canRegister() ? `<a class="btn btn--sm" href="/register">${t("Create account")}</a>` : ""}</span></div></section></div>`;
      return;
    }
    app.innerHTML = `<div class="api-page">${head(
      t("API"),
      t(
        "Read your data and the data of the game from your own programs and AI assistants. A key only reads, never writes."
      ),
      docs
    )}<section class="card api-card" id="api-keys"><div class="card__head"><h2>${t("API keys")}</h2></div><div class="ak" id="api-keys-root"><p class="muted">${t("Loading…")}</p></div></section>
      <section class="card api-card" id="ai"><div class="card__head"><h2>${t("Use with an AI")}</h2></div>${aiSetupHtml(esc, location.origin)}</section></div>`;
    bindCopy(app.querySelector("#ai"));
    return mountApiKeys(app.querySelector("#api-keys-root"), { api, escapeHtml, tell });
  }

  return {
    show(app, view) {
      return view === "me-api" ? showConsole(app) : showDocs(app);
    }
  };
}
