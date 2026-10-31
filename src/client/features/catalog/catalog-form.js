// The form of an entry (item, arcana, spell, stat, tag): its rows.
import { ARCANA_COLORS, ITEM_CATEGORIES } from "../../../shared/build-model.js";
import { OPTIONS_MAX, STAT_UNITS, isChoice } from "../../../shared/stat-values.js";
import { SHOP_CATEGORIES, shopCategoryLabel } from "../../domain/catalog-display.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { categoryLabel, colorLabel, unitLabel } from "./catalog-shared.js";
import { chip, field, group, picture } from "./catalog-parts.js";
import { boxFilter, comboField } from "./catalog-search.js";

/** The most stat lines of one passive or active (the server says the same: EFFECT_STATS_MAX). */
const EFFECT_STATS_MAX = 8;

// ---- editors shared by items and arcana -------------------------------------------------------

/** A line of an item or of an arcana as the form holds it: a stat and its value, or its option. */
export const blankLine = statId => ({
  statId,
  value: null,
  option: null,
  temporary: false,
  durationSeconds: null,
  note: "",
  when: null,
  open: false
});

/** One line: the stat, its value (or its option), and what makes it temporary or conditional. */
export const statLine = (view, row, index, prefix = "stat") => {
  const key = `${prefix}-${index}`; // stat-2 for the item, effect-0-stat-1 for a passive or an active
  const stat = view.statOf(row.statId);
  const value = isChoice(stat)
    ? `<label class="field"><select name="${key}-option" aria-label="${t("Option")}">${stat.options.map(option => `<option value="${option.id}"${option.id === (row.option ?? stat.options[0]?.id) ? " selected" : ""}>${esc(option.name)}</option>`).join("")}</select></label>`
    : `<label class="field"><input name="${key}-value" type="number" step="${stat?.unit === "whole" ? 1 : "any"}" value="${row.value ?? ""}" aria-label="${t("Value")}" required></label>`;
  const marks = [row.temporary ? t("Temporary") : "", view.when.summary(row.when)]
    .filter(Boolean)
    .join(" · ");
  return `<div class="stat-line" data-stat-line="${key}">
      <div class="stat-row">${comboField({ name: `${key}-id`, options: view.catalog.stats.map(entry => [entry.id, `${entry.name}${entry.unit === "percent" ? " (%)" : ""}`]), selected: row.statId, label: t("Search a stat"), repaint: true })}${value}<button type="button" class="btn btn--ghost btn--icon btn--sm" data-remove-stat="${key}" aria-label="${t("Remove this stat")}">${icon("x", "i--sm")}</button></div>
      <details class="stat-extra" data-extra="${key}"${row.open || row.temporary || row.when || row.note ? " open" : ""}>
        <summary>${t("Temporary and conditions")}${marks ? ` <span class="stat-extra__marks">${esc(marks)}</span>` : ""}</summary>
        <div class="stat-extra__body">
          <div class="hstack wrap">
            <label class="chip-check"><input type="checkbox" name="${key}-temporary" value="1"${row.temporary ? " checked" : ""}><span>${t("Temporary")}</span></label>
            <label class="field stat-duration"><input name="${key}-duration" type="number" min="0.1" max="3600" step="any" value="${row.durationSeconds ?? ""}" placeholder="${t("Lasts (s)")}" aria-label="${t("Lasts (s)")}"${row.temporary ? "" : " disabled"}></label>
            <label class="field stat-note"><input name="${key}-note" maxlength="200" value="${esc(row.note ?? "")}" placeholder="${t("When or how (optional)")}" aria-label="${t("When or how (optional)")}"></label>
          </div>
          ${view.when.markup(`${key}`, row.when)}
        </div>
      </details>
    </div>`;
};

/** The lines of an item or an arcana (prefix "stat"), or of one of its passives and actives. */
export const statRows = (
  view,
  rows,
  max,
  prefix = "stat"
) => `<div class="stat-rows" data-stat-rows="${prefix}">${rows.map((row, index) => view.statLine(row, index, prefix)).join("")}
      ${rows.length < max ? `<button type="button" class="btn btn--sm" data-add-stat="${prefix}" ${view.catalog.stats.length ? "" : "disabled"}>${icon("plus", "i--sm")}${t("Add a stat")}</button>` : ""}
      ${view.catalog.stats.length ? "" : `<p class="muted">${t("Enter the stats of the game first (Stats tab).")}</p>`}</div>`;

/** The options of a choice stat: a name each (its id, once it has one, travels with it). */
export const optionRows = options => `<div class="option-rows">${options
  .map(
    (option, index) =>
      `<div class="option-row"><input type="hidden" name="option-${index}-id" value="${option.id ?? ""}"><label class="field"><input name="option-${index}-name" maxlength="40" value="${esc(option.name)}" placeholder="${t("Name of the option")}" aria-label="${t("Option")} ${index + 1}" required></label><button type="button" class="btn btn--ghost btn--icon btn--sm" data-remove-option="${index}" aria-label="${t("Remove this option")}">${icon("x", "i--sm")}</button></div>`
  )
  .join("")}
      ${options.length < OPTIONS_MAX ? `<button type="button" class="btn btn--sm" data-add-option>${icon("plus", "i--sm")}${t("Add an option")}</button>` : ""}</div>`;

/** The tags as boxes to tick, the ticked ones first, with a search over their names. */
export const tagBoxes = (view, selected, name) =>
  view.catalog.tags.length
    ? boxFilter(
        t("Search a tag"),
        `<div class="tag-boxes">${[...view.catalog.tags]
          .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
          .map(
            tag =>
              `<label class="tag-box"><input type="checkbox" name="${name}" value="${tag.id}"${selected.includes(tag.id) ? " checked" : ""}> ${chip(tag)}</label>`
          )
          .join("")}</div>`,
        view.catalog.tags.filter(tag => selected.includes(tag.id)).length
      )
    : `<p class="muted">${t("No tag yet (Tags tab).")}</p>`;

/** The picture of an entry, big, with what to do with it: the preview at the head of the panel. */
export const imageField = draft =>
  `<div class="ct-preview image-field" data-dropzone>${picture(draft.imageId, "catalog-picture catalog-picture-big", 96)}
      <div class="ct-preview__main"><strong id="ct-live-name">${esc(draft.name || t("New"))}</strong>
        <div class="hstack wrap"><button type="button" class="btn btn--sm" data-pick-image>${icon("upload", "i--sm")}${t("Choose a picture")}</button>${draft.imageId ? `<button type="button" class="btn btn--ghost btn--sm" data-clear-image>${t("Remove")}</button>` : ""}</div>
        <input type="file" id="catalog-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><small class="ws-hint">${t("PNG, JPEG, WebP or GIF, 3 MB maximum. It is kept up to 256 px; transparency is kept.")}</small></div></div>`;

export const effectRows = (view, effects) => `<div class="effect-rows">${effects
  .map(
    (
      effect,
      index
    ) => `<fieldset class="effect-row"><legend>${effect.kind === "active" ? t("Active") : t("Passive")} ${index + 1}</legend>
      <div class="effect-head"><label class="field"><select name="effect-${index}-kind" data-repaint aria-label="${t("Kind")}"><option value="passive"${effect.kind === "passive" ? " selected" : ""}>${t("Passive")}</option><option value="active"${effect.kind === "active" ? " selected" : ""}>${t("Active")}</option></select></label>
        <label class="field effect-name"><input name="effect-${index}-name" maxlength="60" placeholder="${t("Name")}" value="${esc(effect.name)}" aria-label="${t("Name")}"></label>
        ${effect.kind === "active" ? `<label class="field effect-cooldown"><input name="effect-${index}-cooldown" type="number" min="0" step="any" placeholder="${t("Cooldown (s)")}" value="${effect.cooldownSeconds ?? ""}" aria-label="${t("Cooldown (s)")}"></label>` : ""}
        <button type="button" class="btn btn--ghost btn--icon btn--sm" data-remove-effect="${index}" aria-label="${t("Remove this effect")}">${icon("x", "i--sm")}</button></div>
      <label class="field field--area"><textarea name="effect-${index}-text" rows="2" maxlength="600" placeholder="${t("What it does")}" aria-label="${t("What it does")}" required>${esc(effect.text)}</textarea></label>
      <details class="stat-extra" data-effect-extra="${index}"${effect.open || effect.when ? " open" : ""}>
        <summary>${t("Only for some heroes")}${effect.when ? ` <span class="stat-extra__marks">${esc(view.when.summary(effect.when))}</span>` : ""}</summary>
        <div class="stat-extra__body">${view.when.markup(`effect-${index}`, effect.when)}</div>
      </details>
      <div class="effect-stats"><b>${t("Stats it gives")}</b>${view.statRows(effect.stats ?? [], EFFECT_STATS_MAX, `effect-${index}-stat`)}</div></fieldset>`
  )
  .join("")}
      ${effects.length < 12 ? `<button type="button" class="btn btn--sm" data-add-effect>${icon("plus", "i--sm")}${t("Add a passive or an active")}</button>` : ""}</div>`;

export const formFor = (view, draft) => {
  const name = field(
    t("Name"),
    `<input name="name" maxlength="${view.tab === "tags" ? 40 : view.tab === "stats" ? 60 : 80}" required value="${esc(draft.name)}" autocomplete="off">`
  );
  if (view.tab === "stats") {
    return `${name}${field(t("Shown as"), `<select name="unit" data-repaint>${STAT_UNITS.map(unit => `<option value="${unit}"${draft.unit === unit ? " selected" : ""}>${unitLabel(unit)}</option>`).join("")}</select>`)}
      ${field(t("Position in the lists"), `<input name="sortOrder" type="number" min="0" step="1" value="${draft.sortOrder}">`)}
      ${draft.unit === "choice" ? group(t("Options of the choice (what a hero or an item can take)"), optionRows(draft.options)) : ""}`;
  }
  if (view.tab === "tags") {
    return `<p class="ct-tag-sample" aria-hidden="true">${chip({ ...draft, name: draft.name || t("New") })}</p>${name}${field(t("Colour"), `<select name="color">${TAG_COLORS.map(color => `<option value="${color}"${draft.color === color ? " selected" : ""}>${color}</option>`).join("")}</select>`)}
      ${field(t("What it means (optional)"), `<input name="description" maxlength="200" value="${esc(draft.description)}">`)}`;
  }
  if (view.tab === "items") {
    return `${imageField(draft)}${name}
      ${field(t("Goes in"), `<select name="category">${ITEM_CATEGORIES.map(category => `<option value="${category}"${draft.category === category ? " selected" : ""}>${categoryLabel(category)}</option>`).join("")}</select>`)}
      ${field(t("Category"), `<select name="shopCategory"><option value="">${t("No category yet")}</option>${SHOP_CATEGORIES.map(category => `<option value="${category}"${draft.shopCategory === category ? " selected" : ""}>${shopCategoryLabel(category)}</option>`).join("")}</select>`)}
      ${field(t("Price (optional)"), `<input name="price" type="number" min="0" step="1" value="${draft.price ?? ""}">`)}
      ${field(t("Description (optional)"), `<textarea name="description" rows="2" maxlength="600">${esc(draft.description)}</textarea>`, { area: true })}
      <h3>${t("Stats it gives")}</h3>${view.statRows(draft.stats, 20)}
      <h3>${t("Passives and actives")}</h3>${view.effectRows(draft.effects)}
      <h3>${t("Tags")}</h3>${view.tagBoxes(draft.tags, "tags")}`;
  }
  if (view.tab === "spells") {
    return `${imageField(draft)}${name}
      ${field(t("Cooldown (s)"), `<input name="cooldownSeconds" type="number" min="0" max="3600" step="1" value="${draft.cooldownSeconds ?? ""}">`)}
      ${field(t("Unlocked at level"), `<input name="unlockLevel" type="number" min="1" max="15" step="1" value="${draft.unlockLevel ?? ""}">`)}
      ${field(t("Description (optional)"), `<textarea name="description" rows="3" maxlength="600">${esc(draft.description)}</textarea>`, { area: true })}`;
  }
  return `${imageField(draft)}${name}
      ${field(t("Colour"), `<select name="color">${ARCANA_COLORS.map(color => `<option value="${color}"${draft.color === color ? " selected" : ""}>${colorLabel(color)}</option>`).join("")}</select>`)}
      ${field(t("Description (optional)"), `<input name="description" maxlength="300" value="${esc(draft.description)}">`)}
      <h3>${t("Stats it gives (up to 4, for one arcana)")}</h3>${view.statRows(draft.stats, 4)}
      <h3>${t("Tags")}</h3>${view.tagBoxes(draft.tags, "tags")}`;
};

const TAG_COLORS = ["gray", "red", "orange", "gold", "green", "cyan", "blue", "violet", "pink"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { statLine, statRows, tagBoxes, effectRows, formFor };
