// The optional parts of the site and what each one puts in the menu. The settings page and the welcome
// pages draw the same tile for them (the community is always on and cannot be switched off).
import { icon } from "../../../shared/icons.js";
import { escapeHtml } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";

export const MODULES = ["scrims", "tier-lists", "heroes", "training"];

const MODULE_ICONS = {
  community: "users",
  scrims: "swords",
  "tier-lists": "trophy",
  heroes: "book",
  training: "target"
};

/** The four optional parts: a title, a sentence, the pages that join the menu, and where to start. */
export const parts = () => [
  {
    id: "scrims",
    title: t("Scrims and drafts"),
    text: t(
      "Run scrim series with the ban and pick draft, follow the live draft, and review your history and statistics."
    ),
    menu: [t("Scrims & Drafts"), t("Live draft"), t("History")],
    links: [["/scrims", t("Create a series"), "swords"]]
  },
  {
    id: "tier-lists",
    title: t("Tier lists"),
    text: t("Build tier lists for every lane with drag and drop, and share them."),
    menu: [t("Tier Lists")],
    links: [["/tier-lists", t("Open the tier lists"), "trophy"]]
  },
  {
    id: "heroes",
    title: t("Heroes and builds"),
    text: t(
      "Every Global hero with skills, patch history and artwork, and a build lab to try items and arcana."
    ),
    menu: [
      t("Heroes & Builds"),
      t("Build lab"),
      t("Popular"),
      t("Items"),
      t("Arcana"),
      t("Spells")
    ],
    links: [["/heroes", t("Browse the heroes"), "book"]]
  },
  {
    id: "training",
    title: t("Training"),
    text: t(
      "Choose the heroes you work on, keep a notebook of combos and mechanics, and study situations on the map."
    ),
    menu: [t("Training")],
    links: [["/training", t("Choose your heroes"), "target"]]
  }
];

/** The community: always on. */
export const communityPart = () => ({
  id: "community",
  title: t("Community"),
  text: t("Always on: teams, scrim requests, agenda, inbox, player pages and Discord."),
  menu: [t("Teams"), t("Find a scrim"), t("Agenda"), t("Inbox")]
});

/**
 * The tile of a part: a checkbox under a picture, a title, a sentence and the pages it adds to the menu.
 * `input` is the attributes of the checkbox that tell the page which one it is (name and value, or data-).
 */
export function partTile({ id, title, text, menu, on, locked = false, input }) {
  return `<label class="mod${on ? " on" : ""}${locked ? " locked" : ""}">
      <input type="checkbox"${input}${on ? " checked" : ""}${locked ? " disabled" : ""}>
      <span class="mod__top"><span class="ico">${icon(MODULE_ICONS[id])}</span><span class="check${on ? " on" : ""}">${icon(locked ? "lock" : "check")}</span></span>
      <b>${escapeHtml(title)}</b>
      <small>${escapeHtml(text)}</small>
      <span class="mod__menu">${menu.map(label => `<span>${escapeHtml(label)}</span>`).join("")}</span>
    </label>`;
}
