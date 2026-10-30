// player, small helpers: hero, heroName, languageName, profileForm.
import { LANES, TIMEZONES, options } from "./community-shared.js";
import { LANGUAGES } from "../../../shared/i18n.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { laneLabel } from "../../domain/lanes.js";
import { t } from "../../app/browser-i18n.js";

export const hero = (view, id) => view.state.heroes.find(item => item.id === id);

export const heroName = found => found.displayName || found.name;

export const languageName = code =>
  LANGUAGES.find(language => language.code === code)?.name ?? code;

// ---- the profile form (the person themselves) -----------------------------------------------
export function profileForm(view, player) {
  const p = player.profile;
  const heroes = view.state.heroes.filter(item => item.availableGlobal !== false);
  const select = index =>
    `<label class="field"><select name="hero${index}" aria-label="${t("Main hero {number}", { number: index + 1 })}"><option value="">—</option>${heroes.map(item => `<option value="${esc(item.id)}"${p.mainHeroes[index] === item.id ? " selected" : ""}>${esc(heroName(item))}</option>`).join("")}</select></label>`;
  return `<form id="profile-form" class="card card--feature pl-form rise" novalidate>
      <div class="card__head"><h2>${t("Edit my profile")}</h2></div>
      <div class="pl-form__cols">
        <div class="pl-form__col">
          <label class="label">${t("About")}<span class="field field--area"><textarea id="pr-bio" name="bio" rows="4" maxlength="300">${esc(p.bio)}</textarea></span></label>
          <div class="pl-form__pair">
            <label class="label">${t("Lane")}<span class="field"><select id="pr-lane" name="lane"><option value="">—</option>${options(LANES, p.lane, laneLabel)}</select></span></label>
            <label class="label">${t("Time zone")}<span class="field"><select id="pr-zone" name="timezone">${options(TIMEZONES, p.timezone, value => value || "—")}</select></span></label>
          </div>
        </div>
        <div class="pl-form__col">
          <div class="label">${t("Languages")} <small>${t("Up to 5")}</small>
            <div class="chip-checks">${LANGUAGES.map(language => `<label class="chip-check"><input type="checkbox" name="languages" value="${language.code}"${p.languages.includes(language.code) ? " checked" : ""}><span>${esc(language.name)}</span></label>`).join("")}</div>
          </div>
          <div class="label">${t("Main heroes")} <small>${t("Up to 3")}</small>
            <div class="pl-form__heroes">${[0, 1, 2].map(select).join("")}</div>
          </div>
        </div>
      </div>
      <p class="form-error" id="profile-error" role="alert"></p>
      <div class="hstack wrap"><button class="btn btn--primary" type="submit">${icon("check")}${t("Save my profile")}</button><button class="btn btn--ghost" type="button" data-community="close-profile">${t("Cancel")}</button></div>
    </form>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { hero, profileForm };
