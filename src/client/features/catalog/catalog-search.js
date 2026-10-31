// Choosing by name in the forms of the Catalog: a stat or a tag is typed and picked from the names that
// match (a "combo"), and a long list of boxes (tags, heroes) has a search field that hides the others. The
// search ignores capitals and accents ("degats" finds "Dégâts") and never draws the page again.
import { escapeHtml as esc } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";

/** The text as the search compares it: lower case, without accents. */
export const fold = text =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * A choice typed by name: the id travels in a hidden field named `name` (so that the form is read as
 * before), the person types in the visible one. `options` is a list of [value, label]. With `repaint`,
 * choosing another value redraws the form (the hidden field sends `change`, as a select did).
 */
export function comboField({ name, options, selected, label, repaint = false, className = "" }) {
  // like a select: when nothing matches, the first name is the one taken
  const current = options.find(([value]) => String(value) === String(selected)) ?? options[0];
  const list = options
    .map(
      ([value, text]) =>
        `<li role="option" data-value="${esc(String(value))}"${String(value) === String(current?.[0]) ? ` aria-selected="true"` : ""}>${esc(text)}</li>`
    )
    .join("");
  return `<div class="field name-pick ${className}" data-name-pick>
      <input type="hidden" name="${esc(name)}" value="${esc(String(current?.[0] ?? ""))}"${repaint ? " data-repaint" : ""}>
      <input class="name-pick__input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" data-name-pick-input="${esc(name)}" value="${esc(current?.[1] ?? "")}" placeholder="${esc(label)}" aria-label="${esc(label)}">
      <ul class="name-pick__list" role="listbox" aria-label="${esc(label)}" hidden>${list}</ul>
    </div>`;
}

/** A search field over a list of boxes; the ticked boxes come first and stay visible. */
export function boxFilter(label, boxes, chosen) {
  return `<div class="box-search" data-box-search>
      <div class="box-search__head"><input class="box-search__input" type="search" autocomplete="off" data-box-filter placeholder="${esc(label)}" aria-label="${esc(label)}"><span class="box-search__count" data-box-count>${chosenLabel(chosen)}</span></div>
      ${boxes}
    </div>`;
}

const chosenLabel = count =>
  count ? t("{count, plural, one {# chosen} other {# chosen}}", { count }) : "";

// ---- the combo ---------------------------------------------------------------------------------------

const parts = input => {
  const holder = input.closest("[data-name-pick]");
  return {
    holder,
    hidden: holder.querySelector('input[type="hidden"]'),
    list: holder.querySelector(".name-pick__list")
  };
};

/** Brings a name of the list into view inside the list only (the panel around it does not move). */
function reveal(list, item) {
  if (!item) {
    return;
  }
  if (item.offsetTop < list.scrollTop) {
    list.scrollTop = item.offsetTop;
  } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }
}

const shown = list => [...list.querySelectorAll("li")].filter(item => !item.hidden);

function open(input, isOpen) {
  const { list } = parts(input);
  list.hidden = !isOpen;
  input.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) {
    list.querySelector(".is-active")?.classList.remove("is-active");
  }
}

function filter(input) {
  const { list } = parts(input);
  const wanted = fold(input.value);
  delete list.dataset.moved;
  let first = null;
  for (const item of list.querySelectorAll("li")) {
    item.hidden = Boolean(wanted) && !fold(item.textContent).includes(wanted);
    item.classList.remove("is-active");
    if (!item.hidden && !first) {
      first = item;
    }
  }
  first?.classList.add("is-active"); // Enter takes the first name that matches
  open(input, Boolean(first));
  list.scrollTop = 0;
}

/** Whether the text typed is exactly one of the names (then it counts as chosen). */
const exact = input =>
  [...parts(input).list.querySelectorAll("li")].find(
    item => fold(item.textContent) === fold(input.value)
  );

function settle(input) {
  input.setCustomValidity(exact(input) ? "" : t("Choose a name from the list."));
}

function choose(input, item) {
  const { hidden } = parts(input);
  input.value = item.textContent;
  input.setCustomValidity("");
  open(input, false);
  if (hidden.value !== item.dataset.value) {
    hidden.value = item.dataset.value;
    for (const entry of parts(input).list.querySelectorAll("li")) {
      entry.toggleAttribute("aria-selected", entry === item);
    }
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** Chooses a name; in a line of stats the cursor then goes on to the value. */
function chooseAndGoOn(input, item) {
  const key = input.dataset.namePickInput;
  choose(input, item); // the form may have been drawn again: the field is found anew
  document
    .querySelector(`[data-name-pick-input="${CSS.escape(key)}"]`)
    ?.closest(".stat-row")
    ?.querySelector('input[name$="-value"], select[name$="-option"]')
    ?.focus({ preventScroll: true });
}

/** Typing in a combo or in the search of a list of boxes. True when the event was one of theirs. */
export function onSearchInput(event) {
  const target = event.target;
  if (target.matches?.("[data-name-pick-input]")) {
    filter(target);
    settle(target);
    return true;
  }
  if (target.matches?.("[data-box-filter]")) {
    const wanted = fold(target.value);
    const holder = target.closest("[data-box-search]");
    for (const box of holder.querySelectorAll("label")) {
      const ticked = box.querySelector("input")?.checked;
      box.hidden = Boolean(wanted) && !ticked && !fold(box.textContent).includes(wanted);
    }
    // a group of tags with none of its tags left in view goes too, its name with it
    for (const group of holder.querySelectorAll("[data-tag-group]")) {
      group.hidden = !group.querySelector("label:not([hidden])");
    }
    return true;
  }
  return false;
}

/** A box ticked or unticked in a list with a search: its count follows. */
export function onSearchChange(event) {
  const holder = event.target.closest?.("[data-box-search]");
  if (!holder || event.target.type !== "checkbox") {
    return false;
  }
  holder.querySelector("[data-box-count]").textContent = chosenLabel(
    holder.querySelectorAll('label input[type="checkbox"]:checked').length
  );
  return true;
}

/** The keys of a combo (arrows, Enter, Escape), and Enter in a search field: none of them sends the form. */
export function onSearchKeydown(event) {
  const target = event.target;
  if (target.matches?.("[data-box-filter]") && event.key === "Enter") {
    event.preventDefault();
    return true;
  }
  if (!target.matches?.("[data-name-pick-input]")) {
    return false;
  }
  const { list } = parts(target);
  const items = shown(list);
  const active = list.querySelector(".is-active");
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (list.hidden) {
      filter(target);
      return true;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(items.indexOf(active) + step + items.length) % items.length];
    active?.classList.remove("is-active");
    next?.classList.add("is-active");
    list.dataset.moved = ""; // chosen with the arrows: Enter takes that one
    reveal(list, next);
    return true;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    // the name typed in full, unless another was chosen with the arrows; else the first that matches
    const moved = !list.hidden && list.dataset.moved !== undefined && active;
    const pick = moved || exact(target) || (!list.hidden && active);
    if (pick) {
      chooseAndGoOn(target, pick);
    }
    return true;
  }
  if (event.key === "Escape" && !list.hidden) {
    event.preventDefault();
    open(target, false);
    return true;
  }
  return false;
}

/** A name clicked in the list (on pointer down, so that the field keeps the focus). */
export function onSearchPointer(event) {
  const item = event.target.closest?.(".name-pick__list li");
  if (!item) {
    return false;
  }
  event.preventDefault();
  chooseAndGoOn(item.closest("[data-name-pick]").querySelector("[data-name-pick-input]"), item);
  return true;
}

/** Entering a combo: its text is selected (typing replaces it) and every name is offered. */
export function onSearchFocusIn(event) {
  const target = event.target;
  if (!target.matches?.("[data-name-pick-input]") || target.dataset.quiet !== undefined) {
    return;
  }
  target.select();
  const { list } = parts(target);
  for (const item of list.querySelectorAll("li")) {
    item.hidden = false;
    item.classList.toggle("is-active", item.hasAttribute("aria-selected"));
  }
  open(target, true);
  reveal(list, list.querySelector(".is-active"));
}

/** Leaving a combo: a name typed in full counts as chosen; otherwise the field stays marked. */
export function onSearchFocusOut(event) {
  const target = event.target;
  if (!target.matches?.("[data-name-pick-input]")) {
    return;
  }
  open(target, false);
  const match = exact(target);
  if (match) {
    choose(target, match);
  }
  settle(target);
}

/** The first combo whose text is not one of its names, if any (the form is not saved then). */
export const unchosen = root =>
  [...root.querySelectorAll("[data-name-pick-input]")].find(input => !exact(input));
