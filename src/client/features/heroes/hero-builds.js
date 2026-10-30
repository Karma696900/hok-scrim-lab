// The recommended builds of a hero, as large framed pictures: the six main items (the core
// ones marked), the utility and late-game items, the battle spells and the arcana by colour, each
// with its name. A piece opens its details under the build. The overview shows the first build in
// short; the builds tab shows all of them.
import {
  ARCANA_COLORS,
  checkBuild,
  encodeBuild,
  indexCatalog,
  sortArcana
} from "../../../shared/build-model.js";
import { icon } from "../../../shared/icons.js";
import { tx } from "../../domain/staff-content.js";
import { escapeHtml } from "../../lib/dom.js";
import { number, t } from "../../app/browser-i18n.js";
import {
  colorLabel,
  groupLabel,
  pieceImage,
  slotButton,
  spellFacts
} from "../build-lab/build-lab-view.js";
import { gapLine } from "./hero-sheet-parts.js";

const nameOf = piece => escapeHtml(tx(piece.name));

/** The address of the build lab with this build and this hero. */
function labAddress(set, ctx) {
  const { build } = checkBuild(set.build, ctx.catalog);
  const params = encodeBuild(build);
  params.set("h", ctx.heroId);
  return `/build-lab?${params.toString()}`;
}

/** The pieces of a build, resolved against the catalogue: { items, utility, late, spells, arcana }. */
function resolve(set, catalog) {
  const { build } = checkBuild(set.build, catalog);
  const index = indexCatalog(catalog);
  const pick = ids => ids.map(id => index.items.get(id)).filter(Boolean);
  return {
    build,
    index,
    items: pick(build.items),
    utility: pick(build.utility),
    late: pick(build.late),
    spells: (build.spells ?? []).map(id => index.spells.get(id)).filter(Boolean),
    arcana: ARCANA_COLORS.map(color => ({
      color,
      entries: sortArcana(build.arcana[color] ?? [], index.arcana)
        .map(entry => ({ ...entry, piece: index.arcana.get(entry.id) }))
        .filter(entry => entry.piece)
    })).filter(group => group.entries.length)
  };
}

const buildName = (set, fallback) => tx(set.name) || fallback;

// ---- the builds tab -----------------------------------------------------------------------------

/** One piece: its picture in a frame (a button that opens its details), its name under it. */
const pieceCell = (kind, piece, options, extra = "") =>
  `<li class="hb-piece hb-piece--${kind}">${slotButton(kind, piece, { escapeHtml, ...options })}<span class="hb-piece__name">${nameOf(piece)}</span>${extra}</li>`;

const group = (name, label, body, className = "") =>
  `<div class="hb-group hb-group--${name}${className}"><p class="hb-label">${label}</p><ul class="hb-pieces">${body}</ul></div>`;

function buildCard(set, index, ctx, isEditor) {
  const { build, items, utility, late, spells, arcana } = resolve(set, ctx.catalog);
  const name = buildName(set, t("Build {variant}", { variant: set.variant }));
  const core = new Set(build.core ?? []);
  const source = set.sourceUrl
    ? ` <a href="${escapeHtml(set.sourceUrl)}" target="_blank" rel="noopener noreferrer nofollow">${t("Source")}</a>`
    : "";
  const note =
    set.note || source ? `<p class="hb__note muted">${escapeHtml(tx(set.note))}${source}</p>` : "";
  const itemGroup = items.length
    ? group(
        "items",
        `${groupLabel("items")}${core.size ? `<span class="hb-legend"><span class="core-mark core-mark-inline" aria-hidden="true">★</span>${t("Core items")}</span>` : ""}`,
        items.map(item => pieceCell("item", item, { size: 56, core: core.has(item.id) })).join("")
      )
    : "";
  const small = (key, list) =>
    list.length
      ? group(
          key,
          groupLabel(key),
          list.map(item => pieceCell("item", item, { size: 56, core: core.has(item.id) })).join("")
        )
      : "";
  const spellGroup = spells.length
    ? group(
        "spells",
        groupLabel("spells"),
        spells
          .map(spell =>
            pieceCell(
              "spell",
              spell,
              { size: 48 },
              spellFacts(spell)
                ? `<small class="hb-piece__facts">${escapeHtml(spellFacts(spell))}</small>`
                : ""
            )
          )
          .join("")
      )
    : "";
  const arcanaGroups = arcana
    .map(({ color, entries }) =>
      group(
        `arcana arcana-${color}`,
        `<span class="hb-dot" aria-hidden="true"></span>${escapeHtml(colorLabel(color))}<em>${number(entries.reduce((sum, entry) => sum + entry.count, 0))}</em>`,
        entries
          .map(entry => pieceCell("arcana", entry.piece, { size: 40, count: entry.count }))
          .join("")
      )
    )
    .join("");
  return `<article class="build-card hb" data-variant="${set.variant}"${index ? " hidden" : ""}>
      <header class="hb__head"><h3>${escapeHtml(name)}</h3></header>
      ${note}
      <div class="hb__sets">${itemGroup}${spellGroup}${small("utility", utility)}${small("late", late)}</div>
      ${arcanaGroups ? `<div class="hb__arcana">${arcanaGroups}</div>` : ""}
      <div class="build-info" aria-live="polite"></div>
      <div class="hb__actions"><a class="btn btn--primary btn--sm" href="${escapeHtml(labAddress(set, ctx))}" data-lab-link>${icon("cube", "i--sm")}${t("Try it in the build lab")}</a>${isEditor ? `<a class="btn btn--sm" href="/guides/${encodeURIComponent(ctx.heroId)}?variant=${set.variant}">${icon("pencil", "i--sm")}${t("Edit this build")}</a>` : ""}</div>
    </article>`;
}

/** The pieces of the game, as a shelf of pictures: what a build is made of (the catalogue is never empty for the lab). */
function catalogShelves(catalog) {
  const shelf = (title, href, pieces, size) => {
    const withPicture = pieces.filter(piece => piece.imageId).slice(0, 16);
    return withPicture.length
      ? `<section class="hs-mod hs-mod--shelf"><header class="hs-mod__head"><h2>${title}</h2><a class="link" href="${href}">${t("See all")}</a></header><ul class="hb-shelf">${withPicture
          .map(
            piece =>
              `<li><a class="hb-shelf__piece" href="${href}" title="${nameOf(piece)}" aria-label="${nameOf(piece)}">${pieceImage(piece, size, escapeHtml)}</a></li>`
          )
          .join("")}</ul></section>`
      : "";
  };
  return `${shelf(t("Items"), "/items", catalog.items ?? [], 56)}${shelf(t("Arcana"), "/arcana", catalog.arcana ?? [], 56)}${shelf(t("Spells"), "/spells", catalog.spells ?? [], 56)}`;
}

/** The builds tab: every recommended build, one at a time under a switch; one line and the pieces of the game when there is none. */
export function buildsPanel(sheet, ctx, { isEditor }) {
  const sets = sheet.builds ?? [];
  const labLink = `<a class="btn btn--sm" href="/build-lab?h=${encodeURIComponent(ctx.heroId)}" data-lab-link>${icon("cube", "i--sm")}${t("Open the build lab")}</a>`;
  const editLink = isEditor
    ? `<a class="btn btn--ghost btn--sm" href="/guides/${encodeURIComponent(ctx.heroId)}">${icon("pencil", "i--sm")}${t("Edit the builds")}</a>`
    : "";
  if (!ctx.catalog || !sets.length) {
    return `<header class="hs-mod__head"><h2>${t("Recommended builds")}</h2><span class="pill pill--grey">${t("Curated")}</span></header>
      <ul class="hs-gaps">${gapLine("", t("No build has been entered for this hero yet."), `<span class="hs-gap__actions build-lab-link">${labLink}${editLink}</span>`)}</ul>
      ${ctx.catalog ? `<div class="hs-shelves">${catalogShelves(ctx.catalog)}</div>` : ""}`;
  }
  const toggle =
    sets.length > 1
      ? `<div class="variant seg" role="group" aria-label="${t("Recommended builds")}">${sets
          .map(
            (set, index) =>
              `<button type="button" class="${index ? "" : "on"}" data-action="build-variant" data-variant="${set.variant}" aria-pressed="${index === 0}">${escapeHtml(buildName(set, t("Build {variant}", { variant: set.variant })))}</button>`
          )
          .join("")}</div>`
      : "";
  return `<header class="hs-mod__head"><h2>${t("Recommended builds")}</h2><span class="hs-mod__tools"><span class="pill pill--grey">${t("Curated")}</span>${toggle}</span></header>
    ${sets.map((set, index) => buildCard(set, index, ctx, isEditor)).join("")}
    <p class="hs-foot build-lab-link">${labLink}${editLink}</p>`;
}

// ---- the overview -------------------------------------------------------------------------------

/**
 * The first build in short, for the overview: the same framed pictures, the name of the build
 * on one line. A click goes to the builds tab and opens that piece.
 */
function buildDigest(set, ctx, { isEditor, hidden = false }) {
  const { build, items, spells, arcana } = resolve(set, ctx.catalog);
  const core = new Set(build.core ?? []);
  const tile = (kind, piece, extra = "") =>
    `<li><button type="button" class="hs-piece${extra}" data-action="hero-piece" data-piece="${kind}:${piece.id}" aria-label="${nameOf(piece)}" title="${nameOf(piece)}">${pieceImage(piece, kind === "item" ? 72 : 56, escapeHtml)}${core.has(piece.id) && kind === "item" ? `<span class="core-mark" aria-hidden="true">★</span>` : ""}</button></li>`;
  const more = [...build.utility, ...build.late]
    .map(id => ({ id, piece: indexCatalog(ctx.catalog).items.get(id) }))
    .filter(entry => entry.piece);
  const arcanaRows = arcana
    .map(({ color, entries }) => {
      const total = entries.reduce((sum, entry) => sum + entry.count, 0);
      return `<li class="hs-arc arcana-${color}"><span class="hb-dot" aria-hidden="true"></span><b>${escapeHtml(colorLabel(color))}</b><em>${number(total)}</em><ul class="hs-pieces hs-pieces--small">${entries
        .slice(0, 5)
        .map(
          entry =>
            `<li><button type="button" class="hs-piece hs-piece--small" data-action="hero-piece" data-piece="arcana:${entry.piece.id}" aria-label="${nameOf(entry.piece)}" title="${nameOf(entry.piece)}">${pieceImage(entry.piece, 40, escapeHtml)}<span class="avatar-count">×${number(entry.count)}</span></button></li>`
        )
        .join("")}</ul></li>`;
    })
    .join("");
  const name = buildName(set, t("Build {variant}", { variant: set.variant }));
  return `<div class="hs-digest" data-variant="${set.variant}"${hidden ? " hidden" : ""}>
      <p class="hs-digest__name"><b>${escapeHtml(name)}</b></p>
      <ul class="hs-pieces">${items.map(item => tile("item", item)).join("")}${more.map(entry => tile("item", entry.piece, " hs-piece--small")).join("")}${spells.map(spell => tile("spell", spell, " hs-piece--spell")).join("")}</ul>
      ${arcanaRows ? `<ul class="hs-arcs">${arcanaRows}</ul>` : ""}
      <div class="hstack wrap"><a class="btn btn--primary btn--sm" href="${escapeHtml(labAddress(set, ctx))}">${icon("cube", "i--sm")}${t("Try it in the build lab")}</a>${isEditor ? `<a class="btn btn--ghost btn--sm" href="/guides/${encodeURIComponent(ctx.heroId)}?variant=${set.variant}">${icon("pencil", "i--sm")}${t("Edit this build")}</a>` : ""}</div>
    </div>`;
}

/** Every recommended build in short, one at a time under a switch (build 1 / build 2), so the second is read without leaving the overview. */
export function buildDigests(sets, ctx, { isEditor }) {
  const switcher =
    sets.length > 1
      ? `<div class="variant seg" role="group" aria-label="${t("Recommended builds")}">${sets
          .map(
            (set, index) =>
              `<button type="button" class="${index ? "" : "on"}" data-action="digest-variant" data-variant="${set.variant}" aria-pressed="${index === 0}">${escapeHtml(buildName(set, t("Build {variant}", { variant: set.variant })))}</button>`
          )
          .join("")}</div>`
      : "";
  return `${switcher}${sets.map((set, index) => buildDigest(set, ctx, { isEditor, hidden: index > 0 })).join("")}`;
}
