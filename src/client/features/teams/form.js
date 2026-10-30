// The form of a team (create it, edit it): one column of labelled fields on the left, and on the right the
// banner the team will have, which follows what is typed (the mark and its colour come from the name).
import { LANGUAGES } from "../../../shared/i18n.js";
import { icon } from "../../../shared/icons.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";
import { t } from "../../app/browser-i18n.js";
import { LEVELS, REGIONS, TIMEZONES, levelLabel, options } from "../community/community-shared.js";
import { stepsHtml } from "../community/stage.js";

/** How a team works, in three steps (the list shows them as a band, the form of a new team beside its fields). */
export const teamStepsHtml = () =>
  stepsHtml([
    ["plus", t("Register"), t("Name, tag, level and region: the team has a page of its own.")],
    ["mail", t("Invite"), t("Ask players by their tag. Nobody joins without answering.")],
    ["swords", t("Play"), t("Plan scrims in the agenda, share series, train the roster.")]
  ]);

/** The banner of the preview: what the team looks like in the list. */
const previewHtml = team => {
  const name = team.name?.trim() || t("Team name");
  return `<div class="tm-preview hue-${teamHue(name)}" data-preview data-logo="${Number(team.logoVersion) || 0}"><span class="tm-preview__banner">${teamEmblem({ ...team, name }, 120)}</span><b>${esc(name)}<small>${esc((team.tag ?? "").toUpperCase())}</small></b><span class="muted">${esc([levelLabel(team.level ?? "casual"), team.region].filter(Boolean).join(" · "))}</span></div>`;
};

/** The form: `team` is a team that exists (edit) or nothing (create). */
export function teamFormHtml(team = {}) {
  const chosen = new Set(team.languages ?? []);
  const logo = team.id
    ? `<div class="label tm-logo">${t("Logo")}
        <span class="tm-logo__row">${teamEmblem(team, 64)}
          <label class="dropzone">${icon("upload", "i--lg")}<span>${t("Choose a picture")}</span><input type="file" id="team-logo-file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <button type="button" class="btn btn--ghost btn--sm" data-team="remove-logo"${team.logoVersion ? "" : " hidden"}>${t("Remove the logo")}</button>
        </span>
        <small>${t("PNG, JPEG, WebP or GIF, 4 MB maximum. It is cropped to a square.")}</small>
      </div>`
    : "";
  return `<form id="team-form" class="card tm-form rise" data-team-id="${esc(team.id ?? "")}" novalidate>
      <div class="tm-form__fields">
        <div class="card__head"><h2>${team.id ? t("Edit the team") : t("Create a team")}</h2></div>
        <label class="label">${t("Team name")}<span class="field"><input id="team-name" name="name" maxlength="40" required autocomplete="off" value="${esc(team.name ?? "")}"></span></label>
        <label class="label">${t("Team tag")}<span class="field"><input id="team-tag" name="tag" maxlength="5" required autocomplete="off" value="${esc(team.tag ?? "")}" aria-describedby="team-tag-hint"></span><small id="team-tag-hint">${t("2 to 5 letters or digits")}</small></label>
        <div class="tm-form__pair">
          <label class="label">${t("Level")}<span class="field"><select id="team-level" name="level">${options(LEVELS, team.level ?? "casual", levelLabel)}</select></span></label>
          <label class="label">${t("Region")}<span class="field"><select id="team-region" name="region"><option value="">—</option>${options(REGIONS, team.region ?? "")}</select></span></label>
        </div>
        <div class="tm-form__pair">
          <label class="label">${t("Time zone")}<span class="field"><select id="team-timezone" name="timezone">${options(TIMEZONES, team.timezone ?? "", value => value || "—")}</select></span></label>
          <label class="label">${t("Member limit")}<span class="field"><input id="team-max" name="maxMembers" type="number" min="7" max="20" step="1" required value="${team.maxMembers ?? 10}" aria-describedby="team-max-hint"></span><small id="team-max-hint">${t("From 7 to 20, pending invitations included")}</small></label>
        </div>
        <div class="label">${t("Languages")} <small>${t("Up to 5")}</small>
          <div class="chip-checks">${LANGUAGES.map(language => `<label class="chip-check"><input type="checkbox" name="languages" value="${language.code}"${chosen.has(language.code) ? " checked" : ""}><span>${esc(language.name)}</span></label>`).join("")}</div>
        </div>
        <label class="label">${t("Description")}<span class="field field--area"><textarea id="team-description" name="description" rows="3" maxlength="600">${esc(team.description ?? "")}</textarea></span></label>
        <p class="form-error" id="team-error" role="alert"></p>
        <div class="hstack wrap"><button class="btn btn--primary" type="submit">${icon("check")}${team.id ? t("Save team") : t("Create a team")}</button>${team.id ? "" : `<button class="btn btn--ghost" type="button" data-team="close-form">${t("Cancel")}</button>`}</div>
      </div>
      <aside class="tm-form__side" aria-label="${t("Team name")}">${previewHtml(team)}${logo}${team.id ? "" : teamStepsHtml()}</aside>
    </form>`;
}

/** What the form holds, as the body of the request. */
export function readTeamForm(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? ""),
    tag: String(data.get("tag") ?? ""),
    level: String(data.get("level") ?? ""),
    region: String(data.get("region") ?? ""),
    timezone: String(data.get("timezone") ?? ""),
    languages: data.getAll("languages").map(String),
    description: String(data.get("description") ?? ""),
    maxMembers: Number(data.get("maxMembers"))
  };
}

/** The preview follows the fields (the logo, when the team has one, stays). */
export function updatePreview(form) {
  const slot = form.querySelector("[data-preview]");
  if (!slot) {
    return;
  }
  const values = readTeamForm(form);
  const id = form.dataset.teamId;
  const current = id ? { id, logoVersion: Number(slot.dataset.logo || 0) } : {};
  slot.outerHTML = previewHtml({ ...current, ...values });
}
