// How a build looks: pictures in slots, the details of a piece, and the stats it gives. Shared by
// the hero sheet (recommended builds) and the build lab. Everything is escaped here; the callers
// pass `escapeHtml`.
import { icon } from "../../../shared/icons.js";
import { evaluate } from "../../../shared/condition-model.js";
import { optionOf } from "../../../shared/stat-values.js";
import { temporaryText, whenText } from "../../domain/condition-text.js";
import { catalogImageAttrs, shopCategoryLabel } from "../../domain/catalog-display.js";
import { tx } from "../../domain/staff-content.js";
import { number, t } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import {
  ARCANA_COLORS,
  SLOTS,
  SPELLS_MAX,
  formatEntry,
  indexCatalog,
  sortArcana
} from "../../../shared/build-model.js";

// How a build looks: pictures in slots, the details of a piece, and the stats it gives. Shared by
// the hero sheet (recommended builds) and the build lab. Everything is escaped here; the callers
// pass `escapeHtml`.

export const colorLabel = color =>
  ({ red: t("Red"), blue: t("Blue"), green: t("Green") })[color] ?? color;
export const categoryLabel = category =>
  ({
    boots: t("Boots"),
    regular: t("Item"),
    utility: t("Utility item"),
    late: t("Late-game item")
  })[category] ?? category;
export const groupLabel = group =>
  ({ items: t("Items"), utility: t("Utility"), late: t("Late-game"), spells: t("Spells") })[
    group
  ] ?? group;

/** What is known of a spell, as one line: how long before it comes back, from which level (nothing is guessed). */
export const spellFacts = spell =>
  [
    spell.cooldownSeconds === null || spell.cooldownSeconds === undefined
      ? ""
      : `${t("Cooldown")}: ${t("{seconds} s", { seconds: number(spell.cooldownSeconds) })}`,
    spell.unlockLevel ? t("Unlocked at level {level}", { level: number(spell.unlockLevel) }) : ""
  ]
    .filter(Boolean)
    .join(" · ");

/** A tag as a small coloured label. */
export const tagChip = (tag, escapeHtml) =>
  `<span class="tag-chip tag-${escapeHtml(tag.color)}" title="${escapeHtml(tx(tag.description ?? ""))}">${escapeHtml(tx(tag.name))}</span>`;

/** The picture of an item or arcana (a placeholder when it has none). */
export const pieceImage = (piece, size, escapeHtml, className = "") =>
  piece.imageId
    ? `<img class="piece-image ${className}" ${catalogImageAttrs(piece.imageId, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="piece-image image-fallback ${className}"></span>`;

/**
 * One filled slot: the picture alone, the name is its accessible name and tooltip. Clicking asks
 * for the details.
 */
export function slotButton(
  kind,
  piece,
  { size = 48, count = null, escapeHtml, active = false, core = false }
) {
  const name = escapeHtml(tx(piece.name));
  const label = core ? `${name} ${t("(core item)")}` : name;
  return `<button type="button" class="build-slot slot-${kind} slot-size-${size}${active ? " active" : ""}${core ? " is-core" : ""}" data-piece="${kind}:${piece.id}" aria-label="${label}" title="${label}">${pieceImage(piece, size, escapeHtml)}${count ? `<span class="avatar-count">×${number(count)}</span>` : ""}${core ? `<span class="core-mark" aria-hidden="true">★</span>` : ""}</button>`;
}

const heroNameOf = id => {
  const hero = state.heroes.find(entry => entry.id === id);
  return hero ? hero.displayName || hero.name : id;
};

/** What the words of a condition need: the catalogue and the names of the heroes. */
const wordsFor = catalog => ({ index: indexCatalog(catalog), heroName: heroNameOf });

/**
 * What a line or an effect that depends on conditions is for this hero: "" when there is nothing to
 * say (no condition, or no hero to check them for), "is-off" when it does not apply, "is-unknown"
 * when it cannot be checked.
 */
const verdictClass = (when, facts) => {
  if (!when || !facts) {
    return "";
  }
  const holds = evaluate(when, facts);
  return holds === true ? "" : holds === false ? " is-off" : " is-unknown";
};

/** The sentence that says why a line or an effect is greyed. */
const verdictNote = (when, facts, escapeHtml) => {
  const holds = !when || !facts ? true : evaluate(when, facts);
  if (holds === true) {
    return "";
  }
  return `<small class="line-state">${escapeHtml(holds === false ? t("Does not apply to this hero.") : t("Cannot be checked: the data of this hero is incomplete."))}</small>`;
};

/**
 * What a piece gives, in the few lines of the tip that opens when it is looked at: its name, its stats and
 * its passives and actives, marked for the hero of the build like the details are. Its markup has classes of
 * its own, so that it is never taken for the details of the piece that is open.
 */
export function pieceTip(kind, piece, catalog, escapeHtml, { facts = null } = {}) {
  const index = indexCatalog(catalog);
  const words = wordsFor(catalog);
  const stats = (piece.stats ?? [])
    .map(line => {
      const stat = index.stats.get(line.statId);
      if (!stat) {
        return "";
      }
      const note = [
        line.temporary ? temporaryText(line) : "",
        line.when ? whenText(line.when, words) : ""
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li class="tip-stat${verdictClass(line.when, facts)}"><span>${escapeHtml(tx(stat.name))}</span><strong><bdi>${escapeHtml(formatEntry(stat, line, tx))}</bdi></strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</li>`;
    })
    .join("");
  const effects = (piece.effects ?? [])
    .map(
      effect =>
        `<div class="tip-effect${verdictClass(effect.when, facts)}"><b>${effect.kind === "active" ? t("Active") : t("Passive")}${effect.name ? ` · ${escapeHtml(tx(effect.name))}` : ""}</b><p>${escapeHtml(tx(effect.text))}</p></div>`
    )
    .join("");
  const meta =
    kind === "item"
      ? `${categoryLabel(piece.category)}${piece.shopCategory ? ` · ${shopCategoryLabel(piece.shopCategory)}` : ""}${piece.price ? ` · ${t("{price} gold", { price: number(piece.price) })}` : ""}`
      : kind === "spell"
        ? spellFacts(piece)
        : `${colorLabel(piece.color)} ${t("arcana")}`;
  return `<div class="lb-tip__body">${pieceImage(piece, 64, escapeHtml, "tip-image")}<div><h3>${escapeHtml(tx(piece.name))}</h3><p class="muted">${meta}</p>${piece.description ? `<p>${escapeHtml(tx(piece.description))}</p>` : ""}${stats ? `<ul class="tip-stats">${stats}</ul>` : ""}${effects}</div></div>`;
}

/**
 * The details of an item or an arcana: stats, passives and actives, tags. With `facts` (the hero
 * and its level: see heroFacts) what depends on conditions is marked for that hero; without, the
 * conditions are only written.
 */
export function pieceDetails(kind, piece, catalog, escapeHtml, { facts = null } = {}) {
  const index = indexCatalog(catalog);
  const words = wordsFor(catalog);
  const stats = (piece.stats ?? [])
    .map(line => {
      const stat = index.stats.get(line.statId);
      if (!stat) {
        return "";
      }
      const notes = [
        line.temporary ? `<small class="line-tag">${escapeHtml(temporaryText(line))}</small>` : "",
        line.note ? `<small class="line-note">${escapeHtml(tx(line.note))}</small>` : "",
        line.when
          ? `<small class="line-when">${escapeHtml(whenText(line.when, words))}</small>`
          : "",
        verdictNote(line.when, facts, escapeHtml)
      ].join("");
      return `<li class="piece-stat${verdictClass(line.when, facts)}"><span>${escapeHtml(tx(stat.name))}</span><strong>${escapeHtml(formatEntry(stat, line, tx))}</strong>${notes}</li>`;
    })
    .join("");
  const effects = (piece.effects ?? [])
    .map(
      effect =>
        `<div class="effect-line${verdictClass(effect.when, facts)}"><p><strong>${effect.kind === "active" ? t("Active") : t("Passive")}${effect.name ? ` · ${escapeHtml(tx(effect.name))}` : ""}</strong>${effect.cooldownSeconds ? ` <span class="muted">(${t("cooldown {seconds}s", { seconds: number(effect.cooldownSeconds) })})</span>` : ""}</p>${effect.when ? `<p class="line-when">${escapeHtml(whenText(effect.when, words))}</p>` : ""}<p>${escapeHtml(tx(effect.text))}</p>${verdictNote(effect.when, facts, escapeHtml)}</div>`
    )
    .join("");
  const tags = (piece.tags ?? [])
    .map(id => index.tags.get(id))
    .filter(Boolean)
    .map(tag => tagChip(tag, escapeHtml))
    .join("");
  const meta =
    kind === "item"
      ? `${categoryLabel(piece.category)}${piece.shopCategory ? ` · ${shopCategoryLabel(piece.shopCategory)}` : ""}${piece.price ? ` · ${t("{price} gold", { price: number(piece.price) })}` : ""}`
      : kind === "spell"
        ? spellFacts(piece)
        : `${colorLabel(piece.color)} ${t("arcana")}`;
  return `<div class="piece-details">${pieceImage(piece, 64, escapeHtml, "piece-image-big")}<div><h3>${escapeHtml(tx(piece.name))}</h3><p class="muted">${meta}</p>${piece.description ? `<p>${escapeHtml(tx(piece.description))}</p>` : ""}${stats ? `<ul class="stat-list">${stats}</ul>` : ""}${effects}${tags ? `<div class="tag-line">${tags}</div>` : ""}</div></div>`;
}

/**
 * The build as pictures: the six items, then the utility and late-game ones, then the arcana by
 * colour (biggest quantity first).
 */
export function buildMarkup(build, catalog, { escapeHtml, activePiece = null, freeSlots = false }) {
  const index = indexCatalog(catalog);
  const empty = (name, count) =>
    freeSlots
      ? Array.from(
          { length: Math.max(0, SLOTS[name] - count) },
          () =>
            `<span class="build-slot slot-free slot-size-${name === "items" ? 56 : 44}" aria-hidden="true">${icon("plus")}</span>`
        ).join("")
      : "";
  const group = (name, ids) =>
    ids.length || (freeSlots && name === "items")
      ? `<div class="build-group"><span class="build-group-label">${groupLabel(name)}</span><div class="build-slots">${ids
          .map(id => index.items.get(id))
          .filter(Boolean)
          .map(item =>
            slotButton("item", item, {
              size: name === "items" ? 56 : 44,
              escapeHtml,
              active: activePiece === `item:${item.id}`,
              core: (build.core ?? []).includes(item.id)
            })
          )
          .join("")}${empty(name, ids.length)}</div></div>`
      : "";
  const spellIds = (build.spells ?? []).filter(id => index.spells.has(id));
  const spellsGroup =
    spellIds.length || freeSlots
      ? `<div class="build-group build-group--spells"><span class="build-group-label">${groupLabel("spells")}</span><div class="build-slots">${spellIds
          .map(id =>
            slotButton("spell", index.spells.get(id), {
              size: 48,
              escapeHtml,
              active: activePiece === `spell:${id}`
            })
          )
          .join(
            ""
          )}${freeSlots ? Array.from({ length: Math.max(0, SPELLS_MAX - spellIds.length) }, () => `<span class="build-slot slot-free slot-size-48" aria-hidden="true">${icon("plus")}</span>`).join("") : ""}</div></div>`
      : "";
  const arcana = ARCANA_COLORS.map(color => {
    const entries = sortArcana(build.arcana[color] ?? [], index.arcana);
    return entries.length
      ? `<div class="build-group arcana-${color}"><span class="build-group-label">${colorLabel(color)}</span><div class="build-slots">${entries
          .map(
            entry =>
              index.arcana.get(entry.id) &&
              slotButton("arcana", index.arcana.get(entry.id), {
                size: 40,
                count: entry.count,
                escapeHtml,
                active: activePiece === `arcana:${entry.id}`
              })
          )
          .filter(Boolean)
          .join("")}</div></div>`
      : "";
  }).join("");
  return `<div class="build-view">${(build.core ?? []).length ? `<p class="core-legend"><span class="core-mark core-mark-inline" aria-hidden="true">★</span> ${t("Core items")}</p>` : ""}${group("items", build.items)}${group("utility", build.utility)}${group("late", build.late)}${spellsGroup}<div class="arcana-groups">${arcana}</div></div>`;
}

/**
 * Hero base + items + arcana, one row per stat, in two columns: the name and the total on the first line,
 * where the total comes from under them (the parts that are empty are not drawn). What is temporary is not in
 * the total: it is written under it, with an hourglass (what it is, and for how long, is in the notes below).
 * A real table, so that a screen reader reads it as one: the roles say so where the style lays it out as a grid.
 */
export function statsTable(rows, catalog, { escapeHtml }) {
  if (!rows.length) {
    return `<p class="muted">${t("No stat to show yet.")}</p>`;
  }
  const index = indexCatalog(catalog);
  const part = (label, content, className = "") =>
    content === null
      ? `<td class="r is-none" role="cell">—</td>`
      : `<td class="r${className}" role="cell" data-label="${escapeHtml(label)}"><bdi>${content}</bdi></td>`;
  const temporaryLine = text =>
    `<small class="stat-temp">${icon("hourglass", "i--sm")}<span class="visually-hidden">${t("Temporary")}: </span>${text}</small>`;
  const rowMarkup = row => {
    const stat = index.stats.get(row.statId);
    const name = `<th scope="row" role="rowheader">${escapeHtml(tx(stat.name))}</th>`;
    if (row.choice) {
      const option = id => escapeHtml(tx(optionOf(stat, id)?.name ?? "—"));
      const temporary = row.temporaryOptions.length
        ? temporaryLine(row.temporaryOptions.map(option).join(", "))
        : "";
      return `<tr role="row">${name}${part(t("Hero"), row.baseOption === null ? null : option(row.baseOption))}${part(t("Items"), row.fromPieces === null ? null : option(row.fromPieces), " plus")}<td class="r is-none" role="cell">—</td><td class="r" role="cell"><strong><bdi>${row.option === null ? "—" : option(row.option)}</bdi></strong>${temporary}</td></tr>`;
    }
    const plain = value =>
      `${number(Number(value.toFixed(2)))}${stat.unit === "percent" ? "%" : ""}`;
    const bonus = value => (value ? formatEntry(stat, { value }) : null);
    const counted = Boolean(row.base || row.items || row.arcana);
    const temporary = row.temporary
      ? temporaryLine(formatEntry(stat, { value: row.temporary }))
      : "";
    return `<tr role="row">${name}${part(t("Hero"), row.base ? plain(row.base) : null)}${part(t("Items"), bonus(row.items), " plus")}${part(t("Arcana"), bonus(row.arcana), " plus")}<td class="r" role="cell"><strong><bdi>${counted ? plain(row.total) : "—"}</bdi></strong>${temporary}</td></tr>`;
  };
  return `<table class="stats-table" role="table"><thead class="visually-hidden" role="rowgroup"><tr role="row"><th scope="col" role="columnheader">${t("Stat")}</th><th scope="col" role="columnheader" class="r">${t("Hero")}</th><th scope="col" role="columnheader" class="r">${t("Items")}</th><th scope="col" role="columnheader" class="r">${t("Arcana")}</th><th scope="col" role="columnheader" class="r">${t("Total")}</th></tr></thead><tbody role="rowgroup">${rows.map(rowMarkup).join("")}</tbody></table>`;
}

/**
 * What the table does not add up, with the reason, for the build and the hero it was made for:
 * the values that do not apply to the hero, the ones that cannot be checked, the temporary ones.
 * `hasHero` is whether the build has a hero (without one, what depends on it waits for one).
 */
export function statsNotes(notes, catalog, { escapeHtml, hasHero }) {
  const index = indexCatalog(catalog);
  const words = wordsFor(catalog);
  const line = ({ kind, id, count, entry }) => {
    const piece = (kind === "item" ? index.items : index.arcana).get(id);
    const stat = index.stats.get(entry.statId);
    if (!piece || !stat) {
      return "";
    }
    const parts = [
      entry.temporary ? escapeHtml(temporaryText(entry)) : "",
      entry.note ? escapeHtml(tx(entry.note)) : "",
      entry.when ? escapeHtml(whenText(entry.when, words)) : ""
    ].filter(Boolean);
    return `<li><b>${escapeHtml(tx(piece.name))}${count > 1 ? ` ×${number(count)}` : ""}</b> · ${escapeHtml(tx(stat.name))} <strong>${escapeHtml(formatEntry(stat, entry, tx))}</strong>${parts.length ? `<small>${parts.join(" · ")}</small>` : ""}</li>`;
  };
  const block = (title, list) =>
    list.length
      ? `<details class="stat-notes__block"><summary>${escapeHtml(title)}</summary><ul class="stat-notes__list">${list.map(line).join("")}</ul></details>`
      : "";
  return `${block(
    t(
      "{count, plural, one {# value does not apply to this hero} other {# values do not apply to this hero}}",
      {
        count: notes.skipped.length
      }
    ),
    notes.skipped
  )}${block(
    hasHero
      ? t(
          "{count, plural, one {# value cannot be checked: the data of the hero is incomplete} other {# values cannot be checked: the data of the hero is incomplete}}",
          {
            count: notes.unknown.length
          }
        )
      : t(
          "{count, plural, one {# value depends on the hero: choose one to count it} other {# values depend on the hero: choose one to count them}}",
          {
            count: notes.unknown.length
          }
        ),
    notes.unknown
  )}${block(
    t(
      "{count, plural, one {# temporary value, not in the total} other {# temporary values, not in the total}}",
      {
        count: notes.temporary.length
      }
    ),
    notes.temporary
  )}`;
}
