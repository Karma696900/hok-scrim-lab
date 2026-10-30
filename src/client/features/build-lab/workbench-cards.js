// The cards of the build: its slots, its arcana, the details of a piece.
import {
  ARCANA_COLORS,
  ARCANA_PER_COLOR,
  SLOTS,
  SPELLS_MAX,
  arcanaTotal
} from "../../../shared/build-model.js";
import {
  buildMarkup,
  colorLabel,
  groupLabel,
  pieceDetails,
  pieceImage,
  slotButton
} from "./build-lab-view.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";

export const arcanaEditor = view =>
  `<div class="arcana-editor">${ARCANA_COLORS.map(color => {
    const entries = view.build.arcana[color];
    return `<div class="arcana-column arcana-${color}"><h3>${colorLabel(color)} <span class="muted">${arcanaTotal(entries)}/${ARCANA_PER_COLOR}</span></h3>${
      entries.length
        ? entries
            .map(entry => {
              const piece = view.index().arcana.get(entry.id);
              return `<div class="arcana-line">${pieceImage(piece, 32, escapeHtml)}<button type="button" class="link" data-info="arcana:${entry.id}">${escapeHtml(tx(piece.name))}</button><span class="arcana-counter"><button type="button" class="btn btn--ghost btn--icon btn--sm" data-less="${entry.id}" aria-label="${t("One less")}">${icon("minus", "i--sm")}</button><strong>×${entry.count}</strong><button type="button" class="btn btn--ghost btn--icon btn--sm" data-more="${entry.id}" aria-label="${t("One more")}"${arcanaTotal(entries) >= ARCANA_PER_COLOR ? " disabled" : ""}>${icon("plus", "i--sm")}</button></span></div>`;
            })
            .join("")
        : `<p class="muted">${t("None yet.")}</p>`
    }</div>`;
  }).join("")}</div>`;

/** The card of the build: its slots, its arcana, the problem if there is one. */
export function buildCard(view, { title, headExtra = "", footer = "", depth = "d-2" }) {
  return `<section class="card rise ${depth}">
              <div class="card__head"><h2>${title}</h2>${headExtra}</div>
              ${buildMarkup(view.build, view.getCatalog(), { escapeHtml, activePiece: view.info, freeSlots: true })}
              ${view.arcanaEditor()}
              <p class="form-error" role="alert">${escapeHtml(view.error)}</p>
              ${footer}
            </section>`;
}

/** The details of the piece that was clicked (nothing when none was). */
export function detailsCard(view) {
  const shown = view.info
    ? (() => {
        const [kind, id] = view.info.split(":");
        const piece = (
          kind === "item"
            ? view.index().items
            : kind === "spell"
              ? view.index().spells
              : view.index().arcana
        ).get(Number(id));
        return piece ? { kind, piece } : null;
      })()
    : null;
  if (!shown) {
    return "";
  }
  return `<section class="card rise"><div class="card__head"><h2>${t("Details")}</h2><button type="button" class="btn btn--ghost btn--sm" data-close-info>${icon("x", "i--sm")}${t("Close")}</button></div>${pieceDetails(shown.kind, shown.piece, view.getCatalog(), escapeHtml, { facts: view.getFacts() })}<div class="hstack wrap lab-piece-actions">${shown.kind === "spell" && view.build.spells.includes(shown.piece.id) ? `<button type="button" class="btn btn--sm btn--danger" data-remove-spell="${shown.piece.id}">${icon("trash", "i--sm")}${t("Remove from the build")}</button>` : ""}${shown.kind === "item" && view.build.items.includes(shown.piece.id) ? `<button type="button" class="btn btn--sm" data-toggle-core="${shown.piece.id}">${view.build.core.includes(shown.piece.id) ? t("Remove the core mark") : t("Mark as core item")}</button>` : ""}${shown.kind === "item" && view.usedItems().has(shown.piece.id) ? `<button type="button" class="btn btn--sm btn--danger" data-remove-item="${shown.piece.id}">${icon("trash", "i--sm")}${t("Remove from the build")}</button>` : ""}</div></section>`;
}

/**
 * The pieces of the build as large framed tiles: the six items in three columns with the two spells
 * beside them, then the utility and the late-game slots. A free slot is a dashed tile with a plus.
 */
export function slotsPanel(view) {
  const idx = view.index();
  const free = () => `<span class="build-slot slot-free" aria-hidden="true">${icon("plus")}</span>`;
  const items = (name, ids) => {
    const filled = ids
      .map(id => idx.items.get(id))
      .filter(Boolean)
      .map(item =>
        slotButton("item", item, {
          size: 96,
          escapeHtml,
          active: view.info === `item:${item.id}`,
          core: view.build.core.includes(item.id)
        })
      );
    return [
      ...filled,
      ...Array.from({ length: Math.max(0, SLOTS[name] - filled.length) }, free)
    ].join("");
  };
  const spellIds = view.build.spells.filter(id => idx.spells.has(id));
  const spells = [
    ...spellIds.map(id =>
      slotButton("spell", idx.spells.get(id), {
        size: 96,
        escapeHtml,
        active: view.info === `spell:${id}`
      })
    ),
    ...Array.from({ length: Math.max(0, SPELLS_MAX - spellIds.length) }, free)
  ].join("");
  const head = (label, count, max) =>
    `<div class="lb-head"><span class="build-group-label">${label}</span><em>${count}/${max}</em></div>`;
  const legend = view.build.core.length
    ? `<p class="core-legend"><span class="core-mark core-mark-inline" aria-hidden="true">★</span> ${t("Core items")}</p>`
    : "";
  return `<div class="build-view lb-build">${legend}<div class="lb-top"><div class="build-group lb-items">${head(groupLabel("items"), view.build.items.length, SLOTS.items)}<div class="build-slots lb-tiles">${items("items", view.build.items)}</div></div><div class="build-group build-group--spells lb-spells">${head(groupLabel("spells"), spellIds.length, SPELLS_MAX)}<div class="build-slots lb-tiles">${spells}</div></div></div><div class="lb-pair"><div class="build-group lb-utility">${head(groupLabel("utility"), view.build.utility.length, SLOTS.utility)}<div class="build-slots lb-tiles">${items("utility", view.build.utility)}</div></div><div class="build-group lb-late">${head(groupLabel("late"), view.build.late.length, SLOTS.late)}<div class="build-slots lb-tiles">${items("late", view.build.late)}</div></div></div></div>`;
}

/** What is wrong with the build that was set (nothing while it is fine). */
export function errorLine(view) {
  return `<p class="form-error" role="alert">${escapeHtml(view.error)}</p>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { arcanaEditor, buildCard, detailsCard, slotsPanel, errorLine };
