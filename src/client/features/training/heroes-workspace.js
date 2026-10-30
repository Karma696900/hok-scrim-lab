// The workspace of the hero that is open: skills, combos acquired in two forms, base stats.
import { COMBO_FORMS } from "../../../shared/combo-model.js";
import { classLabel, laneLogos } from "../../domain/lanes.js";
import { comboFormLabel } from "./training-shared.js";
import { comboSteps, skillsById } from "../../domain/hero-combos.js";
import { dataUnavailable } from "../../lib/dom.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { profileStatsSection } from "../heroes/hero-stats.js";
import { t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";

// ---- the combos of the hero that is open: each one is validated in two forms ----------------------
export const acquired = (view, comboId, form) => Boolean(view.progress[comboId]?.[form]);

export const tally = (view, form) =>
  view.combos.filter(combo => view.acquired(combo.id, form)).length;

export const tallyText = (view, form) =>
  `${comboFormLabel(form)} · ${view.tally(form)} / ${view.combos.length}`;

export const share = (view, form) =>
  view.combos.length ? Math.round((view.tally(form) / view.combos.length) * 100) : 0;

export function meters(view) {
  if (!view.combos.length) {
    return "";
  }
  return `<div class="trn-meters">${COMBO_FORMS.map(
    form =>
      `<div class="trn-meter"><span class="pill pill--blue" data-tally="${form}">${esc(view.tallyText(form))}</span><span class="bar" aria-hidden="true"><i data-p="${view.share(form)}" data-meter="${form}"></i></span></div>`
  ).join("")}</div>`;
}

export function combosSection(view, sheet) {
  if (!view.combos.length) {
    return dataUnavailable(t("No combo has been written for this hero yet."));
  }
  const skills = skillsById(sheet);
  return `<ul class="combo-train-list">${view.combos
    .map(
      combo => `<li class="combo-train" data-combo="${esc(combo.id)}">
            <div class="combo-train__text"><b>${esc(tx(combo.name))}</b>${combo.note ? `<p class="muted">${esc(tx(combo.note))}</p>` : ""}</div>
            ${comboSteps(combo.steps, skills, { compact: true })}
            <div class="combo-forms" role="group" aria-label="${esc(t("Forms acquired: {name}", { name: tx(combo.name) }))}">${COMBO_FORMS.map(
              form =>
                `<button type="button" class="combo-form${view.acquired(combo.id, form) ? " on" : ""}" data-form="${form}" aria-pressed="${view.acquired(combo.id, form)}">${icon("check", "i--sm")}${esc(comboFormLabel(form))}</button>`
            ).join("")}</div>
          </li>`
    )
    .join("")}</ul>`;
}

/** Puts the buttons, the tallies and the bars in line with `progress`, without drawing the list again. */
export function showForms(view) {
  for (const row of view.root.querySelectorAll("[data-combo]")) {
    for (const button of row.querySelectorAll("[data-form]")) {
      const on = view.acquired(row.dataset.combo, button.dataset.form);
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    }
  }
  for (const pill of view.root.querySelectorAll("[data-tally]")) {
    pill.textContent = view.tallyText(pill.dataset.tally);
  }
  for (const bar of view.root.querySelectorAll("[data-meter]")) {
    bar.dataset.p = String(view.share(bar.dataset.meter));
    bar.style.setProperty("--p", bar.dataset.p);
  }
}

/** A form is acquired or not any more. Shown at once; put back if the server refuses. */
export async function toggleForm(view, button) {
  const comboId = button.closest("[data-combo]").dataset.combo;
  const form = button.dataset.form;
  const before = view.progress[comboId];
  view.progress[comboId] = {
    normal: false,
    animationCancel: false,
    ...before,
    [form]: !view.acquired(comboId, form)
  };
  view.showForms();
  try {
    view.progress[comboId] = await view.api(`/api/training/combos/${encodeURIComponent(comboId)}`, {
      method: "PUT",
      body: { [form]: view.progress[comboId][form] }
    });
  } catch (error) {
    view.progress[comboId] = before;
    view.tell(error.message);
  }
  view.showForms();
  view.refreshCards();
}

// ---- the workspace of the hero that is open ---------------------------------------------------------
export async function paintWorkspace(view) {
  const holder = view.root.querySelector("#focus-details");
  if (!holder) {
    return;
  }
  if (!view.opened) {
    holder.innerHTML = "";
    return;
  }
  holder.innerHTML = `<div class="loading-line"></div>`;
  const id = view.opened;
  const [sheet, catalog, saved] = await Promise.all([
    view.sheetOf(id),
    view.state.catalog
      ? Promise.resolve(view.state.catalog)
      : view.api("/api/catalog").catch(() => null),
    view.api(`/api/training/combos?heroId=${encodeURIComponent(id)}`).catch(() => null)
  ]);
  if (view.opened !== id || !holder.isConnected) {
    return;
  }
  if (catalog) {
    view.state.catalog = catalog;
  }
  if (!sheet) {
    holder.innerHTML = dataUnavailable(t("This hero sheet could not be loaded."));
    return;
  }
  view.combos = sheet.combos ?? [];
  view.progress = saved?.progress ?? {};
  const skills = view.skillsOf(sheet);
  const flat = segments => (Array.isArray(segments) ? segments.map(part => part.t).join("") : "");
  const hero = view.heroOf(id);
  const roles = (hero?.roles ?? []).map(classLabel).join(" / ") || t("Global");
  const link = encodeURIComponent(id);
  holder.innerHTML = `<section class="trn-hero card">
        <header class="trn-hero__head">
          <span class="trn-hero__face">${view.portrait(id, 96)}</span>
          <div class="trn-hero__id"><h2>${esc(view.heroName(id))}</h2><div class="hstack wrap"><span class="pill pill--blue">${esc(roles)}</span>${laneLogos(hero?.lanes ?? [], 24)}</div></div>
          <div class="hstack wrap trn-hero__links train-links">
            <a class="btn btn--sm" href="/heroes/${link}">${icon("book", "i--sm")}${t("Full hero sheet")}</a>
            <a class="btn btn--sm" href="/build-lab?hero=${link}">${icon("layers", "i--sm")}${t("Build lab")}</a>
            <a class="btn btn--sm" href="/training/notebook?hero=${link}">${icon("pencil", "i--sm")}${t("Notes on this hero")}</a>
            ${view.focus.includes(id) ? "" : `<button type="button" class="btn btn--primary btn--sm" data-add-hero="${esc(id)}">${icon("plus", "i--sm")}${t("Add to my heroes")}</button>`}
          </div>
        </header>
        ${view.meters()}
        <div class="trn-hero__body">
          <h3 class="subheading">${t("Skills")}</h3>
          ${
            skills.length
              ? `<div class="trn-skills">${skills
                  .map(
                    skill =>
                      `<div class="skill-row">${view.skillIcon(skill, 52)}<span class="skill-row__body"><b>${esc(skill.name)}</b><small>${esc(skill.label ?? "")}${skill.cooldownSeconds ? ` · ${t("Cooldown {seconds}s", { seconds: skill.cooldownSeconds })}` : ""}${skill.cost ? ` · ${t("Cost {cost}", { cost: skill.cost })}` : ""}</small><p>${esc(flat(skill.description))}</p></span></div>`
                  )
                  .join("")}</div>`
              : dataUnavailable(t("The skills of this hero have not been fetched yet."))
          }
          <h3 class="subheading">${t("Combos")}</h3>
          ${view.combosSection(sheet)}
          <h3 class="subheading">${t("Base stats")}</h3>
          ${profileStatsSection(sheet, { escapeHtml: esc, dataUnavailable, catalog: view.state.catalog, isAdmin: false })}
        </div>
      </section>`;
}

/** Opens a hero in the workspace: its card, its sheet, and the cover of the stage. */
export function open(view, id, { scroll = false } = {}) {
  view.opened = id;
  view.paintMine();
  view.paintWorkspace();
  view.kit.refreshChrome(view.heroOf(id));
  if (scroll) {
    view.root.querySelector("#focus-details")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  acquired,
  tally,
  tallyText,
  share,
  meters,
  combosSection,
  showForms,
  toggleForm,
  paintWorkspace,
  open
};
