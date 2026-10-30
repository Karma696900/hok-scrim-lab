// translations, markup: quotaMarkup, languagesMarkup, statusCard, row, and 3 more.
import { LANGUAGES } from "../../../shared/i18n.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { STATES } from "./translations-shared.js";

// ---- markup -------------------------------------------------------------------------------------

/** What the account of the service says about its quota, with a bar (nothing when it cannot say). */
export function quotaMarkup(page) {
  const quota = page.status.quota;
  if (!page.status.provider || !quota) {
    return "";
  }
  const percent = quota.unlimited
    ? 0
    : Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));
  const line = quota.unlimited
    ? t("Characters used on the account this period: {used} (no limit).", {
        used: number(quota.used)
      })
    : t("Characters used on the account this period: {used} of {limit}.", {
        used: number(quota.used),
        limit: number(quota.limit)
      });
  const share = page.status.quotaShare
    ? `<p class="muted">${t("It stops at {percent}% of the quota, to leave some for the other uses of the key.", { percent: Math.round(page.status.quotaShare * 100) })}</p>`
    : "";
  const bar = quota.unlimited
    ? ""
    : `<div class="bar tr-bar" role="progressbar" aria-label="${t("Quota used")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i data-p="${percent}"></i></div>`;
  return `<div class="tr-quota"><p class="muted">${line}</p>${bar}${share}</div>`;
}

/** The languages: how far each one that is asked for is, and a button for each one that is not. */
export function languagesMarkup(page) {
  const rows = page.status.languages ?? [];
  if (!rows.length) {
    return "";
  }
  const chips = rows
    .map(entry =>
      entry.wanted
        ? `<li class="tr-lang tr-lang--on" data-code="${page.esc(entry.code)}"><span>${page.esc(languageName(entry.code))}</span> <b>${number(entry.ok)}</b>/${number(page.status.texts)}</li>`
        : `<li><button type="button" class="tr-lang tr-lang--off" data-tr-want="${page.esc(entry.code)}" title="${page.esc(t("Translate into {language}", { language: languageName(entry.code) }))}">${icon("plus", "i--sm")}<span>${page.esc(languageName(entry.code))}</span></button></li>`
    )
    .join("");
  const all = rows.every(entry => entry.wanted);
  return `<div class="tr-languages"><h3>${t("Languages")}</h3>
      <p class="muted">${t("A language is translated once somebody asks for it: a visitor who reads the site in it, or you with the plus buttons.")}</p>
      <ul class="tr-langs">${chips}</ul>
      ${all ? "" : `<button type="button" class="btn btn--sm" data-tr-want-all>${t("Translate into every language")}</button>`}</div>`;
}

export function statusCard(page) {
  const total = page.status.total.ok + page.status.total.pending + page.status.total.failed;
  const percent = total ? Math.round((page.status.total.ok / total) * 100) : 0;
  const notes = [];
  if (!page.status.provider) {
    notes.push(
      `<div class="note note--info">${icon("info", "i--sm")}<div><b>${t("Automatic translation is off")}</b><p>${t("Every text is shown as it was typed, and you can translate it by hand below. To translate by itself, add your DeepL key to the server as DEEPL_API_KEY (see the README), then restart it.")}</p></div></div>`
    );
  }
  if (page.status.refused) {
    notes.push(
      `<div class="note note--warn">${icon("warn", "i--sm")}<div><b>${t("The translation service refused the key")}</b><p>${page.esc(page.status.refused)}</p><p>${t("Nothing is sent until the key is changed on the server and a round is asked for.")}</p></div></div>`
    );
  }
  if (page.status.paused?.reason === "quota") {
    notes.push(
      `<div class="note note--warn">${icon("clock", "i--sm")}<div><b>${t("Quota reached")}</b><p>${t("Nothing is sent until the quota is renewed or raised.")}</p></div></div>`
    );
  } else if (page.status.paused) {
    notes.push(
      `<div class="note note--warn">${icon("clock", "i--sm")}<div><b>${t("Paused")}</b><p>${t("The translator waits and will try again by itself.")}${page.status.lastError ? ` ${page.esc(page.status.lastError)}` : ""}</p></div></div>`
    );
  } else if (page.status.lastError && !page.status.refused) {
    notes.push(
      `<p class="muted">${t("Last problem: {message}", { message: page.esc(page.status.lastError) })}</p>`
    );
  }
  return `<section class="ws-card tr-status" id="tr-status">
      <div class="card__head"><h2>${t("Translations")}</h2><span class="pill ${page.status.provider ? "pill--blue" : "pill--grey"}">${page.status.provider ? page.esc(page.status.provider.label) : t("Off")}</span></div>
      <div class="bar tr-bar" role="progressbar" aria-label="${t("Translations done")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i data-p="${percent}"></i></div>
      <ul class="tr-counts">
        <li><b>${number(page.status.texts)}</b><span>${t("Texts")}</span></li>
        <li><b>${number(page.status.total.ok)}</b><span>${t("translations done")}</span></li>
        <li><b>${number(page.status.total.pending)}</b><span>${t("waiting")}</span></li>
        <li class="${page.status.total.failed ? "is-bad" : ""}"><b>${number(page.status.total.failed)}</b><span>${t("failed")}</span></li>
        <li><b>${number(page.status.total.manual)}</b><span>${t("written by hand")}</span></li>
      </ul>
      <div class="hstack wrap tr-actions">
        <button type="button" class="btn btn--primary" data-tr-sweep${page.status.running || page.busy ? " disabled" : ""}>${icon("refresh", "i--sm")}${page.status.running ? t("Translating…") : page.status.provider ? t("Translate now") : t("Look for new texts")}</button>
        ${page.status.total.failed ? `<button type="button" class="btn" data-tr-retry>${t("Try the failed ones again")}</button>` : ""}
      </div>
      ${notes.join("")}
      ${page.quotaMarkup()}
      ${page.status.provider && page.status.dailyChars !== null ? `<p class="muted">${t("Sent today: {used} of {limit} characters.", { used: number(page.status.usedToday), limit: number(page.status.dailyChars) })}</p>` : ""}
      ${page.languagesMarkup()}
      <p class="muted tr-lead">${t("What the staff writes is kept as typed and translated into the languages the site is read in. A visitor reads it in their language; until a translation exists they read it as typed.")}</p>
    </section>`;
}

export function row(page, entry) {
  const manual = entry.status === "ok" && entry.origin === "manual";
  const own = entry.status === "ok" && entry.origin === "source";
  const badge = own
    ? `<span class="pill pill--grey">${t("Written in this language")}</span>`
    : manual
      ? `<span class="pill pill--blue">${t("By hand")}</span>`
      : entry.status === "ok"
        ? `<span class="pill">${t("Automatic")}</span>`
        : entry.status === "failed"
          ? `<span class="pill pill--warn">${t("Failed")}</span>`
          : `<span class="pill pill--grey">${t("Waiting")}</span>`;
  const failed =
    entry.status === "failed" && entry.error
      ? `<p class="tr-row__error" role="note">${page.esc(reasonLabel(entry.error))}</p>`
      : "";
  return `<li class="tr-row" data-hash="${page.esc(entry.hash)}">
      <div class="tr-row__source"><div class="hstack wrap"><span class="pill pill--grey">${page.esc(kindLabel(entry.kind))}</span>${entry.sourceLanguage ? `<small class="muted">${t("Written in {language}", { language: page.esc(languageName(entry.sourceLanguage)) })}</small>` : ""}</div><p class="tr-source-text" dir="auto">${page.esc(entry.source)}</p></div>
      <div class="tr-row__text">
        <label class="field field--area"><textarea rows="2" maxlength="4000" dir="auto" data-tr-text="${page.esc(entry.hash)}" aria-label="${page.esc(t("Translation into {language}", { language: languageName(entry.language) }))}"${own ? " readonly" : ""}>${page.esc(entry.text ?? "")}</textarea></label>
        ${failed}
        <div class="hstack wrap">${badge}
          ${own ? "" : `<button type="button" class="btn btn--sm" data-tr-save="${page.esc(entry.hash)}">${t("Save")}</button>`}
          ${manual || entry.status === "failed" ? `<button type="button" class="btn btn--ghost btn--sm" data-tr-reset="${page.esc(entry.hash)}">${t("Back to automatic")}</button>` : ""}
          <button type="button" class="btn btn--ghost btn--sm" data-tr-keep="${page.esc(entry.hash)}" title="${page.esc(t("The text stays as typed in every language"))}">${t("Keep as typed")}</button>
        </div>
      </div>
    </li>`;
}

/** What the list says when it has no line: a language nobody asked for, no text matching, or no text at all. */
export function emptyList(page) {
  const entry = page.status.languages?.find(item => item.code === page.view.language);
  if (entry && !entry.wanted) {
    return `<p class="muted empty-line"><span>${t("Nobody has asked for this language yet.")}</span><button type="button" class="btn btn--sm" data-tr-want="${page.esc(page.view.language)}">${icon("plus", "i--sm")}${t("Translate into {language}", { language: page.esc(languageName(page.view.language)) })}</button></p>`;
  }
  return `<p class="muted empty-line"><span>${page.status.texts ? t("No text matches.") : t("Nothing to translate yet: write a stat, an item or a tag and it appears here.")}</span></p>`;
}

export function listCard(page) {
  const pages = Math.max(1, Math.ceil(page.list.total / page.list.pageSize));
  const pager =
    pages > 1
      ? `<nav class="pager" aria-label="${t("Pages")}"><button type="button" class="btn btn--sm" data-tr-page="${page.list.page - 1}"${page.list.page <= 1 ? " disabled" : ""}>${t("Previous")}</button><span class="muted">${page.list.page} / ${pages}</span><button type="button" class="btn btn--sm" data-tr-page="${page.list.page + 1}"${page.list.page >= pages ? " disabled" : ""}>${t("Next")}</button></nav>`
      : "";
  return `<section class="ws-card tr-list-card" id="tr-list">
      <div class="card__head"><h2>${t("Texts in {language}", { language: page.esc(languageName(page.view.language)) })}</h2><span class="pill pill--grey">${number(page.list.total)}</span></div>
      <div class="tr-filters">
        <label class="field"><select id="tr-language" aria-label="${t("Language")}">${LANGUAGES.map(language => `<option value="${language.code}"${language.code === page.view.language ? " selected" : ""}>${page.esc(language.name)}</option>`).join("")}</select></label>
        <div class="seg" role="group" aria-label="${t("Show")}">${STATES.map(state => `<button type="button" class="${page.view.state === state ? "on" : ""}" data-tr-state="${state}" aria-pressed="${page.view.state === state}">${stateLabel(state)}</button>`).join("")}</div>
        <label class="field field--search">${icon("search", "i--sm")}<input type="search" id="tr-search" placeholder="${t("Filter")}" aria-label="${t("Filter")}" value="${page.esc(page.view.search)}" autocomplete="off"></label>
      </div>
      ${page.list.rows.length ? `<ul class="tr-list">${page.list.rows.map(page.row).join("")}</ul>` : page.emptyList()}
      ${pager}
    </section>`;
}

export const markup = page => `<div class="tr-panel">${page.statusCard()}${page.listCard()}</div>`;

const stateLabel = state =>
  ({
    "": t("All"),
    failed: t("Failed"),
    pending: t("Waiting"),
    manual: t("By hand"),
    machine: t("Automatic")
  })[state];

const kindLabel = kind =>
  ({
    stat: t("Stat"),
    option: t("Option"),
    tag: t("Tag"),
    "tag-note": t("Tag description"),
    item: t("Item"),
    "item-note": t("Description"),
    effect: t("Effect name"),
    "effect-text": t("Effect"),
    "line-note": t("Note on a bonus"),
    arcana: t("Arcana"),
    cost: t("Cost"),
    "skill-note": t("Spell note"),
    detail: t("Spell detail"),
    build: t("Build"),
    "build-note": t("Build note"),
    combo: t("Combo"),
    "combo-note": t("Combo note"),
    hint: t("Hint"),
    situation: t("Situation"),
    "situation-text": t("The situation"),
    pin: t("Pin"),
    map: t("Map")
  })[kind] ?? kind;

/** Why a translation failed, in words (what the service said stays as it was said). */
const reasonLabel = reason =>
  ({
    "numbers differ": t("The numbers are not the same as in the text."),
    "too long": t("The translation is much longer than the text."),
    empty: t("The translation is empty."),
    "no text": t("The service gave no text."),
    "missing from the answer": t("The service did not answer for this text.")
  })[reason] ?? reason;

const languageName = code => LANGUAGES.find(language => language.code === code)?.name ?? code;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  quotaMarkup,
  languagesMarkup,
  statusCard,
  row,
  emptyList,
  listCard,
  markup
};
