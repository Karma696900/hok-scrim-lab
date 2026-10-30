// Small pieces the hero index and the hero sheet share: the coloured words of a description, the
// names of the skills, and the one-line "nothing here yet".
import { icon } from "../../../shared/icons.js";
import { responsive } from "../../../shared/media.js";
import { t } from "../../app/browser-i18n.js";
import { escapeHtml } from "../../lib/dom.js";

/** The words of a description, with the colours Camp gives them (applied after the draw: applyTones). */
export function toneText(segments) {
  return (segments || [])
    .map(segment =>
      segment.c
        ? `<span class="tone" data-tone="${escapeHtml(segment.c)}">${escapeHtml(segment.t)}</span>`
        : escapeHtml(segment.t)
    )
    .join("");
}

/** A small portrait with its name: opens the sheet of that hero. */
export const miniPortrait = hero =>
  `<li><button type="button" class="hl-mini" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}" aria-label="${escapeHtml(hero.displayName || hero.name)}"><span class="hl-mini__img">${hero.image ? `<img ${responsive(hero.image, 64)} alt="" width="64" height="64" loading="lazy" decoding="async">` : ""}</span><b>${escapeHtml(hero.displayName || hero.name)}</b></button></li>`;

/** "Passive" / "Skill 1" / "Ultimate" are ours, not Camp's: they follow the language of the page. */
export function skillLabel(skill) {
  if (skill.type === "passive") {
    return t("Passive");
  }
  if (skill.type === "ultimate") {
    return t("Ultimate");
  }
  return t("Skill {index}", { index: skill.index });
}

/**
 * What is not there, in ONE line: the name of the block, "Data unavailable", why, and the action that
 * fixes it (if the person can do it). It never takes more room than a line of text.
 */
export function gapLine(title, reason, action = "") {
  return `<li class="hs-gap">${icon("info", "i--sm")}<span class="hs-gap__text">${title ? `<b>${escapeHtml(title)}</b>` : ""}<span><strong>${t("Data unavailable")}</strong> ${escapeHtml(reason)}</span></span>${action}</li>`;
}

/** The same sentence inside a block that has something else to show: one line, no box. */
export const gapNote = reason =>
  `<p class="hs-note">${icon("info", "i--sm")}<span><strong>${t("Data unavailable")}</strong> ${escapeHtml(reason)}</span></p>`;

/** Camp's colours of tags and skills, as a CSS variable (CSSOM: the content policy forbids style attributes). */
export function applyTones(root) {
  for (const element of root.querySelectorAll("[data-tone]")) {
    const tone = element.dataset.tone;
    if (/^#[0-9a-f]{6}$/i.test(tone)) {
      element.style.setProperty("--tone", tone);
      element.style.setProperty("--tc", tone);
    }
  }
}
