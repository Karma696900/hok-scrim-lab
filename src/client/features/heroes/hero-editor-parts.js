// hero editor, small helpers: newSkill, newPart, toDraft, keyOptions, and 11 more.
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { isChoice } from "../../../shared/stat-values.js";
import { t } from "../../app/browser-i18n.js";

export const newSkill = key => ({
  key,
  name: "",
  cooldown: "",
  cost: "",
  costLabel: "",
  range: "",
  castTime: "",
  notes: "",
  components: []
});

export const newPart = () => ({
  label: "",
  kind: "damage",
  unit: "flat",
  values: "",
  text: "",
  scaling: []
});

export const toDraft = profile => ({
  tags: [...profile.tags],
  baseStats: profile.baseStats.map(entry => ({
    statId: entry.statId,
    value: entry.value ?? "",
    growth: entry.growth || "",
    option: entry.option ?? null
  })),
  skills: profile.skills.map(skill => ({
    ...skill,
    cooldown: listText(skill.cooldown),
    cost: listText(skill.cost),
    range: skill.range ?? "",
    castTime: skill.castTime ?? "",
    components: skill.components.map(part => ({ ...part, values: listText(part.values) }))
  }))
});

export const keyOptions = (view, selected) => {
  const options = view.campSkills.map(skill => ({
    key: skill.type === "skill" ? String(skill.index) : skill.type,
    label: skill.name
  }));
  for (const key of ["passive", "1", "2", "3", "4", "ultimate"]) {
    if (!options.some(option => option.key === key)) {
      options.push({ key, label: "" });
    }
  }
  if (selected && !options.some(option => option.key === selected)) {
    options.push({ key: selected, label: "" });
  }
  return options
    .map(
      option =>
        `<option value="${escapeHtml(option.key)}"${option.key === selected ? " selected" : ""}>${escapeHtml(option.key)}${option.label ? ` — ${escapeHtml(option.label)}` : ""}</option>`
    )
    .join("");
};

export const statOptions = (view, selected) =>
  view.catalog.stats
    .map(
      stat =>
        `<option value="${stat.id}"${stat.id === selected ? " selected" : ""}>${escapeHtml(stat.name)}${stat.unit === "percent" ? " (%)" : ""}</option>`
    )
    .join("");

export const statOf = (view, id) => view.catalog.stats.find(stat => stat.id === id);

/** The value cells of a base stat: its value and growth, or the option it takes when it is a choice. */
export const baseCells = (view, row, index) => {
  const stat = view.statOf(row.statId);
  if (isChoice(stat)) {
    const chosen = row.option ?? stat.options[0]?.id;
    return `<label class="field base-option"><select name="base-${index}-option" aria-label="${t("Option")}">${stat.options.map(option => `<option value="${option.id}"${option.id === chosen ? " selected" : ""}>${escapeHtml(option.name)}</option>`).join("")}</select></label>`;
  }
  return `<label class="field"><input type="number" step="any" name="base-${index}-value" value="${row.value}" aria-label="${t("Level 1")}" required></label><label class="field"><input type="number" step="any" name="base-${index}-growth" value="${row.growth}" placeholder="${t("per level")}" aria-label="${t("Growth per level")}"></label>`;
};

/** A labelled control of the form. */
export const field = (label, control, { area = false } = {}) =>
  `<label class="label">${label}<span class="field${area ? " field--area" : ""}">${control}</span></label>`;

export const removeButton = (attribute, label) =>
  `<button type="button" class="btn btn--ghost btn--icon btn--sm" ${attribute} aria-label="${label}">${icon("x", "i--sm")}</button>`;

export const partMarkup = (view, part, index, at) => `<div class="part-card">
      <div class="form-grid form-grid--three">
        ${field(t("Effect"), `<input name="part-${index}-${at}-label" maxlength="60" value="${escapeHtml(part.label)}" placeholder="${t("Damage")}">`)}
        ${field(t("Kind"), `<select name="part-${index}-${at}-kind">${KINDS.map(kind => `<option value="${kind}"${part.kind === kind ? " selected" : ""}>${kindLabel(kind)}</option>`).join("")}</select>`)}
        ${field(t("Shown as"), `<select name="part-${index}-${at}-unit"><option value="flat"${part.unit === "flat" ? " selected" : ""}>${t("Flat number")}</option><option value="percent"${part.unit === "percent" ? " selected" : ""}>${t("Percent (%)")}</option></select>`)}
      </div>
      ${field(t("Values by level, separated by commas"), `<input name="part-${index}-${at}-values" value="${escapeHtml(part.values)}">`)}
      ${part.scaling.map((scale, n) => `<div class="stat-row"><label class="field"><select name="scale-${index}-${at}-${n}-id" aria-label="${t("Stat")}">${view.statOptions(scale.statId)}</select></label><label class="field"><input type="number" step="any" min="0" name="scale-${index}-${at}-${n}-percent" value="${scale.percent}" aria-label="${t("Percent (%)")}"></label>${removeButton(`data-remove-scale="${index}:${at}:${n}"`, t("Remove"))}</div>`).join("")}
      ${field(t("Details (optional)"), `<input name="part-${index}-${at}-text" maxlength="300" value="${escapeHtml(part.text)}">`)}
      <div class="hstack wrap">${part.scaling.length < 4 ? `<button type="button" class="btn btn--sm" data-add-scale="${index}:${at}">${icon("plus", "i--sm")}${t("Add a scaling")}</button>` : ""}<button type="button" class="btn btn--ghost btn--sm" data-remove-part="${index}:${at}">${t("Remove this effect")}</button></div>
    </div>`;

export const skillMarkup = (
  view,
  skill,
  index
) => `<fieldset class="spell-card"><legend>${t("Spell")} ${escapeHtml(skill.key)}</legend>
    <div class="form-grid">
      ${field(t("Spell"), `<select name="skill-${index}-key">${view.keyOptions(skill.key)}</select>`)}
      ${field(t("Name (optional)"), `<input name="skill-${index}-name" maxlength="80" value="${escapeHtml(skill.name)}">`)}
      ${field(t("Cooldown by level (s), separated by commas"), `<input name="skill-${index}-cooldown" value="${escapeHtml(skill.cooldown)}" placeholder="8, 7.5, 7, 6.5, 6, 5.5">`)}
      ${field(t("Cost by level, separated by commas"), `<input name="skill-${index}-cost" value="${escapeHtml(skill.cost)}">`)}
    </div>
    <div class="form-grid form-grid--three">
      ${field(t("What the cost is paid in"), `<input name="skill-${index}-costLabel" maxlength="30" value="${escapeHtml(skill.costLabel)}" placeholder="${t("Mana")}">`)}
      ${field(t("Range"), `<input name="skill-${index}-range" type="number" min="0" step="any" value="${skill.range}">`)}
      ${field(t("Cast time (s)"), `<input name="skill-${index}-castTime" type="number" min="0" step="any" value="${skill.castTime}">`)}
    </div>
    ${skill.components.map((part, at) => view.partMarkup(part, index, at)).join("")}
    ${field(t("Notes (optional)"), `<textarea name="skill-${index}-notes" rows="2" maxlength="800">${escapeHtml(skill.notes)}</textarea>`, { area: true })}
    <div class="hstack wrap">${skill.components.length < 12 ? `<button type="button" class="btn btn--sm" data-add-part="${index}">${icon("plus", "i--sm")}${t("Add an effect")}</button>` : ""}<button type="button" class="btn btn--danger btn--sm" data-remove-skill="${index}">${icon("trash", "i--sm")}${t("Remove this spell")}</button></div></fieldset>`;

export function paint(view) {
  const name = escapeHtml(view.hero.displayName || view.hero.name);
  view.dialog.innerHTML = `<form class="hero-editor" novalidate>
      <div class="dialog__head"><div><h2 id="hero-editor-title">${t("Hero data: {name}", { name })}</h2></div><button type="button" class="btn btn--ghost btn--icon btn--sm" data-close aria-label="${t("Close")}">${icon("x", "i--sm")}</button></div>
      <section class="editor-section"><h3>${t("Tags")}</h3>${view.catalog.tags.length ? `<div class="tag-boxes">${view.catalog.tags.map(tag => `<label class="tag-box"><input type="checkbox" name="tags" value="${tag.id}"${view.draft.tags.includes(tag.id) ? " checked" : ""}> <span class="tag-chip tag-${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span></label>`).join("")}</div>` : `<p class="muted">${t("No tag yet (Tags tab).")}</p>`}</section>
      <section class="editor-section"><h3>${t("Base stats")}</h3><p class="muted">${t("Value at level 1, and how much it grows at each level.")}</p>
        <div class="stat-rows">${view.draft.baseStats.map((row, index) => `<div class="stat-row stat-row-growth${isChoice(view.statOf(row.statId)) ? " stat-row-choice" : ""}"><label class="field"><select name="base-${index}-id" data-repaint aria-label="${t("Stat")}">${view.statOptions(row.statId)}</select></label>${view.baseCells(row, index)}${removeButton(`data-remove-base="${index}"`, t("Remove"))}</div>`).join("")}
        <button type="button" class="btn btn--sm" data-add-base ${view.catalog.stats.length ? "" : "disabled"}>${icon("plus", "i--sm")}${t("Add a stat")}</button></div></section>
      <section class="editor-section"><h3>${t("Spells")}</h3>${view.draft.skills.map(view.skillMarkup).join("")}<button type="button" class="btn btn--sm" data-add-skill>${icon("plus", "i--sm")}${t("Add a spell")}</button></section>
      <p class="form-error" role="alert">${escapeHtml(view.error)}</p>
      <div class="dialog__foot"><button type="button" class="btn btn--ghost" data-close>${t("Close")}</button><button type="submit" class="btn btn--primary">${icon("check")}${t("Save")}</button></div></form>`;
}

/**
 * What was typed, back into the draft (so adding a row never loses it). Returns false and sets
 * `error` when a number list is wrong.
 */
export function read(view) {
  const form = view.dialog.querySelector("form");
  const data = new FormData(form);
  const next = { tags: data.getAll("tags").map(Number), baseStats: [], skills: [] };
  for (let index = 0; data.has(`base-${index}-id`); index += 1) {
    next.baseStats.push({
      statId: Number(data.get(`base-${index}-id`)),
      value: data.get(`base-${index}-value`) ?? "",
      growth: data.get(`base-${index}-growth`) ?? "",
      option: data.has(`base-${index}-option`) ? Number(data.get(`base-${index}-option`)) : null
    });
  }
  for (let index = 0; data.has(`skill-${index}-key`); index += 1) {
    const skill = {
      key: String(data.get(`skill-${index}-key`)),
      name: String(data.get(`skill-${index}-name`) ?? ""),
      cooldown: String(data.get(`skill-${index}-cooldown`) ?? ""),
      cost: String(data.get(`skill-${index}-cost`) ?? ""),
      costLabel: String(data.get(`skill-${index}-costLabel`) ?? ""),
      range: data.get(`skill-${index}-range`) ?? "",
      castTime: data.get(`skill-${index}-castTime`) ?? "",
      notes: String(data.get(`skill-${index}-notes`) ?? ""),
      components: []
    };
    for (let at = 0; data.has(`part-${index}-${at}-label`); at += 1) {
      const scaling = [];
      for (let n = 0; data.has(`scale-${index}-${at}-${n}-id`); n += 1) {
        scaling.push({
          statId: Number(data.get(`scale-${index}-${at}-${n}-id`)),
          percent: data.get(`scale-${index}-${at}-${n}-percent`)
        });
      }
      skill.components.push({
        label: String(data.get(`part-${index}-${at}-label`)),
        kind: String(data.get(`part-${index}-${at}-kind`)),
        unit: String(data.get(`part-${index}-${at}-unit`)),
        values: String(data.get(`part-${index}-${at}-values`) ?? ""),
        text: String(data.get(`part-${index}-${at}-text`) ?? ""),
        scaling
      });
    }
    next.skills.push(skill);
  }
  view.draft = next;
}

/** The API body of the draft, or throws a readable error. */
export function body(view) {
  const list = (text, label) => {
    const parsed = parseList(text);
    if (!parsed) {
      throw new Error(t("{label}: write numbers separated by commas.", { label }));
    }
    return parsed;
  };
  return {
    tags: view.draft.tags,
    baseStats: view.draft.baseStats
      .filter(row => (isChoice(view.statOf(row.statId)) ? row.option !== null : row.value !== ""))
      .map(row =>
        isChoice(view.statOf(row.statId))
          ? { statId: row.statId, option: row.option }
          : {
              statId: row.statId,
              value: Number(row.value),
              growth: optionalNumber(row.growth) ?? 0
            }
      ),
    skills: view.draft.skills.map(skill => ({
      key: skill.key,
      name: skill.name,
      cooldown: list(skill.cooldown, t("Cooldown")),
      cost: list(skill.cost, t("Cost")),
      costLabel: skill.costLabel,
      range: optionalNumber(skill.range),
      castTime: optionalNumber(skill.castTime),
      notes: skill.notes,
      components: skill.components.map(part => ({
        label: part.label,
        kind: part.kind,
        unit: part.unit,
        values: list(part.values, part.label || t("Effect")),
        text: part.text,
        scaling: part.scaling
          .filter(scale => scale.percent !== "")
          .map(scale => ({ statId: scale.statId, percent: Number(scale.percent) }))
      }))
    }))
  };
}

export function build(view) {
  view.dialog = document.createElement("dialog");
  view.dialog.className = "dialog dialog--wide hero-editor-dialog";
  view.dialog.setAttribute("aria-labelledby", "hero-editor-title");
  document.body.append(view.dialog);
  view.dialog.addEventListener("click", event => {
    const target = event.target.closest("button");
    if (event.target === view.dialog) {
      return view.dialog.close();
    }
    if (!target) {
      return;
    }
    if (target.matches("[data-close]")) {
      return view.dialog.close();
    }
    view.read();
    const pair = value => value.split(":").map(Number);
    if (target.matches("[data-add-base]")) {
      view.draft.baseStats.push({
        statId:
          view.catalog.stats.find(stat => !view.draft.baseStats.some(row => row.statId === stat.id))
            ?.id ?? view.catalog.stats[0].id,
        value: "",
        growth: "",
        option: null
      });
    } else if (target.dataset.removeBase !== undefined) {
      view.draft.baseStats.splice(Number(target.dataset.removeBase), 1);
    } else if (target.matches("[data-add-skill]")) {
      view.draft.skills.push(newSkill(view.keyOptions("").match(/value="([^"]+)"/)[1]));
    } else if (target.dataset.removeSkill !== undefined) {
      view.draft.skills.splice(Number(target.dataset.removeSkill), 1);
    } else if (target.dataset.addPart !== undefined) {
      view.draft.skills[Number(target.dataset.addPart)].components.push(newPart());
    } else if (target.dataset.removePart !== undefined) {
      const [i, a] = pair(target.dataset.removePart);
      view.draft.skills[i].components.splice(a, 1);
    } else if (target.dataset.addScale !== undefined) {
      const [i, a] = pair(target.dataset.addScale);
      view.draft.skills[i].components[a].scaling.push({
        statId: view.catalog.stats[0].id,
        percent: ""
      });
    } else if (target.dataset.removeScale !== undefined) {
      const [i, a, n] = pair(target.dataset.removeScale);
      view.draft.skills[i].components[a].scaling.splice(n, 1);
    } else {
      return;
    }
    view.error = "";
    view.paint();
  });
  view.dialog.addEventListener("change", event => {
    if (event.target.matches("[data-repaint]")) {
      view.read();
      view.paint();
    }
  });
  view.dialog.addEventListener("submit", async event => {
    event.preventDefault();
    view.read();
    try {
      const saved = await view.api(
        `/api/admin/heroes/${encodeURIComponent(view.hero.id)}/profile`,
        {
          method: "PUT",
          body: view.body()
        }
      );
      view.tell(t("Hero data saved"));
      view.dialog.close();
      view.onSaved(saved);
    } catch (problem) {
      view.error = problem.message;
      view.paint();
    }
  });
}

const KINDS = ["damage", "heal", "shield", "control", "buff", "debuff", "movement", "other"];

const kindLabel = kind =>
  ({
    damage: t("Damage"),
    heal: t("Heal"),
    shield: t("Shield"),
    control: t("Control"),
    buff: t("Buff"),
    debuff: t("Debuff"),
    movement: t("Movement"),
    other: t("Other")
  })[kind] ?? kind;

/** "8, 7.5, 7" -> [8, 7.5, 7]; empty -> []; anything else -> null. */
const parseList = text => {
  const parts = String(text ?? "")
    .split(/[,;/\s]+/)
    .filter(Boolean);
  const numbers = parts.map(Number);
  return numbers.some(Number.isNaN) ? null : numbers;
};

const optionalNumber = value =>
  value === "" || value === null || value === undefined ? null : Number(value);

const listText = list => (list ?? []).join(", ");

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  keyOptions,
  statOptions,
  statOf,
  baseCells,
  partMarkup,
  skillMarkup,
  paint,
  read,
  body,
  build
};
