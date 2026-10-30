// The hero that is open: its head, its builds, its notes.
import { buildAddress } from "../../../shared/build-model.js";
import { classLabel, laneLogos } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { slotImage } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { VARIANTS } from "./guide-shared.js";
import { heroName } from "./guide-parts.js";
import { checksHtml } from "./checks-markup.js";

// ---- markup: the hero that is open -------------------------------------------------------------------

export function sectionTabs(view, hero) {
  const label = {
    builds: `${t("Builds")} <em class="count">${view.buildsOf(hero.id)}/2</em>`,
    combos: `${t("Combos")} <em class="count">${view.combosOf(hero.id)}</em>`,
    notes: t("Notes")
  };
  return `<div class="tabs bed-sections" role="tablist" aria-label="${t("What to write")}">${SECTIONS.map(
    name =>
      `<button type="button" role="tab" class="${name === view.section ? "on" : ""}" data-bed-section="${name}" aria-selected="${name === view.section}">${label[name]}</button>`
  ).join("")}</div>`;
}

export function headHtml(view, hero) {
  return `<section class="ws-card card--feature bed-head${view.rise()}">
        <div class="bed-hero-line">
          <span class="pt s-80 pt--ring">${slotImage(hero)}</span>
          <div class="grow"><h2>${escapeHtml(heroName(hero))}</h2><div class="bed-meta">${escapeHtml((hero.roles ?? []).map(classLabel).join(" · "))}${hero.lanes?.length ? laneLogos(hero.lanes, 24) : ""}</div></div>
          <a class="btn btn--ghost btn--sm" href="/heroes/${encodeURIComponent(hero.id)}">${t("See the hero page")}</a>
        </div>
        ${view.sectionTabs(hero)}
      </section>`;
}

export function variantTabs(view) {
  return `<div class="bed-variants" role="group" aria-label="${t("Recommended builds")}">${VARIANTS.map(
    which =>
      `<button type="button" class="${which === view.variant ? "on" : ""}" data-bed-variant="${which}" aria-pressed="${which === view.variant}"><b>${t("Build {variant}", { variant: which })}</b><span>${view.variants[which] ? escapeHtml(view.variants[which].name || t("No name")) : t("Empty")}</span></button>`
  ).join("")}</div>`;
}

/** The sheet of the build, on the right: the build as the visitors will see it, its texts, the rules and the buttons. */
export function sheet(view) {
  const saved = view.variants[view.variant];
  const open = buildAddress("/build-lab", { build: view.workbench.build, heroId: view.heroId });
  return `<aside class="ws-panel bed-sheet" aria-label="${t("Build {variant}", { variant: view.variant })}">
        <div class="ws-panel__head"><h2>${t("Build {variant}", { variant: view.variant })}</h2><span class="pill pill--grey">${saved?.updatedAt ? escapeHtml(new Date(saved.updatedAt).toLocaleDateString()) : t("Not saved yet")}</span></div>
        <div class="ws-panel__body lb-sheet">
          ${view.section === "builds" && view.notice ? `<p class="note note--warn bed-notice">${icon("info", "i--sm")}<span>${escapeHtml(view.notice)}</span></p>` : ""}
          ${view.workbench.slotsPanel()}
          ${view.workbench.detailsPanel()}
          ${view.workbench.arcanaPanel()}
          ${view.workbench.errorLine()}
          <div class="ws-form">
            <label class="label">${t("Name (optional)")}<span class="field"><input id="bed-name" maxlength="60" value="${escapeHtml(view.fields.name)}" autocomplete="off"></span></label>
            <label class="label">${t("Source link (optional)")}<span class="field"><input id="bed-source" type="url" inputmode="url" maxlength="500" placeholder="https://" value="${escapeHtml(view.fields.sourceUrl)}" autocomplete="off"></span></label>
            <label class="label">${t("Note (optional)")}<span class="field field--area"><textarea id="bed-note" maxlength="300">${escapeHtml(view.fields.note)}</textarea></span></label>
          </div>
        </div>
        <div class="ws-panel__foot bed-foot">
          <div id="bed-checks" role="status" aria-live="polite">${view.checksHtml()}</div>
          <button type="button" class="btn btn--primary" data-bed-save${view.canSave() ? "" : " disabled"}>${icon("check", "i--sm")}${t("Save build {variant}", { variant: view.variant })}</button>
          ${view.variants[view.variant] ? `<button type="button" class="btn btn--danger" data-bed-delete>${icon("trash", "i--sm")}${t("Delete build {variant}", { variant: view.variant })}</button>` : ""}
          <a class="btn btn--ghost" href="${escapeHtml(open)}">${icon("cube", "i--sm")}${t("Try it in the build lab")}</a>
          <span class="muted" id="bed-dirty">${view.dirty ? t("Changes not saved yet") : ""}</span>
          <p class="form-error" role="alert">${escapeHtml(view.saveError)}</p>
        </div>
      </aside>`;
}

/** The builds tab: the two builds to choose from, the pieces to pick from, and the sheet of the build. */
export const buildsHtml = view => `${view.variantTabs()}
      <div class="bed-build">
        <section class="lb-catalog bed-pick" aria-label="${t("Add")}"><div class="lb-catalog__bar" id="lb-bar">${view.workbench.catalogBar()}</div><div id="lab-grid">${view.workbench.catalogGrid()}</div></section>
        ${view.sheet()}
      </div>`;

/** The notes tab: every text written for the hero, with what is still missing, and a way to write it. */
export function notesHtml(view) {
  const row = (title, text, link, edit) =>
    `<li class="bed-note"><div class="grow"><b>${title}</b>${text ? `<p>${escapeHtml(text)}</p>` : `<p class="ws-none">${t("No note yet")}</p>`}${link}</div>${edit}</li>`;
  const builds = VARIANTS.map(which => {
    const set = view.variants[which];
    if (!set) {
      return row(
        t("Build {variant}", { variant: which }),
        "",
        "",
        `<button type="button" class="btn btn--sm" data-bed-note-build="${which}">${icon("plus", "i--sm")}${t("Edit")}</button>`
      );
    }
    const link = set.sourceUrl
      ? `<a class="link" href="${escapeHtml(set.sourceUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(set.sourceUrl)}</a>`
      : `<span class="ws-none">${t("No source link yet")}</span>`;
    return row(
      `${t("Build {variant}", { variant: which })} · ${escapeHtml(set.name || t("No name"))}`,
      set.note,
      link,
      `<button type="button" class="btn btn--sm" data-bed-note-build="${which}">${icon("pencil", "i--sm")}${t("Edit")}</button>`
    );
  }).join("");
  const combos = view.comboEditor
    .summary()
    .map(combo =>
      row(
        escapeHtml(combo.name),
        combo.note,
        "",
        `<button type="button" class="btn btn--sm" data-bed-note-combos>${icon("pencil", "i--sm")}${t("Edit")}</button>`
      )
    )
    .join("");
  return `<section class="ws-card bed-notes">
        <h3 class="ws-title">${t("Builds")}</h3><ul class="bed-notes__list">${builds}</ul>
        <h3 class="ws-title">${t("Combos")}</h3>${combos ? `<ul class="bed-notes__list">${combos}</ul>` : `<p class="empty-line"><span>${t("No combo yet")}</span><button type="button" class="btn btn--sm" data-bed-note-combos>${icon("plus", "i--sm")}${t("New combo")}</button></p>`}
      </section>`;
}

export function mainHtml(view) {
  const hero = view.heroOf(view.heroId);
  if (!hero) {
    return view.welcomeHtml();
  }
  const body =
    view.section === "combos"
      ? `<div class="stack-y" id="cb-root">${view.comboEditor.html()}</div>`
      : view.section === "notes"
        ? view.notesHtml()
        : view.buildsHtml();
  return `${view.headHtml(hero)}${body}`;
}

const SECTIONS = ["builds", "combos", "notes"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  sectionTabs,
  headHtml,
  variantTabs,
  checksHtml,
  sheet,
  buildsHtml,
  notesHtml,
  mainHtml
};
