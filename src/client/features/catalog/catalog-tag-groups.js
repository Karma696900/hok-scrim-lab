// The tags sorted by colour: each colour is a group ("Damage", "Crowd control"…) that an administrator
// names. The names of the groups, the tags shown group by group (in the forms and in the Tags tab), and
// merging a tag into another one (two tags that say the same thing).
import { escapeHtml as esc } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";

export const TAG_COLORS = [
  "red",
  "pink",
  "orange",
  "green",
  "blue",
  "cyan",
  "violet",
  "gold",
  "gray"
];

const colourName = color =>
  ({
    red: t("Red"),
    pink: t("Pink"),
    orange: t("Orange"),
    green: t("Green"),
    blue: t("Blue"),
    cyan: t("Cyan"),
    violet: t("Violet"),
    gold: t("Gold"),
    gray: t("Grey")
  })[color] ?? color;

/** The name of the group of a colour, or the colour itself while the group has no name. */
export const groupName = (view, color) => view.catalog.tagGroups?.[color] || colourName(color);

/** The group and its colour, for a list of colours: "Damage (Red)". */
export const colourOption = (view, color) =>
  view.catalog.tagGroups?.[color]
    ? `${view.catalog.tagGroups[color]} (${colourName(color)})`
    : colourName(color);

/** The tags, group by group in the order of the colours: [[color, tags]], the empty groups left out. */
export const byGroup = tags =>
  TAG_COLORS.map(color => [color, tags.filter(tag => tag.color === color)]).filter(
    ([, inGroup]) => inGroup.length
  );

/** The panel of the Tags tab when no tag is open: the name of each group, written in place. */
export const groupsEditor = view =>
  `<form id="tag-groups-form" class="ct-groups" novalidate><h3 class="ws-title">${t("Groups of tags")}</h3>
    <p class="ws-hint">${t("Each colour of tag is a group: name it, and the tags are sorted by group everywhere.")}</p>
    ${TAG_COLORS.map(
      color =>
        `<label class="ct-group"><span class="tag-chip tag-${color}">${colourName(color)}</span><span class="field"><input name="group-${color}" maxlength="40" value="${esc(view.catalog.tagGroups?.[color] ?? "")}" placeholder="${t("Name of the group")}" autocomplete="off"></span></label>`
    ).join("")}
    <button type="submit" class="btn btn--sm">${t("Save the groups")}</button></form>`;

export async function saveTagGroups(view, form) {
  if (view.busy) {
    return;
  }
  view.busy = true;
  try {
    const data = new FormData(form);
    const groups = Object.fromEntries(
      TAG_COLORS.map(color => [color, String(data.get(`group-${color}`) ?? "").trim()])
    );
    await view.api("/api/admin/catalog/tag-groups", { method: "PUT", body: { groups } });
    await view.reload();
    view.tell(t("Saved"));
    view.paint();
  } catch (problem) {
    view.tell(problem.message);
  } finally {
    view.busy = false;
  }
}

/** In the form of a tag that exists: the tag it could be merged into, and the button. */
export const mergeField = (view, id) => {
  const others = view.catalog.tags.filter(tag => tag.id !== id);
  return id && others.length
    ? `<div class="ct-merge"><label class="label">${t("Merge into another tag")}<span class="field"><select name="mergeInto" aria-describedby="ct-merge-hint"><option value="">${t("Choose the tag that stays")}</option>${byGroup(
        others
      )
        .map(
          ([color, inGroup]) =>
            `<optgroup label="${esc(groupName(view, color))}">${inGroup.map(tag => `<option value="${tag.id}">${esc(tag.name)}</option>`).join("")}</optgroup>`
        )
        .join(
          ""
        )}</select></span></label><small class="ws-hint" id="ct-merge-hint">${t("The items, arcana, heroes and conditions that use this tag will use the chosen one, then this tag is deleted.")}</small>
      <button type="button" class="btn btn--sm" data-merge-tag>${t("Merge")}</button></div>`
    : "";
};

export async function mergeTag(view) {
  const into = Number(view.root.querySelector('#catalog-form [name="mergeInto"]')?.value);
  const target = view.catalog.tags.find(tag => tag.id === into);
  if (!target || view.busy || !view.editing?.id) {
    view.tell(t("Choose the tag that stays."));
    return;
  }
  if (!confirm(t("Merge this tag into {name}? It is then deleted.", { name: target.name }))) {
    return;
  }
  view.busy = true;
  try {
    await view.api(`/api/admin/catalog/tags/${view.editing.id}/merge`, {
      method: "POST",
      body: { into }
    });
    view.editing = null;
    await view.reload();
    view.tell(t("Merged into {name}", { name: target.name }));
    view.paint();
  } catch (problem) {
    view.error = problem.message;
    view.paint();
  } finally {
    view.busy = false;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { saveTagGroups, mergeTag };
