// conditions editor, form fields: select, matchSelect, isSelect, fields, and 5 more.
import { MAX_CONDITIONS, MAX_DEPTH, conditionsOf } from "../../../shared/condition-model.js";
import { MAX_LEVEL, isChoice } from "../../../shared/stat-values.js";
import { PICK_LANES } from "../../../shared/draft-model.js";
import { classLabel, laneName } from "../../domain/lanes.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { KINDS } from "./conditions-editor-shared.js";
import { heroName } from "./conditions-editor-parts.js";
import { boxFilter, comboField } from "./catalog-search.js";

// ---- the form fields -----------------------------------------------------------------------------

export const select = (view, name, options, selected, { repaint = false, label }) =>
  `<label class="field"><select name="${name}"${repaint ? " data-repaint" : ""} aria-label="${view.esc(label)}">${options
    .map(
      ([value, text]) =>
        `<option value="${view.esc(String(value))}"${String(value) === String(selected) ? " selected" : ""}>${view.esc(text)}</option>`
    )
    .join("")}</select></label>`;

export const matchSelect = (view, name, match) =>
  view.select(
    name,
    [
      ["all", t("All of these hold")],
      ["any", t("At least one of these holds")]
    ],
    match,
    { label: t("How many of the conditions must hold") }
  );

export const isSelect = (view, name, negate) =>
  view.select(
    name,
    [
      ["", t("is")],
      ["1", t("is not")]
    ],
    negate ? "1" : "",
    { label: t("Must it be, or not be") }
  );

/** What a kind of condition asks for besides its kind: the stat and its options, a tag, a class… */
export function fields(view, node, name) {
  const catalog = view.getCatalog();
  switch (node.kind) {
    case "stat": {
      const stat = view.statOf(node.statId);
      const which = comboField({
        name: `${name}-stat`,
        options: catalog.stats.map(entry => [entry.id, entry.name]),
        selected: node.statId,
        label: t("Search a stat"),
        repaint: true
      });
      if (isChoice(stat)) {
        const boxes = stat.options
          .map(
            option =>
              `<label class="tag-box"><input type="checkbox" name="${name}-options" value="${option.id}"${(node.options ?? []).includes(option.id) ? " checked" : ""}> ${view.esc(option.name)}</label>`
          )
          .join("");
        return `${which}${view.isSelect(`${name}-negate`, node.negate)}<span class="when-options">${boxes}</span>`;
      }
      return `${which}${view.select(`${name}-op`, SIGNS, node.op, {
        label: t("Comparison")
      })}<label class="field when-number"><input type="number" step="any" name="${name}-value" value="${view.esc(String(node.value ?? ""))}" aria-label="${t("Value")}"></label>`;
    }
    case "tag":
      return `${view.isSelect(`${name}-negate`, node.negate)}${comboField({
        name: `${name}-tag`,
        options: catalog.tags.map(tag => [tag.id, tag.name]),
        selected: node.tagId ?? catalog.tags[0]?.id,
        label: t("Search a tag")
      })}`;
    case "role":
      return `${view.isSelect(`${name}-negate`, node.negate)}${view.select(
        `${name}-role`,
        view.roles().map(role => [role, classLabel(role)]),
        node.role,
        { label: t("Class") }
      )}`;
    case "lane":
      return `${view.isSelect(`${name}-negate`, node.negate)}${view.select(
        `${name}-lane`,
        PICK_LANES.map(lane => [lane, laneName(lane)]),
        node.lane,
        { label: t("Lane") }
      )}`;
    case "hero": {
      // the ticked heroes first, then the others by name; a search hides the names that do not match
      const chosen = new Set(node.heroIds ?? []);
      const boxes = [...view.getHeroes()]
        .sort(
          (a, b) =>
            Number(chosen.has(b.id)) - Number(chosen.has(a.id)) ||
            heroName(a).localeCompare(heroName(b))
        )
        .map(
          hero =>
            `<label class="tag-box"><input type="checkbox" name="${name}-heroes" value="${view.esc(hero.id)}"${chosen.has(hero.id) ? " checked" : ""}> ${view.esc(heroName(hero))}</label>`
        )
        .join("");
      return `${view.isSelect(`${name}-negate`, node.negate)}<div class="when-heroes">${boxFilter(t("Search a hero"), `<div class="tag-boxes">${boxes}</div>`, chosen.size)}</div>`;
    }
    default:
      // the level of the hero in the build
      return `${view.select(`${name}-op`, SIGNS, node.op, { label: t("Comparison") })}<label class="field when-number"><input type="number" min="1" max="${MAX_LEVEL}" step="1" name="${name}-value" value="${view.esc(String(node.value ?? ""))}" aria-label="${t("Level")}"></label>`;
  }
}

export const removeButton = (owner, path) =>
  `<button type="button" class="btn btn--ghost btn--icon btn--sm" data-w-remove="${owner}" data-w-path="${path.join(".")}" aria-label="${t("Remove this condition")}">${icon("x", "i--sm")}</button>`;

export const kinds = (view, depth) =>
  KINDS.filter(kind => (kind === "group" ? depth < MAX_DEPTH : view.blank(kind))).map(kind => [
    kind,
    kindLabel(kind)
  ]);

export function node(view, owner, item, path, depth) {
  const name = `w-${owner}-${path.join("-")}`;
  const head = `<label class="field when-kind"><select name="${name}-kind" data-repaint aria-label="${t("Kind of condition")}">${view
    .kinds(depth)
    .map(
      ([value, text]) =>
        `<option value="${value}"${value === item.kind ? " selected" : ""}>${view.esc(text)}</option>`
    )
    .join("")}</select></label>`;
  if (item.kind === "group") {
    return `<div class="when-group">
        <div class="when-atom">${head}${view.matchSelect(`${name}-match`, item.match)}<label class="when-not"><input type="checkbox" name="${name}-negate" value="1"${item.negate ? " checked" : ""}> ${t("Not")}</label>${removeButton(owner, path)}</div>
        ${view.set(owner, item, path, depth + 1)}
      </div>`;
  }
  return `<div class="when-atom">${head}${view.fields(item, name)}${removeButton(owner, path)}</div>`;
}

/** The conditions of a set, and the buttons that add one or a group (the room left is counted). */
export function set(view, owner, group, path, depth) {
  const room = MAX_CONDITIONS - conditionsOf(group).length;
  return `<ul class="when-list">${group.of
    .map((item, index) => `<li>${view.node(owner, item, [...path, index], depth)}</li>`)
    .join(
      ""
    )}</ul><div class="hstack wrap when-add"><button type="button" class="btn btn--sm" data-w-add="${owner}" data-w-path="${path.join(".")}"${room > 0 ? "" : " disabled"}>${icon("plus", "i--sm")}${t("Add a condition")}</button>${
    depth < MAX_DEPTH
      ? `<button type="button" class="btn btn--sm" data-w-group="${owner}" data-w-path="${path.join(".")}"${room > 0 ? "" : " disabled"}>${icon("plus", "i--sm")}${t("Add a group")}</button>`
      : ""
  }</div>`;
}

/**
 * The conditions of one entry (a stat line or an effect). `owner` names it in the form, like
 * "stat-2": its fields are w-stat-2-…
 */
export function markup(view, owner, when) {
  if (!when) {
    return `<div class="when" data-when="${owner}"><p class="muted">${t("It counts for every hero.")}</p><button type="button" class="btn btn--sm" data-w-add="${owner}" data-w-path="">${icon("plus", "i--sm")}${t("Only for some heroes")}</button></div>`;
  }
  return `<div class="when" data-when="${owner}">
      <div class="when-head"><b>${t("Applies when")}</b>${view.matchSelect(`w-${owner}-match`, when.match)}</div>
      ${view.set(owner, when, [], 1)}
    </div>`;
}

const kindLabel = kind =>
  ({
    stat: t("Stat of the hero"),
    tag: t("Tag of the hero"),
    role: t("Class of the hero"),
    lane: t("Lane of the hero"),
    hero: t("The hero"),
    level: t("Level of the hero"),
    group: t("Group of conditions")
  })[kind];

const SIGNS = [
  [">=", "≥"],
  ["<=", "≤"],
  [">", ">"],
  ["<", "<"],
  ["=", "="],
  ["!=", "≠"]
];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { select, matchSelect, isSelect, fields, kinds, node, set, markup };
