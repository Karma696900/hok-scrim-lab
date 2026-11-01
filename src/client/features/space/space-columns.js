// space page, columns same: partHead, itemsHtml, explainHtml, tierListsPart, and 5 more.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { buildAddress, checkBuild } from "../../../shared/build-model.js";
import { buildMarkup } from "../build-lab/build-lab-view.js";
import { daysText, exerciseName, scoreText } from "../../domain/reflex-labels.js";
import { exerciseOf } from "../../../shared/reflex-model.js";
import { difficultyLabel } from "../simulation/simulation-shared.js";
import { fillSceneArt, sceneArtSlot } from "../../domain/scene-art.js";
import { heroOfTheDay } from "../../domain/hero-of-the-day.js";
import { icon } from "../../../shared/icons.js";
import { kindLabel, statusLabel } from "../training/training-shared.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { lineHtml, paintStage } from "../community/stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { tierKey } from "../../../shared/tier-names.js";
import { tx } from "../../domain/staff-content.js";
import { vodMarkup } from "../../domain/vod-links.js";
import { sectionLabel } from "./space-page-shared.js";

// ---- the columns: the same for the owner and for the people a link is given to --------------------
/** The head of a column: what it holds, how many, and the way to add more (the owner only). */
export const partHead = (section, count, action = "") =>
  `<header class="sp-part__head"><span class="sp-part__icon">${icon(SECTION_ICONS[section])}</span><h2>${sectionLabel(section)}</h2><span class="count">${number(count)}</span>${action}</header>`;

/** The items of a part, in balanced columns: as many columns as items, three at most. */
export const itemsHtml = items =>
  `<ul class="sp-part__items sp-cols-${Math.min(3, items.length)}">${items.join("")}</ul>`;

/** What a space keeps, in three lines (for a person with nothing to look at yet). */
export const explainHtml = () =>
  `<ul class="sp-explain">${[
    ["tierLists", t("Make a tier list and it is kept here.")],
    ["builds", t("Save a build in the build lab, then keep it in your space.")],
    ["training", t("Your heroes, your notebook, the combos you acquired and your reflex scores.")]
  ]
    .map(
      ([section, text]) =>
        `<li><span class="sp-part__icon">${icon(SECTION_ICONS[section])}</span><b>${sectionLabel(section)}</b><span>${text}</span></li>`
    )
    .join("")}</ul>`;

export function tierListsPart(view, lists, { owner }) {
  const rows = lists.map(list => {
    const placed = list.tiers.reduce((sum, tier) => sum + tier.heroes.length, 0);
    const tiers = list.tiers
      .filter(tier => tier.heroes.length)
      .map(
        tier =>
          `<div class="sp-tier"${tierKey(tier.label) ? ` data-tier="${tierKey(tier.label)}"` : ""}><b>${view.esc(tier.label)}</b><span class="sp-heroes">${tier.heroes.map(id => `<span class="pt s-32">${view.portrait(id, 32)}</span>`).join("")}</span></div>`
      )
      .join("");
    return `<li class="sp-list card">
        <div class="sp-list__head"><b>${view.esc(list.name)}</b><span class="pill pill--grey">${list.lane ? `${laneLogos([list.lane], 16, { decorative: true })}${view.esc(laneLabel(list.lane))}` : t("All roles")}</span><span class="muted">${view.esc(t("{count, plural, one {# hero} other {# heroes}}", { count: placed }))}</span></div>
        ${tiers || `<p class="muted">${t("No hero is ranked in this list yet.")}</p>`}
      </li>`;
  });
  // the owner sees how the lists are spread over the lanes, and the way to make one for a lane
  const lanes = owner
    ? [
        `<li class="sp-lanes card"><div class="sp-block__head"><h3>${t("Lanes")}</h3></div><ul class="sp-lanes__list">${PICK_LANES.map(
          lane =>
            `<li><a class="sp-lane" href="/tier-lists">${laneLogos([lane], 22, { decorative: true })}<span>${view.esc(laneLabel(lane))}</span><b>${number(lists.filter(list => list.lane === lane).length)}</b></a></li>`
        ).join("")}</ul></li>`
      ]
    : [];
  const strip = owner
    ? `<ul class="sp-lanestrip">${PICK_LANES.map(
        lane =>
          `<li><a class="sp-lane" href="/tier-lists">${laneLogos([lane], 22, { decorative: true })}<span>${view.esc(laneLabel(lane))}</span><b>${number(0)}</b></a></li>`
      ).join("")}</ul>`
    : "";
  return `<section class="sp-part" id="sp-tier-lists">${partHead("tierLists", lists.length, owner ? `<a class="btn btn--ghost btn--sm" href="/tier-lists">${icon("plus", "i--sm")}${t("Tier lists")}</a>` : "")}${
    rows.length
      ? itemsHtml([...rows, ...lanes])
      : `${lineHtml("trophy", t("No tier list yet"), t("Make a tier list and it is kept here."))}${strip}`
  }</section>`;
}

export function buildsPart(view, builds, { owner }) {
  const rows = builds.map(item => {
    const checked = view.catalog ? checkBuild(item.build, view.catalog).build : item.build;
    const open = buildAddress("/build-lab", {
      build: checked,
      heroId: item.heroId,
      level: item.level
    });
    return `<li class="sp-build card">
        <div class="sp-build__head">${item.heroId ? `<span class="pt s-56">${view.portrait(item.heroId, 56)}</span>` : `<span class="sp-build__icon">${icon("cube")}</span>`}<div class="grow"><b>${view.esc(item.name || t("Build"))}</b><small>${view.esc(item.heroId ? view.heroName(item.heroId) : t("No hero (items only)"))} · ${t("Level {level}", { level: item.level })}</small></div>
          <span class="hstack"><a class="btn btn--sm" href="${view.esc(open)}" data-lab-link>${icon("cube", "i--sm")}${t("Open in the build lab")}</a>${owner ? `<button type="button" class="btn btn--ghost btn--icon btn--sm" data-sp-remove-build="${view.esc(item.id)}" aria-label="${t("Remove this build from my space")}" title="${t("Remove this build from my space")}">${icon("trash", "i--sm")}</button>` : ""}</span></div>
        ${view.catalog ? buildMarkup(checked, view.catalog, { escapeHtml: view.esc }) : ""}
      </li>`;
  });
  const day = heroOfTheDay();
  const suggestion =
    owner && rows.length < 3 && day
      ? [
          `<li class="sp-day keep-dark card--feature">${sceneArtSlot("sp-day__art", day)}<div class="sp-day__veil" aria-hidden="true"></div><div class="sp-day__body"><b>${view.esc(day.displayName || day.name)}</b><a class="btn btn--primary btn--sm" href="/build-lab?hero=${encodeURIComponent(day.id)}">${icon("cube", "i--sm")}${t("Open the build lab")}</a></div></li>`
        ]
      : [];
  return `<section class="sp-part" id="sp-builds">${partHead("builds", builds.length, owner ? `<a class="btn btn--ghost btn--sm" href="/build-lab">${icon("plus", "i--sm")}${t("Build lab")}</a>` : "")}${
    rows.length
      ? itemsHtml([...rows, ...suggestion])
      : `${lineHtml(
          "cube",
          t("No build kept yet"),
          owner
            ? t("Save a build in the build lab, then keep it in your space.")
            : t("Nothing is kept here.")
        )}${suggestion.length ? itemsHtml(suggestion) : ""}`
  }</section>`;
}

export function trainingPart(view, sheet, { owner }) {
  const { focus, notes, combos, reflex } = sheet;
  const games = sheet.simulation ?? [];
  const best = Object.entries(reflex.best);
  const block = (title, body, count = null) =>
    `<li class="sp-block card"><div class="sp-block__head"><h3>${title}</h3>${count === null ? "" : `<span class="count">${number(count)}</span>`}</div>${body}</li>`;
  const items = [
    block(
      t("Heroes worked on"),
      focus.length
        ? `<span class="sp-heroes">${focus.map(id => `<span class="pt s-40">${view.portrait(id, 40)}</span>`).join("")}</span>`
        : `<p class="muted">${t("No hero chosen.")}</p>`,
      focus.length
    ),
    block(
      t("Combos acquired"),
      combos.length
        ? `<ul class="sp-notes">${combos
            .map(
              combo =>
                `<li><b>${view.esc(tx(combo.name))}</b><span class="muted">${view.esc(view.heroName(combo.heroId))}</span>${combo.normal ? `<span class="pill pill--blue">${t("Normal")}</span>` : ""}${combo.animationCancel ? `<span class="pill pill--blue">${t("Animation cancel")}</span>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${t("No combo acquired yet.")}</p>`,
      combos.length
    ),
    block(
      t("Notebook"),
      notes.length
        ? `<ul class="sp-notes">${notes
            .map(
              note =>
                `<li><span class="pill pill--blue">${view.esc(kindLabel(note.kind))}</span><b>${view.esc(note.title)}</b>${note.heroId ? `<span class="muted">${view.esc(view.heroName(note.heroId))}</span>` : ""}<span class="pill pill--grey">${view.esc(statusLabel(note.status, note.kind))}</span>${note.body ? `<p class="muted">${view.esc(note.body)}</p>` : ""}${note.kind === "vod" ? vodMarkup(note) : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${t("Nothing in the notebook.")}</p>`,
      notes.length
    ),
    block(
      t("Reflex"),
      best.length
        ? `<ul class="sp-notes">${best
            .map(
              ([id, score]) =>
                `<li><b>${view.esc(exerciseName(id))}</b><span class="pill pill--grey">${view.esc(scoreText(exerciseOf(id), score))}</span></li>`
            )
            .join(
              ""
            )}<li><b>${t("Streak")}</b><span class="pill pill--grey">${view.esc(daysText(reflex.streak))}</span></li></ul>`
        : `<p class="muted">${t("No exercise played yet.")}</p>`,
      best.length
    ),
    block(
      t("Game Simulation"),
      games.length
        ? `<ul class="sp-notes">${games
            .map(
              game =>
                `<li><b>${view.esc(view.heroName(game.heroId))}</b><span class="muted">${view.esc(difficultyLabel(game.difficulty))}</span><span class="pill pill--blue">${view.esc(t("Macro grade: {grade}", { grade: game.grade }))}</span></li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${t("No game played yet.")}</p>`,
      games.length
    )
  ];
  return `<section class="sp-part" id="sp-training">${partHead("training", focus.length + notes.length + combos.length + best.length + games.length, owner ? `<a class="btn btn--ghost btn--sm" href="/training">${icon("target", "i--sm")}${t("Open the training")}</a>` : "")}${itemsHtml(items)}</section>`;
}

/** The parts of what is shared (all three for the owner), one under the other, each in its own columns. */
export function sections(view, content, shown, { owner }) {
  const parts = [
    shown.includes("tierLists") && content.tierLists
      ? view.tierListsPart(content.tierLists, { owner })
      : "",
    shown.includes("builds") && content.builds ? view.buildsPart(content.builds, { owner }) : "",
    shown.includes("training") && content.training
      ? view.trainingPart(content.training, { owner })
      : ""
  ].filter(Boolean);
  return parts.length ? `<div class="sp-parts">${parts.join("")}</div>` : "";
}

export const loadCatalog = async view => {
  view.catalog ??= await view.api("/api/catalog").catch(() => null);
};

/** The covers of the stage and of the suggestion are read once the page is drawn. */
export function paintCovers(root, hero) {
  paintStage(root, hero);
  const slot = root.querySelector(".sp-day__art");
  if (slot) {
    fillSceneArt(slot, heroOfTheDay());
  }
}

const SECTION_ICONS = { tierLists: "trophy", builds: "cube", training: "target" };

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { tierListsPart, buildsPart, trainingPart, sections, loadCatalog };
