// The markup of the lab: the hero, the kept builds, the sheet, the dock, the catalog.
import {
  ARCANA_COLORS,
  MAX_LEVEL,
  buildAddress,
  computeStats,
  indexCatalog
} from "../../../shared/build-model.js";
import { NAME_MAX, savedOf } from "./saved.js";
import { classLabel, laneLogos } from "../../domain/lanes.js";
import { escapeHtml } from "../../lib/escape.js";
import { fillSceneArt, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { pieceImage, statsNotes, statsTable, tagChip } from "./build-lab-view.js";
import { slotImage } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";
import { heroName, stage } from "./build-lab-parts.js";

/** The hero of the build: its picture, a list to change it, what it is. */
export const heroBlock = (view, current) => `<div class="lab-hero lb-hero">
      ${current ? `<span class="pt s-84 pt--ring">${slotImage(current)}</span>` : `<span class="lb-hero__empty">${icon("cube")}</span>`}
      <div class="lb-hero__main">
        <label class="label" for="lab-hero">${t("Hero")}<span class="field"><select id="lab-hero"><option value="">${t("No hero (items only)")}</option>${view
          .heroes()
          .map(
            entry =>
              `<option value="${escapeHtml(entry.id)}"${entry.id === view.heroId ? " selected" : ""}>${escapeHtml(heroName(entry))}</option>`
          )
          .join("")}</select></span></label>
        ${current ? `<div class="lb-hero__meta">${escapeHtml((current.roles ?? []).map(classLabel).join(" · "))}${current.lanes?.length ? laneLogos(current.lanes, 24) : ""}</div>` : ""}
      </div>
    </div>`;

/** One kept build: its hero, its name, its items as small pictures, and what can be done with it. */
export function keptRow(view, item) {
  const owner = view.heroOf(item.heroId);
  const items = [...item.build.items, ...item.build.utility, ...item.build.late]
    .map(id => indexCatalog(view.catalog).items.get(id))
    .filter(Boolean)
    .map(piece => pieceImage(piece, 26, escapeHtml))
    .join("");
  return `<li class="saved-row${item.id === view.activeId ? " active" : ""}">
        <span class="pt s-40">${owner ? slotImage(owner) : `<span class="image-fallback"></span>`}</span>
        <div class="saved-main"><b>${escapeHtml(item.name || t("Build"))}</b><small>${escapeHtml(owner ? heroName(owner) : t("No hero (items only)"))} · ${t("Level {level}", { level: item.level })}</small><span class="saved-items" aria-hidden="true">${items}</span></div>
        <div class="saved-actions">
          <button type="button" class="btn btn--sm" data-saved-load="${escapeHtml(item.id)}">${t("Load")}</button>
          ${
            view.state.auth.user
              ? `<button type="button" class="btn btn--ghost btn--icon btn--sm" data-saved-space="${escapeHtml(item.id)}" aria-label="${t("Keep this build in my space")}" title="${t("Keep this build in my space")}">${icon("layers", "i--sm")}</button>`
              : ""
          }
          <button type="button" class="btn btn--ghost btn--icon btn--sm" data-saved-copy="${escapeHtml(item.id)}" aria-label="${t("Copy the link of this build")}" title="${t("Copy the link of this build")}">${icon("link", "i--sm")}</button>
          <button type="button" class="btn btn--ghost btn--icon btn--sm" data-saved-delete="${escapeHtml(item.id)}" aria-label="${t("Delete this build")}" title="${t("Delete this build")}">${icon("trash", "i--sm")}</button>
        </div>
      </li>`;
}

/** Save the build under a name, share its link, start over, and the builds kept before. Nothing leaves the device. */
export function keepPanel(view) {
  const current = view.hero();
  const mine = current ? savedOf(view.kept, view.heroId) : [];
  const shown = current && view.scope === "hero" ? mine : view.kept;
  const active = view.kept.find(item => item.id === view.activeId) ?? null;
  const choose = current
    ? `<div class="seg" role="group" aria-label="${t("Builds to show")}"><button type="button" class="${view.scope === "hero" ? "on" : ""}" data-saved-scope="hero" aria-pressed="${view.scope === "hero"}">${t("This hero")} · ${mine.length}</button><button type="button" class="${view.scope === "all" ? "on" : ""}" data-saved-scope="all" aria-pressed="${view.scope === "all"}">${t("All heroes")} · ${view.kept.length}</button></div>`
    : "";
  return `<section class="lb-saved my-builds" id="my-builds">
        <div class="lb-saved__head"><h2>${t("My builds")}</h2><span class="pill pill--grey">${t("On this device")}</span></div>
        <form id="lab-keep" class="keep-form" novalidate>
          <label class="field keep-name"><input id="lab-keep-name" name="name" maxlength="${NAME_MAX}" value="${escapeHtml(view.keepName)}" placeholder="${t("Name of this build (optional)")}" aria-label="${t("Name of this build")}" autocomplete="off"></label>
          ${
            active
              ? `<button class="btn btn--primary" type="submit" value="update">${icon("check", "i--sm")}${t("Update “{name}”", { name: escapeHtml(active.name || t("Build")) })}</button><button class="btn" type="submit" value="new">${t("Save as a new build")}</button>`
              : `<button class="btn btn--primary" type="submit" value="new">${icon("bookmark", "i--sm")}${t("Save this build")}</button>`
          }
          <button type="button" class="btn" data-copy>${icon("link", "i--sm")}${t("Copy the link to this build")}</button>
          <button type="button" class="btn btn--ghost" data-reset>${icon("undo", "i--sm")}${t("Start over")}</button>
        </form>
        <p class="form-error" role="alert">${escapeHtml(view.keepError)}</p>
        ${choose}
        ${
          shown.length
            ? `<ul class="saved-list">${shown.map(view.keptRow).join("")}</ul>`
            : `<p class="muted saved-empty">${t("No build kept yet. Save one to find it here, next time, for any hero.")}</p>`
        }
        <p class="muted lab-note">${t("Kept in this browser only, no account needed. Clearing the browser data removes them: copy the link of a build to keep it somewhere else.")} ${view.state.auth.user ? t("To find a build on any device, and to share it, keep it in your space.") : t("Sign in to keep builds in your space, on any device.")}</p>
      </section>`;
}

/** The sheet of the build, on the right: it stays in view while the catalogue scrolls. */
export function sheetMarkup(view) {
  const profile = view.sheet?.profile ?? null;
  const current = view.hero();
  const { rows, notes } = computeStats(
    profile,
    view.workbench.build,
    view.level,
    view.catalog,
    current
  );
  const recommended = (view.sheet?.builds ?? [])
    .map(
      entry =>
        `<button type="button" class="btn btn--sm" data-load="${entry.variant}">${icon("download", "i--sm")}${t("Load: {name}", { name: escapeHtml(tx(entry.name) || t("Build {variant}", { variant: entry.variant })) })}</button>`
    )
    .join("");
  const heroTags = (profile?.tags ?? [])
    .map(id => indexCatalog(view.catalog).tags.get(id))
    .filter(Boolean)
    .map(tag => tagChip(tag, escapeHtml))
    .join("");
  // the people who write the recommended builds of the heroes get a way to there with this build
  const publish =
    view.state.auth.user?.isEditor && current
      ? `<div class="hstack wrap lab-publish"><a class="btn btn--sm" href="${escapeHtml(buildAddress(`/guides/${encodeURIComponent(view.heroId)}`, { build: view.workbench.build }))}">${icon("star", "i--sm")}${t("Publish as a recommended build")}</a></div>`
      : "";
  return `<aside class="bl-side lb-sheet card card--feature rise d-1${view.sheetOpen ? " is-open" : ""}" id="lb-sheet" aria-label="${t("Your build")}">
        <div class="lb-sheet__scroll" id="lb-scroll">
          <div class="lb-sheet__title"><h2>${t("Your build")}</h2>${recommended ? `<div class="hstack wrap">${recommended}</div>` : ""}<button type="button" class="btn btn--ghost btn--icon lb-sheet__close" data-sheet="close" aria-label="${t("Close")}">${icon("x")}</button></div>
          ${view.heroBlock(current)}
          ${current ? `<div class="tag-line">${heroTags || `<span class="muted">${t("This hero has no tag yet.")}</span>`}</div>` : ""}
          <div class="lvl-line"><b>${t("Level {level}", { level: view.level })}</b><input id="lab-level" type="range" min="1" max="${MAX_LEVEL}" value="${view.level}" aria-label="${t("Level")}"></div>
          ${view.workbench.slotsPanel()}
          ${view.workbench.detailsPanel()}
          ${view.workbench.arcanaPanel()}
          ${view.workbench.errorLine()}
          <section class="lb-stats">
            <h2>${t("Stats")}</h2>
            ${statsTable(rows, view.catalog, { escapeHtml })}
            <div class="stat-notes">${statsNotes(notes, view.catalog, { escapeHtml, hasHero: Boolean(current) })}</div>
          </section>
          <div class="lb-howto">
            ${current && !profile?.baseStats?.length ? `<p class="muted lab-note">${t("The base stats of this hero have not been entered yet: only what items and arcana give is shown.")}</p>` : ""}
            <p class="muted lab-note">${t("A value that depends on the hero counts only when it applies to the hero you chose. A temporary value is shown apart and is not in the total.")}</p>
          </div>
          ${view.keepPanel()}
          ${publish}
        </div>
      </aside>`;
}

/** The catalogue, on the left: its bar stays under the top bar while the pieces scroll. */
/** On a phone: the pieces of the build as small pictures, on a bar at the bottom that opens the sheet. */
export function dock(view) {
  const { build } = view.workbench;
  const index = indexCatalog(view.catalog);
  const pieces = [
    ...[...build.items, ...build.utility, ...build.late].map(id => index.items.get(id)),
    ...build.spells.map(id => index.spells.get(id)),
    ...ARCANA_COLORS.flatMap(color => build.arcana[color].map(entry => index.arcana.get(entry.id)))
  ].filter(Boolean);
  const pictures = pieces
    .slice(0, 8)
    .map(piece => pieceImage(piece, 32, escapeHtml))
    .join("");
  return `<div class="lb-dock"><button type="button" class="lb-dock__open" data-sheet="open" aria-expanded="${view.sheetOpen}" aria-controls="lb-sheet"><span class="lb-dock__pieces" aria-hidden="true">${pictures || icon("cube")}</span><b>${t("Your build")}</b>${pieces.length ? `<em>${pieces.length}</em>` : ""}${icon("up", "i--sm")}</button></div>`;
}

export const catalogMarkup = view => `<section class="lb-catalog rise d-1">
        <div class="lb-catalog__bar" id="lb-bar">${view.workbench.catalogBar()}</div>
        <div id="lab-grid">${view.workbench.catalogGrid()}</div>
        <ul class="lb-notes muted">
          <li>${t("Passives and actives are described on each piece; only the stats are added up.")}</li>
        </ul>
      </section>`;

/** The control that has the focus, as a selector that finds its twin once the page is drawn again. */
export function focusSnapshot(view) {
  const active = document.activeElement;
  if (!active || !view.root.contains(active) || active === view.root) {
    return null;
  }
  if (active.id) {
    return `#${CSS.escape(active.id)}`;
  }
  const key = FOCUS_KEYS.find(name => name in active.dataset);
  return key ? `[data-${kebab(key)}="${CSS.escape(active.dataset[key])}"]` : null;
}

export function paint(view) {
  const current = view.hero();
  const scrolled = view.root.querySelector("#lb-scroll")?.scrollTop ?? 0;
  // the pieces keep their place when one is added; a tab or a category starts them from the top
  const listed = view.resetGrid ? 0 : (view.root.querySelector("#lab-grid")?.scrollTop ?? 0);
  view.resetGrid = false;
  const focus = view.focusSnapshot();
  view.root.innerHTML = `<div class="bl lab-layout">${stage(current)}${view.catalogMarkup()}${view.sheetMarkup()}</div>${view.dock()}<div class="lb-tip" id="lb-tip" role="tooltip" hidden></div>`;
  const scroller = view.root.querySelector("#lb-scroll");
  if (scroller) {
    scroller.scrollTop = scrolled;
  }
  const pieces = view.root.querySelector("#lab-grid");
  if (pieces) {
    pieces.scrollTop = listed;
  }
  if (focus) {
    view.root.querySelector(focus)?.focus({ preventScroll: true });
  }
  fillSceneArt(view.root.querySelector(".lb-stage__art"), current ?? sceneHero(1));
}

/** What a control is called when the page is drawn again, to give the focus back to its twin. */
const FOCUS_KEYS = [
  "add",
  "piece",
  "more",
  "less",
  "tab",
  "shop",
  "info",
  "toggleCore",
  "removeItem",
  "removeSpell",
  "load",
  "savedLoad",
  "savedCopy",
  "savedDelete",
  "savedScope",
  "savedSpace",
  "reset",
  "copy",
  "closeInfo",
  "sheet"
];

const kebab = name => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  heroBlock,
  keptRow,
  keepPanel,
  sheetMarkup,
  dock,
  catalogMarkup,
  focusSnapshot,
  paint
};
