// The legal pages: terms of use, privacy policy, cookies, legal notice, and the contact form. They are public and the
// same for everybody; the texts are in texts.js (French and English, the other languages read the English reference),
// the facts only the owner knows are in shared/legal-info.js (a field left empty shows as a "to complete" mark).
import { LEGAL_INFO } from "../../../shared/legal-info.js";
import { LEGAL_VIEWS } from "../../../shared/routes.js";
import { icon } from "../../../shared/icons.js";
import { currentLanguage, date, t } from "../../app/browser-i18n.js";
import { TEXTS, textLanguage } from "./texts.js";

const NAV_LABELS = () => ({
  terms: t("Terms of use"),
  privacy: t("Privacy policy"),
  cookies: t("Cookies"),
  legal: t("Legal notice"),
  contact: t("Contact")
});

export function createLegalPages({ api, escapeHtml, tell }) {
  const esc = escapeHtml;
  const language = () => textLanguage(currentLanguage());

  /** What stands in place of a fact the owner has not written yet: a mark nobody can miss. */
  const todo = () =>
    `<mark class="legal-todo">${language() === "fr" ? "À COMPLÉTER" : "TO COMPLETE"}</mark>`;
  const fact = (value, wrap = text => text) =>
    String(value ?? "").trim() ? wrap(esc(value)) : todo();

  const FACTS = {
    publisher: () => fact(LEGAL_INFO.publisher, text => `<b>${text}</b>`),
    publisherKind: () => fact(LEGAL_INFO.publisherKind),
    email: () => fact(LEGAL_INFO.contactEmail, text => `<a href="mailto:${text}">${text}</a>`),
    host: () => fact(LEGAL_INFO.hostName, text => `<b>${text}</b>`),
    hostAddress: () => fact(LEGAL_INFO.hostAddress),
    hostContact: () => fact(LEGAL_INFO.hostContact),
    country: () => fact(LEGAL_INFO.country),
    updated: () => esc(date(`${LEGAL_INFO.updated}T12:00:00Z`))
  };

  /** A text of texts.js as safe HTML, its `{fact}` tokens filled in. */
  const fill = text =>
    esc(text).replace(/\{(\w+)\}/g, (match, key) => (FACTS[key] ? FACTS[key]() : match));

  const block = entry =>
    entry.h
      ? `<h2>${esc(entry.h)}</h2>`
      : entry.ul
        ? `<ul>${entry.ul.map(item => `<li>${fill(item)}</li>`).join("")}</ul>`
        : `<p>${fill(entry.p)}</p>`;

  const nav = current =>
    `<nav class="legal-nav" aria-label="${esc(t("Legal"))}">${LEGAL_VIEWS.map(
      view =>
        `<a href="/${view}"${view === current ? ' aria-current="page" class="on"' : ""}>${esc(NAV_LABELS()[view])}</a>`
    ).join("")}</nav>`;

  const contactForm = () => `<form class="legal-form" id="contact-form" novalidate>
      <label class="label" for="contact-name">${t("Name")}<span class="field"><input id="contact-name" name="name" maxlength="80" autocomplete="name" required></span></label>
      <label class="label" for="contact-email">${t("Email")}<span class="field"><input id="contact-email" name="email" type="email" maxlength="254" autocomplete="email" inputmode="email" required></span></label>
      <label class="label" for="contact-subject">${t("Subject")}<span class="field"><input id="contact-subject" name="subject" maxlength="120" required></span></label>
      <label class="label" for="contact-message">${t("Message")}<span class="field field--area"><textarea id="contact-message" name="message" rows="7" minlength="10" maxlength="4000" required></textarea></span></label>
      <div class="legal-trap" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="muted legal-form__note">${t("We use your name and email address only to answer you, and keep the message for 12 months at most. See the {privacy}.", { privacy: `<a href="/privacy">${esc(t("privacy policy"))}</a>` })}</p>
      <p class="form-error" id="contact-error" role="alert"></p>
      <div><button type="submit" class="btn btn--primary">${icon("send")}${t("Send the message")}</button></div>
    </form>
    <p class="legal-sent" id="contact-sent" role="status" hidden>${icon("check")}<span>${t("Your message was sent. Thank you, we will answer at the address you gave.")}</span></p>`;

  function bind(root) {
    const form = root.querySelector("#contact-form");
    if (!form) {
      return;
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const error = root.querySelector("#contact-error");
      error.textContent = "";
      const body = Object.fromEntries(new FormData(form));
      if (!form.checkValidity()) {
        error.textContent = t(
          "Fill in every field: a valid email address and a message of at least 10 characters."
        );
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await api("/api/contact", { method: "POST", body });
        form.hidden = true;
        root.querySelector("#contact-sent").hidden = false;
      } catch (failure) {
        error.textContent = failure.message || t("Your message could not be sent.");
        tell(error.textContent);
      } finally {
        button.disabled = false;
      }
    });
  }

  return {
    show(app, view) {
      const name = LEGAL_VIEWS.includes(view) ? view : "legal";
      const text = TEXTS[language()];
      const labels = NAV_LABELS();
      const isContact = name === "contact";
      const doc = isContact ? null : text[name];
      const title = isContact ? labels.contact : doc.title;
      const lead = isContact
        ? t("Write to the people behind the site. We read every message.")
        : doc.lead;
      const reference =
        language() === "en" && currentLanguage() !== "en"
          ? `<p class="legal-ref">${icon("info", "i--sm")}${esc(t("The legal texts are written in French and English. This is the English text, which is the reference."))}</p>`
          : "";
      app.innerHTML = `<div class="legal">
        <header class="page-head"><div><h1>${esc(title)}</h1><p class="muted legal-lead">${esc(lead)}</p></div></header>
        ${nav(name)}
        <article class="card legal-doc">
          ${reference}
          ${isContact ? contactForm() : doc.blocks.map(block).join("")}
          ${isContact ? `<p class="muted legal-direct">${t("You can also write to {email}.", { email: FACTS.email() })}</p>` : ""}
          ${isContact ? "" : `<p class="muted legal-date">${t("Last updated: {date}", { date: FACTS.updated() })}</p>`}
        </article>
      </div>`;
      bind(app);
    }
  };
}
