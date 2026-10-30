import { escapeHtml } from "../../lib/dom.js";
import { formatDate } from "../../lib/format.js";
import { responsive } from "../../../shared/media.js";
import { t } from "../../app/browser-i18n.js";

/** The head of a block: its title and, on the other side, what goes with it. */
export const head = (title, aside = "") =>
  `<header class="hs-mod__head"><h2>${title}</h2>${aside}</header>`;

/** The Camp sheet of the hero is not there yet: the same sentence everywhere. */
export const missingSheet = () =>
  t("Hero sheet not fetched yet. An administrator can start the Camp sync from the Heroes page.");

// ---- the skills ---------------------------------------------------------------------------------

export const skillPicture = (skill, size, className = "skill-icon") =>
  skill.icon
    ? `<img class="${className}" ${responsive(skill.icon, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="${className} image-fallback"></span>`;

// ---- the patch history --------------------------------------------------------------------------

export function patchEntry(entry) {
  return `<li class="patch-entry"><div class="patch-head"><strong>${escapeHtml(entry.seasonName)}</strong><span class="muted">${escapeHtml(formatDate(entry.publishedAt) || entry.version)}</span>${entry.tag.text ? `<span class="stag" data-tone="${escapeHtml(entry.tag.color || "")}">${escapeHtml(entry.tag.text)}</span>` : ""}${entry.current ? `<span class="pill pill--live">${t("Current")}</span>` : ""}</div>
      ${entry.summary ? `<p class="patch-summary">${escapeHtml(entry.summary)}</p>` : ""}
      ${entry.changes.map(change => `<div class="patch-change">${change.skill?.icon ? `<img class="patch-icon" ${responsive(change.skill.icon, 40)} alt="" loading="lazy" decoding="async">` : `<span class="patch-icon image-fallback"></span>`}<div><strong>${escapeHtml(change.title || change.skill?.name || t("General"))}</strong>${change.skill?.label ? ` <span class="muted">· ${escapeHtml(change.skill.label)}</span>` : ""}<p class="patch-text">${escapeHtml(change.text)}</p></div></div>`).join("")}</li>`;
}

// ---- the artwork --------------------------------------------------------------------------------

export const artTitle = item => [item.title, item.subtitle].filter(Boolean).join(" · ");
