// notebook, small helpers: blank, requestBody, marksProblem, heroList, and 3 more.
import { COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import { KIND_ICONS, NOTE_KINDS, STATUSES, kindLabel, statusLabel } from "./training-shared.js";
import { VOD_MARKS_MAX, VOD_MARK_TEXT_MAX, VOD_URL_MAX } from "../../../shared/vod-model.js";
import { basicAttack } from "../../domain/hero-combos.js";
import { dataUnavailable } from "../../lib/dom.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { heroPicker } from "../../shell/hero-picker.js";

export const blank = (
  page,
  kind = "goal",
  heroId = page.filter.heroId || page.heroIds[0] || ""
) => ({
  id: null,
  kind,
  heroId,
  title: "",
  body: "",
  status: "todo",
  steps: [],
  url: "",
  marksText: ""
});

/** What is sent for a note: the steps only for a combo, the link and the moments only for a video review. */
export const requestBody = (note, overrides = {}) => {
  const { kind, heroId, title, body, status, steps, url, marks } = { ...note, ...overrides };
  return {
    kind,
    heroId: heroId || null,
    title,
    body,
    status,
    steps: kind === "combo" ? steps : undefined,
    url: kind === "vod" ? url : undefined,
    marks: kind === "vod" ? marks : undefined
  };
};

/** The sentence for a line of the moments that cannot be read. */
export const marksProblem = ({ reason, line }) =>
  ({
    format: t("Line {line}: write a time such as 12:30, then what to look at.", { line }),
    long: t("Line {line}: at most {max} characters.", { line, max: VOD_MARK_TEXT_MAX }),
    many: t("A video review has at most {max} moments.", { max: VOD_MARKS_MAX })
  })[reason];

// the heroes a note can be about: those of the notebook first, then every hero of the game
export const heroList = page => {
  const known = new Map(page.view.state.heroes.map(hero => [hero.id, hero]));
  const ids = [
    ...new Set([
      ...page.heroIds,
      ...page.view.state.heroes.filter(hero => hero.availableGlobal !== false).map(hero => hero.id)
    ])
  ];
  return ids.map(id => known.get(id) ?? { id, name: page.view.heroName(id) });
};

// the hero of a note: a combo or a VOD is always about one hero (the first of the list until another is picked)
const notePicker = (page, note) => {
  const heroes = page.heroList();
  const required = note.kind === "combo" || note.kind === "vod";
  return heroPicker({
    id: "note-hero",
    name: "heroId",
    value: note.heroId || (required ? (heroes[0]?.id ?? "") : ""),
    heroes,
    empty: required ? "" : t("No hero"),
    label: t("Hero")
  });
};

export const options = (values, selected, label) =>
  values
    .map(
      value =>
        `<option value="${value}"${value === selected ? " selected" : ""}>${esc(label(value))}</option>`
    )
    .join("");

// ---- the overview of the notebook (nothing is being written) -----------------------------------
export function glanceHtml(page) {
  const count = status => page.notes.filter(note => note.status === status).length;
  const noted = [...new Set(page.notes.map(note => note.heroId).filter(Boolean))];
  const chips = noted.length ? noted : page.heroIds.slice(0, 10);
  const attribute = noted.length ? "data-filter-hero" : "data-new-hero";
  return `<section class="card card--feature trn-glance">
          <div class="card__head"><h2>${t("Status")}</h2><span class="pill pill--grey">${number(page.notes.length)}</span></div>
          <ul class="trn-status">${STATUSES.map(
            status =>
              `<li data-st="${status}"><b>${number(count(status))}</b><span>${esc(statusLabel(status))}</span><span class="bar" aria-hidden="true"><i data-p="${page.notes.length ? Math.round((count(status) / page.notes.length) * 100) : 0}"></i></span></li>`
          ).join("")}</ul>
          <h3 class="subheading">${t("New note")}</h3>
          <div class="trn-kindbuttons">${NOTE_KINDS.map(kind => `<button type="button" class="trn-kindbtn" data-new-kind="${kind}">${icon(KIND_ICONS[kind])}<span>${esc(kindLabel(kind))}</span>${icon("plus", "i--sm")}</button>`).join("")}</div>
          ${
            chips.length
              ? `<h3 class="subheading">${t("Heroes")}</h3><div class="trn-herochips">${chips.map(id => `<button type="button" class="trn-herochip" ${attribute}="${esc(id)}"><span class="pt s-28">${page.view.portrait(id, 28)}</span>${esc(page.view.heroName(id))}</button>`).join("")}</div>`
              : ""
          }
        </section>`;
}

// ---- the form of a note ----------------------------------------------------------------------
export async function formMarkup(page) {
  const note = page.editing;
  let picker = "";
  if (note.kind === "combo") {
    const sheetSkills = note.heroId ? page.view.skillsOf(await page.view.sheetOf(note.heroId)) : [];
    // the basic attack can always be a step, even before the skills of the hero are fetched
    const skills = note.heroId ? [...sheetSkills, basicAttack()] : [];
    const byId = new Map(skills.map(skill => [skill.id, skill]));
    picker = `<div class="full label"><span class="trn-label-line">${t("Combo: pick the skills in order")}<span class="pill pill--grey">${number(note.steps.length)} / ${number(COMBO_STEPS_MAX)}</span></span>
          ${
            sheetSkills.length
              ? `<div class="skill-palette">${skills.map(skill => `<button type="button" class="skill-button cb-pal" data-add-step="${esc(skill.id)}" aria-label="${esc(skill.name)}" title="${esc(skill.name)}"${note.steps.length >= COMBO_STEPS_MAX ? " disabled" : ""}>${page.view.skillIcon(skill, 36)}<span>${esc(skill.name)}</span></button>`).join("")}</div>`
              : dataUnavailable(t("The skills of this hero have not been fetched yet."))
          }
          ${
            note.steps.length
              ? `<ol class="step-editor">${note.steps
                  .map(
                    (step, index) =>
                      `<li><span class="step-editor__n" aria-hidden="true">${index + 1}</span>${page.view.skillIcon(byId.get(step.skillId), 36)}<label class="field"><input data-hint="${index}" value="${esc(step.hint)}" maxlength="60" placeholder="${t("Hint (optional)")}" aria-label="${t("Hint for step {number}", { number: index + 1 })}"></label><button type="button" class="btn btn--ghost btn--icon btn--sm" data-step-up="${index}" aria-label="${t("Move up")}"${index === 0 ? " disabled" : ""}>${icon("up", "i--sm")}</button><button type="button" class="btn btn--ghost btn--icon btn--sm" data-step-down="${index}" aria-label="${t("Move down")}"${index === note.steps.length - 1 ? " disabled" : ""}>${icon("chevron", "i--sm")}</button><button type="button" class="btn btn--ghost btn--icon btn--sm" data-step-remove="${index}" aria-label="${t("Remove step {number}", { number: index + 1 })}">${icon("x", "i--sm")}</button></li>`
                  )
                  .join("")}</ol>`
              : `<p class="muted">${t("No step yet: choose a skill above.")}</p>`
          }</div>`;
  }
  if (note.kind === "vod") {
    picker = `<label class="label full">${t("Link of the video")}<span class="field"><input id="note-url" name="url" type="url" inputmode="url" maxlength="${VOD_URL_MAX}" placeholder="https://" autocomplete="off" spellcheck="false" value="${esc(note.url)}"></span></label>
          <div class="label full"><label for="note-marks">${t("Moments to look at again")}</label><span class="field field--area"><textarea id="note-marks" name="marks" rows="5" spellcheck="false" placeholder="${esc(t("12:30 late rotation"))}" aria-describedby="note-marks-help">${esc(note.marksText)}</textarea></span><small id="note-marks-help">${t("One moment per line: the time (12:30 or 1:02:03), then what to look at.")}</small></div>`;
  }
  return `<form id="note-form" class="trn-editor card card--feature" novalidate>
        <div class="card__head"><h2>${note.id ? t("Edit") : t("New note")}</h2><span class="trn-editor__kind">${icon(KIND_ICONS[note.kind])}${esc(kindLabel(note.kind))}</span></div>
        <div class="form-grid">
          <label class="label">${t("Type")}<span class="field"><select id="note-kind" name="kind">${options(NOTE_KINDS, note.kind, kindLabel)}</select></span></label>
          <div class="label">${t("Hero")}${notePicker(page, note)}</div>
          <label class="label full">${t("Title")}<span class="field"><input id="note-title" name="title" maxlength="100" required value="${esc(note.title)}"></span></label>
          ${picker}
          <label class="label full">${t("Details")}<span class="field field--area"><textarea id="note-body" name="body" rows="4" maxlength="2000">${esc(note.body)}</textarea></span></label>
          <label class="label full">${t("Status")}<span class="field"><select id="note-status" name="status">${options(STATUSES, note.status, status => statusLabel(status, note.kind))}</select></span></label>
          <div class="full trn-editor__foot">
            <p class="form-error" id="note-error" role="alert"></p>
            <div class="hstack"><button class="btn btn--primary" type="submit">${icon("check")}${t("Save")}</button><button class="btn btn--ghost" type="button" data-cancel>${t("Cancel")}</button></div>
          </div>
        </div>
      </form>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { blank, heroList, glanceHtml, formMarkup };
