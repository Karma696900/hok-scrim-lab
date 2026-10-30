// notebook, note: comboStrip, noteCard, listHtml.
import { KIND_ICONS, NOTE_KINDS, STATUSES, kindLabel, statusLabel } from "./training-shared.js";
import { comboSteps, skillsById } from "../../domain/hero-combos.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { howHtml } from "./showcase.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "../community/stage.js";
import { t } from "../../app/browser-i18n.js";
import { vodMarkup } from "../../domain/vod-links.js";
import { options } from "./notebook-parts.js";

// ---- a note ----------------------------------------------------------------------------------
export const comboStrip = async (page, note) =>
  comboSteps(note.steps, skillsById(await page.view.sheetOf(note.heroId)));

export async function noteCard(page, note) {
  const lead = note.heroId
    ? `<span class="pt s-56">${page.view.portrait(note.heroId, 56)}</span>`
    : `<span class="trn-note__icon">${icon(KIND_ICONS[note.kind])}</span>`;
  return `<article class="trn-note note-card ${note.kind}${page.editing?.id === note.id ? " is-editing" : ""}" data-note="${esc(note.id)}" data-st="${note.status}">
        ${lead}
        <div class="trn-note__main">
          <b>${esc(note.title)}</b>
          <div class="trn-note__tags"><span class="pill pill--blue">${esc(kindLabel(note.kind))}</span>${note.heroId ? `<span class="pill pill--grey">${esc(page.view.heroName(note.heroId))}</span>` : ""}</div>
          ${note.kind === "combo" && note.steps.length ? await page.comboStrip(note) : ""}
          ${note.kind === "vod" ? vodMarkup(note) : ""}
          ${note.body ? `<p class="note-body">${esc(note.body)}</p>` : ""}
        </div>
        <div class="trn-note__side">
          <label class="field"><select class="note-status" data-status="${esc(note.id)}" aria-label="${t("Status")}">${options(STATUSES, note.status, status => statusLabel(status, note.kind))}</select></label>
          <div class="hstack"><button type="button" class="btn btn--ghost btn--sm" data-edit="${esc(note.id)}">${icon("pencil", "i--sm")}${t("Edit")}</button><button type="button" class="btn btn--ghost btn--sm" data-remove="${esc(note.id)}">${icon("trash", "i--sm")}${t("Delete")}</button></div>
        </div>
      </article>`;
}

export async function listHtml(page) {
  const shown = page.notes.filter(
    note =>
      (page.filter.kind === "all" || note.kind === page.filter.kind) &&
      (!page.filter.heroId || note.heroId === page.filter.heroId)
  );
  const cards = await Promise.all(shown.map(page.noteCard));
  const kinds = ["all", ...NOTE_KINDS];
  const none = page.notes.length
    ? lineHtml("book", t("No note matches these filters."), "", "")
    : `${lineHtml(
        "book",
        t("Nothing in your notebook yet"),
        t("Write down what you want to practise: a mechanic, a combo, a goal for the next scrim."),
        `<button class="btn btn--primary btn--sm" type="button" data-new>${icon("plus", "i--sm")}${t("New note")}</button>`
      )}${howHtml()}`;
  return `<div class="trn-bar">
          <div class="seg segmented" role="group" aria-label="${t("Type")}">${kinds.map(kind => `<button type="button" class="${kind === page.filter.kind ? "on" : ""}" data-kind="${kind}" aria-pressed="${kind === page.filter.kind}">${esc(kind === "all" ? t("All") : kindLabel(kind))}</button>`).join("")}</div>
          <label class="field"><select id="note-filter-hero" aria-label="${t("Hero")}"><option value="">${t("All heroes")}</option>${page.heroChoices(page.filter.heroId)}</select></label>
        </div>
        <div class="list note-list">${cards.join("") || none}</div>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { comboStrip, noteCard, listHtml };
