// The tabs of a hero sheet: overview, skills, combos, patch history, artwork. (The builds are in
// builds.js, the competitive numbers in stats.js.) Everything here comes from Camp (Global) through the
// server, from what the editors wrote, or says "Data unavailable" in ONE line: no panel is ever empty,
// the blocks that have something take the room.
import { icon } from "../../../shared/icons.js";
import { deferred, responsive } from "../../../shared/media.js";
import {
  comboPieces,
  comboSteps,
  skillPicture as comboPicture,
  skillsById
} from "../../domain/hero-combos.js";
import { tx } from "../../domain/staff-content.js";
import { escapeHtml } from "../../lib/dom.js";
import { formatSeconds } from "../../lib/format.js";
import { t } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import { gapLine, skillLabel, toneText } from "./hero-sheet-parts.js";
import * as heroStats from "./hero-stats.js";
import { artTitle, head, missingSheet, patchEntry, skillPicture } from "./hero-panels-shared.js";
export { rowsOf } from "./hero-overview.js";
export { overviewPanel } from "./hero-overview.js";

function skillFacts(skill) {
  const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return [
    skill.cooldownSeconds
      ? fact(
          t("Cooldown"),
          `${icon("clock", "i--sm")}${escapeHtml(formatSeconds(skill.cooldownSeconds))}`
        )
      : "",
    skill.cost ? fact(t("Cost"), `<i class="mana"></i>${escapeHtml(skill.cost)}`) : "",
    fact(t("Type"), escapeHtml(skillLabel(skill)))
  ].join("");
}

/** The skill that is open: its name and tags, the numbers that count, its words, the numbers an editor entered and its video. */
function skillPanel(skill, details) {
  const upgrade =
    details.firstSkillToLevel === skill.index && skill.type === "skill"
      ? `<span class="pill pill--live">${t("Level first")}</span>`
      : "";
  const video = skill.video
    ? `<video class="skill-video" data-src="${escapeHtml(skill.video)}#t=0.5" controls loop muted playsinline preload="none" aria-label="${t("{name} preview", { name: escapeHtml(skill.name) })}"></video>`
    : `<p class="muted hs-novideo">${icon("video", "i--sm")}${t("No preview video published for this skill.")}</p>`;
  const tags = skill.tags
    .map(
      tag =>
        `<span class="stag" data-tone="${escapeHtml(tag.color || "")}">${escapeHtml(tag.name)}</span>`
    )
    .join("");
  const numbers = heroStats.skillDetailsMarkup(
    (state.heroSheet?.profile?.skills ?? []).find(
      entry => entry.key === (skill.type === "skill" ? String(skill.index) : skill.type)
    ),
    state.catalog,
    escapeHtml
  );
  return `<div class="skill-panel skdetail hs-skdetail" role="tabpanel">
    <div class="hs-skdetail__text">
      <div class="skdetail__head">${skillPicture(skill, 72)}<div><h3>${escapeHtml(skill.name)}</h3>${tags ? `<div class="tags"><span>${t("Tags")}</span>${tags}</div>` : ""}</div>${upgrade}</div>
      <dl class="skmeta">${skillFacts(skill)}</dl>
      <p class="skdesc skill-description">${toneText(skill.description)}</p>
      ${numbers}
    </div>
    <div class="hs-skdetail__media">${video}</div>
  </div>`;
}

/** The pictures of the skills in a row, then the one that is open. */
export function skillsSection(details) {
  if (!details.skills.length) {
    return `<ul class="hs-gaps">${gapLine("", t("Camp lists no skills for this hero."))}</ul>`;
  }
  const active =
    details.skills.find(skill => skill.index === state.skillIndex) || details.skills[0];
  const tabs = details.skills
    .map(
      skill =>
        `<button type="button" class="skill-tab sk${skill.index === active.index ? " on active" : ""}" role="tab" aria-selected="${skill.index === active.index}" tabindex="${skill.index === active.index ? 0 : -1}" data-action="skill-tab" data-skill-index="${skill.index}" aria-label="${escapeHtml(skill.name)}"><span class="sk__frame">${skill.icon ? `<img ${responsive(skill.icon, 96)} alt="" width="96" height="96" loading="lazy" decoding="async">` : `<span class="sk__blank"></span>`}</span><small>${escapeHtml(skillLabel(skill))}</small><b>${escapeHtml(skill.name)}</b></button>`
    )
    .join("");
  return `<div class="skill-tabs skillbar" role="tablist" aria-label="${t("Skills")}">${tabs}</div>${skillPanel(active, details)}`;
}

/** The skills tab: the pictures of the skills in a row and the open skill; one line when Camp has none. */
export function skillsPanel(details, hero) {
  const body = details
    ? skillsSection(details)
    : `<ul class="hs-gaps">${gapLine("", missingSheet())}</ul>`;
  return `${head(t("Skills"), `<span class="pill pill--grey">${t("Camp · Global")}</span>`)}<div id="skills-body">${body}</div>${details?.skills?.length ? "" : `<div class="hs-fill">${heroPoster(hero, details)}</div>`}`;
}

/** The hero itself where a block has nothing to say: its cover art, or its portrait. */
function heroPoster(hero, details) {
  const cover = details?.art?.cover;
  return cover
    ? `<figure class="hs-poster"><img ${deferred(cover, [640, 960, 1280], "(min-width: 1000px) 60vw, 100vw")} alt="${escapeHtml(hero.displayName || hero.name)}" loading="lazy" decoding="async"></figure>`
    : "";
}

// ---- the combos ---------------------------------------------------------------------------------

/** How many combos are open at once; the others are one click away (a hero has no limit). */
const COMBOS_SHOWN = 4;

/**
 * The combos the editors wrote for the hero, drawn with the pictures of its skills. The first ones
 * are open, the rest are folded in a list of their own. Editors get a link to write them, signed-in
 * players one to practise them. Without any: one line, and the skills the combos are made of.
 */
export function combosPanel(sheet, isEditor, canTrain) {
  const combos = sheet.combos ?? [];
  const skills = skillsById(sheet);
  const heroId = encodeURIComponent(sheet.hero.id);
  const row = (combo, index) =>
    `<li class="combo-row"><span class="combo-row__num" aria-hidden="true">${index + 1}</span><div class="combo-row__text"><h3>${escapeHtml(tx(combo.name))}</h3>${combo.note ? `<p class="muted">${escapeHtml(tx(combo.note))}</p>` : ""}</div>${comboSteps(combo.steps, skills)}</li>`;
  const folded = combos.slice(COMBOS_SHOWN);
  const links = [
    canTrain && combos.length
      ? `<a class="btn btn--sm" href="/training?hero=${heroId}">${icon("target", "i--sm")}${t("Practise these combos")}</a>`
      : "",
    isEditor
      ? `<a class="btn btn--ghost btn--sm" href="/guides/${heroId}?tab=combos">${icon("pencil", "i--sm")}${t("Edit the combos")}</a>`
      : ""
  ].join("");
  if (!combos.length) {
    const pieces = comboPieces(sheet);
    return `${head(t("Combos"), `<span class="pill pill--grey">${t("Curated")}</span>`)}<ul class="hs-gaps">${gapLine("", t("No combo has been written for this hero yet."), links ? `<span class="hs-gap__actions">${links}</span>` : "")}</ul>${
      pieces.length > 1
        ? `<div class="hs-fill"><section class="hs-mod hs-mod--card"><header class="hs-mod__head"><h2>${t("Skills")}</h2></header><ol class="hs-bigskills hs-bigskills--steps">${pieces.map(skill => `<li>${comboPicture(skill, 96)}<b>${escapeHtml(skill.name)}</b>${skill.basic ? "" : `<small>${escapeHtml(skillLabel(skill))}</small>`}</li>`).join("")}</ol></section></div>`
        : ""
    }`;
  }
  return `${head(t("Combos"), `<span class="pill pill--grey">${t("Curated")}</span>`)}<ul class="combo-list">${combos.slice(0, COMBOS_SHOWN).map(row).join("")}</ul>${folded.length ? `<details class="combo-more"><summary>${t("More combos ({count})", { count: folded.length })}</summary><ul class="combo-list">${folded.map((combo, index) => row(combo, COMBOS_SHOWN + index)).join("")}</ul></details>` : ""}${links ? `<p class="hstack wrap combo-links">${links}</p>` : ""}`;
}

export function patchesPanel(details) {
  const count = details ? details.adjustments.length : 0;
  const title = head(
    t("Patch history"),
    `<span class="pill pill--grey">${t("{count, plural, one {# change} other {# changes}}", { count })}</span>`
  );
  if (!details || !details.adjustments.length) {
    return `${title}<ul class="hs-gaps">${gapLine("", details ? t("Camp lists no balance changes for this hero.") : missingSheet())}</ul>${details?.skills?.length ? `<div class="hs-fill"><section class="hs-mod hs-mod--card"><header class="hs-mod__head"><h2>${t("Skills")}</h2></header><ol class="hs-bigskills">${details.skills.map(skill => `<li>${skillPicture(skill, 96, "hs-bigskills__icon")}<b>${escapeHtml(skill.name)}</b><small>${escapeHtml(skillLabel(skill))}</small></li>`).join("")}</ol></section></div>` : ""}`;
  }
  const note = details.adjustmentsDetailed
    ? ""
    : `<p class="muted">${t("Only the summaries are available for this hero; Camp did not return the before/after numbers.")}</p>`;
  return `${title}${note}<ol class="patch-list">${details.adjustments.map(patchEntry).join("")}</ol>`;
}

/** The shape of a picture, to give its tile the room it needs: tall (a standing figure), wide (a scene) or square. */
const artShape = item => {
  const ratio = item.width && item.height ? item.width / item.height : 1;
  return ratio < 0.8 ? "tall" : ratio > 1.4 ? "wide" : "square";
};

export function artworkPanel(details, hero) {
  const title = head(t("Artwork"), `<span class="pill pill--grey">${t("Camp · Global")}</span>`);
  const gallery = details?.gallery ?? [];
  if (!gallery.length) {
    return `${title}<ul class="hs-gaps">${gapLine("", details ? t("No official artwork is published for this hero.") : missingSheet())}</ul>${heroPoster(hero, details) ? `<div class="hs-fill">${heroPoster(hero, details)}</div>` : ""}`;
  }
  return `${title}<div class="gallery-grid">${gallery
    .map(
      item =>
        `<a class="gallery-item gallery-item--${artShape(item)}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(artTitle(item))}"><img ${deferred(item.url, [320, 640, 960], "(min-width: 1000px) 33vw, 100vw")}${item.width && item.height ? ` width="${item.width}" height="${item.height}"` : ""} alt="${escapeHtml(artTitle(item) || t("Artwork"))}" loading="lazy" decoding="async"></a>`
    )
    .join("")}</div>`;
}
