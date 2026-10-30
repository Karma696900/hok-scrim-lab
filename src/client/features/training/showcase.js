// The pieces that fill a page of the area when the person has nothing of their own on it yet (or is not
// signed in): the hero of the day on its cover, the three steps of the training, the kinds of notes.
// They are made of what the application holds already (the roster, the words of the notebook).
import { icon } from "../../../shared/icons.js";
import { heroOfTheDay } from "../../domain/hero-of-the-day.js";
import { t } from "../../app/browser-i18n.js";
import { classLabel, laneLogos } from "../../domain/lanes.js";
import { fillSceneArt, sceneArtSlot } from "../../domain/scene-art.js";
import { stepsHtml } from "../community/stage.js";
import {
  FOCUS_MAX,
  KIND_ICONS,
  NOTE_KINDS,
  STATUSES,
  kindLabel,
  statusLabel
} from "./training-shared.js";

/** The hero of the day on its cover; `add` puts a button to start working on it. */
export function featuredHtml(esc, { add = false } = {}) {
  const hero = heroOfTheDay();
  if (!hero) {
    return "";
  }
  const roles = (hero.roles ?? []).map(classLabel).join(" / ");
  return `<article class="trn-feature keep-dark card--feature">${sceneArtSlot("trn-feature__art", hero)}<div class="trn-feature__veil" aria-hidden="true"></div><div class="trn-feature__body"><span class="pill pill--blue">${t("Hero of the day")}</span><h2>${esc(hero.displayName || hero.name)}</h2><div class="hstack wrap">${roles ? `<span class="trn-feature__roles">${esc(roles)}</span>` : ""}${laneLogos(hero.lanes ?? [], 24)}</div><div class="hstack wrap">${add ? `<button type="button" class="btn btn--primary btn--sm" data-add-hero="${esc(hero.id)}">${icon("plus", "i--sm")}${t("Add to my heroes")}</button>` : ""}<a class="btn btn--sm" href="/heroes/${encodeURIComponent(hero.id)}">${icon("book", "i--sm")}${t("Full hero sheet")}</a></div></div></article>`;
}

/** Draws the cover of the hero of the day into the card that `featuredHtml` made. */
export function paintFeatured(root) {
  const slot = root.querySelector(".trn-feature__art");
  if (slot) {
    fillSceneArt(slot, heroOfTheDay());
  }
}

/** How the training works, in three steps. */
export const howHtml = () =>
  stepsHtml(
    [
      [
        "shield",
        t("Pick your heroes"),
        t("Choose up to {max} heroes: each one gets a card with its goals and its combos.", {
          max: FOCUS_MAX
        })
      ],
      [
        "bolt",
        t("Learn their combos"),
        t("Acquire each combo in its two forms: as it is, and with the animation cancelled.")
      ],
      [
        "refresh",
        t("Check them again"),
        t("Combos come back after a few days: say whether you still master them.")
      ]
    ],
    "trn-steps"
  );

/** The four kinds of notes, with the stages each one goes through. */
export const kindsHtml = () =>
  `<ul class="trn-kinds">${NOTE_KINDS.map(
    kind =>
      `<li class="trn-kind"><span class="trn-kind__icon">${icon(KIND_ICONS[kind])}</span><b>${kindLabel(kind)}</b><span class="trn-kind__states">${STATUSES.map(
        status => `<span class="pill pill--grey">${statusLabel(status, kind)}</span>`
      ).join("")}</span></li>`
  ).join("")}</ul>`;
