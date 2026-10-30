// The hero data editor (administrators, opened from the hero sheet): the real base stats of the
// hero (value at level 1 and growth per level, or the option for a stat that is a choice, such as
// Melee or Ranged), its tags, and the numbers of each spell (cooldown and cost by level, range, cast
// time, each effect with its values and scaling).
import { bindTo } from "../../../shared/bind-to.js";
import { onView as heroEditorParts } from "./hero-editor-parts.js";
import { toDraft } from "./hero-editor-parts.js";

export function createHeroEditor({ api, tell, onSaved }) {
  const view = { api, tell, onSaved };
  bindTo(view, heroEditorParts);
  view.dialog = null;
  view.hero = null;
  view.catalog = null;
  view.campSkills = [];
  view.draft = null;
  view.error = "";

  return {
    open(sheetHero, profile, theCatalog, skills) {
      view.hero = sheetHero;
      view.catalog = theCatalog;
      view.campSkills = skills ?? [];
      view.draft = toDraft(profile);
      view.error = "";
      if (!view.dialog) {
        view.build();
      }
      view.paint();
      view.dialog.showModal();
    }
  };
}
