// draft editor, small helpers: used, rows, ensureDialog, clone, and 4 more.
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

// Classic: both sides may take the same hero, so only the heroes of the side being edited are
// taken.
export const used = view =>
  view.target.draft.gameMode === "classic"
    ? new Set(view.draft.picks[view.active.side].filter(Boolean))
    : new Set(
        Object.values(view.draft)
          .flatMap(group => Object.values(group).flat())
          .filter(Boolean)
      );

export const rows = view =>
  view.target.draft.picksOnly ? ROWS.filter(row => row.kind === "picks") : ROWS; // no bans to correct in a picks-only draft

export function ensureDialog(view) {
  if (view.dialog) {
    return view.dialog;
  }
  view.dialog = document.createElement("dialog");
  view.dialog.id = "draft-editor";
  view.dialog.className = "dialog dialog--wide draft-editor";
  view.dialog.setAttribute("aria-labelledby", "draft-editor-title");
  view.dialog.addEventListener("click", event => {
    const action = event.target.closest("[data-editor]");
    if (!action) {
      return;
    }
    const [name, a, b, c] = action.dataset.editor.split(":");
    if (name === "slot") {
      view.active = { side: a, kind: b, index: Number(c) };
      view.paint();
    } else if (name === "clear") {
      view.draft[a][b][Number(c)] = null;
      view.paint();
    } else if (name === "pick") {
      view.assign(action.dataset.heroId);
    } else if (name === "cancel") {
      view.dialog.close();
    } else if (name === "reset") {
      view.draft = clone(view.target.original);
      view.paint();
    }
  });
  view.dialog.addEventListener("input", event => {
    if (event.target.id !== "draft-editor-search") {
      return;
    }
    view.search = event.target.value;
    const caret = event.target.selectionStart;
    view.paint();
    const input = view.dialog.querySelector("#draft-editor-search");
    input.focus();
    input.setSelectionRange(caret, caret);
  });
  view.dialog.addEventListener("submit", async event => {
    event.preventDefault();
    const button = view.dialog.querySelector('button[type="submit"]');
    const error = view.dialog.querySelector("#draft-editor-error");
    button.disabled = true;
    error.textContent = "";
    const compact = group =>
      Object.fromEntries(["blue", "red"].map(side => [side, group[side].filter(Boolean)]));
    // Bans keep their positions (an empty slot in the middle is a ban nobody made); trailing
    // empties are dropped.
    const positional = group =>
      Object.fromEntries(
        ["blue", "red"].map(side => {
          const list = [...group[side]];
          while (list.length && !list.at(-1)) {
            list.pop();
          }
          return [side, list];
        })
      );
    try {
      await view.onSave(view.target, {
        bans: positional(view.draft.bans),
        picks: compact(view.draft.picks)
      });
      view.dialog.close();
    } catch (failure) {
      error.textContent = failure.message;
      button.disabled = false;
    }
  });
  document.body.append(view.dialog);
  return view.dialog;
}

export const clone = value => JSON.parse(JSON.stringify(value));

export const pad = list => Array.from({ length: 5 }, (_, index) => list[index] ?? null);

export function assign(view, heroId) {
  if (view.used().has(heroId)) {
    return;
  }
  view.draft[view.active.kind === "bans" ? "bans" : "picks"][view.active.side][view.active.index] =
    heroId;
  // move to the next empty slot of the same row, else stay
  const row = view.draft[view.active.kind][view.active.side];
  const next = row.findIndex((value, index) => !value && index > view.active.index);
  if (next >= 0) {
    view.active = { ...view.active, index: next };
  }
  view.paint();
}

export function slotMarkup(view, { side, kind }, heroId, index) {
  const hero = heroId ? view.getHero(heroId) : null;
  const isActive =
    view.active.side === side && view.active.kind === kind && view.active.index === index;
  const name = hero ? hero.displayName || hero.name : t("Empty");
  return `<div class="editor-slot-wrap"><button type="button" class="editor-slot ${side}${isActive ? " active" : ""}${hero ? " filled" : ""}" data-editor="slot:${side}:${kind}:${index}" aria-label="${escapeHtml(`${slotLabel(side, kind, index + 1)}: ${name}`)}" aria-pressed="${isActive}">${hero ? view.imageMarkup(hero) : `<span>${index + 1}</span>`}</button>${hero ? `<button type="button" class="editor-clear" data-editor="clear:${kind}:${side}:${index}" aria-label="${t("Clear {name}", { name: escapeHtml(name) })}">${t("×")}</button>` : ""}</div>`;
}

export function paint(view) {
  const taken = view.used();
  const needle = view.search.trim().toLocaleLowerCase();
  const heroes = view
    .getHeroes()
    .filter(
      hero => !needle || (hero.displayName || hero.name).toLocaleLowerCase().includes(needle)
    );
  view.dialog.innerHTML = `<form class="draft-editor-form" autocomplete="off">
      <div class="dialog__head"><div><h2 id="draft-editor-title">${t("Correct a draft")}</h2><p>${escapeHtml(view.target.title)}</p></div><button type="button" class="btn btn--ghost btn--icon btn--sm" data-editor="cancel" aria-label="${t("Close")}">${icon("x", "i--sm")}</button></div>
      <p class="muted editor-note">${icon("info", "i--sm")}<span>${t("Pick a slot, then the hero that should be there. Statistics, exports and history use the corrected draft.")}${view.target.rule ? ` ${escapeHtml(view.target.rule)}` : ""}</span></p>
      <div class="editor-body">
        <div class="editor-rows">${view
          .rows()
          .map(
            row =>
              `<div class="editor-row"><span class="editor-row-label ${row.side}">${rowLabel(row)}</span><div class="editor-slots">${view.draft[row.kind][row.side].map((heroId, index) => view.slotMarkup(row, heroId, index)).join("")}</div></div>`
          )
          .join("")}</div>
        <div class="editor-picker">
          <label class="label">${t("Hero for {slot}", { slot: escapeHtml(slotLabel(view.active.side, view.active.kind, view.active.index + 1)) })}<span class="field field--search"><input id="draft-editor-search" type="search" placeholder="${t("Search hero")}" value="${escapeHtml(view.search)}"></span></label>
          <div class="editor-grid">${heroes.map(hero => `<button type="button" class="editor-hero" data-editor="pick" data-hero-id="${escapeHtml(hero.id)}" ${taken.has(hero.id) ? "disabled" : ""} title="${escapeHtml(hero.displayName || hero.name)}${taken.has(hero.id) ? t("(already in this draft)") : ""}">${view.imageMarkup(hero)}<span>${escapeHtml(hero.displayName || hero.name)}</span></button>`).join("") || `<p class="muted">${t("No hero matches.")}</p>`}</div>
        </div>
      </div>
      <p id="draft-editor-error" class="form-error" role="alert"></p>
      <div class="dialog__foot"><button type="button" class="btn btn--ghost" data-editor="reset">${t("Undo changes")}</button><button type="button" class="btn" data-editor="cancel">${t("Cancel")}</button><button type="submit" class="btn btn--primary">${icon("check")}${t("Save corrections")}</button></div>
    </form>`;
}

const ROWS = [
  { side: "blue", kind: "bans" },
  { side: "blue", kind: "picks" },
  { side: "red", kind: "bans" },
  { side: "red", kind: "picks" }
];

const sideName = side => (side === "blue" ? t("Blue") : t("Red"));

const rowLabel = ({ side, kind }) =>
  side === "blue"
    ? kind === "bans"
      ? t("Blue bans")
      : t("Blue picks")
    : kind === "bans"
      ? t("Red bans")
      : t("Red picks");

const slotLabel = (side, kind, number) =>
  kind === "bans"
    ? t("{side} ban {number}", { side: sideName(side), number })
    : t("{side} pick {number}", { side: sideName(side), number });

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { used, rows, ensureDialog, assign, slotMarkup, paint };
