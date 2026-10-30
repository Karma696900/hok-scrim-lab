import { icon } from "../../shared/icons.js";
import { escapeHtml } from "../lib/dom.js";

// Menus anchored under a button of the top bar: the language list, the notifications, the account
// menu. One is open at a time; a click outside, Escape or a choice closes it.

let open = null;

/** Closes the menu that is open, if any. */
export function closeMenu({ focus = false } = {}) {
  if (!open) {
    return;
  }
  const { anchor, pop, stop } = open;
  open = null;
  stop();
  pop.remove();
  anchor.setAttribute("aria-expanded", "false");
  if (focus) {
    anchor.focus();
  }
}

/** The markup of the entries of a menu: { id, icon, label, hint, danger, href } or "-" for a rule. */
export function menuItems(items) {
  return items
    .map(item => {
      if (item === "-") {
        return `<div class="pop__sep" role="separator"></div>`;
      }
      const attributes = `class="pop__item${item.danger ? " danger" : ""}" role="menuitem" data-pick="${escapeHtml(item.id)}"${item.lang ? ` lang="${escapeHtml(item.lang)}"` : ""}`;
      const inner = `${item.icon ? icon(item.icon) : ""}<span>${escapeHtml(item.label)}</span>${item.hint ? `<small>${escapeHtml(item.hint)}</small>` : ""}`;
      return item.href
        ? `<a ${attributes} href="${escapeHtml(item.href)}">${inner}</a>`
        : `<button type="button" ${attributes}>${inner}</button>`;
    })
    .join("");
}

/**
 * Opens a menu under `anchor` (a second click on the anchor closes it). `html` is the content of
 * the menu; `onPick(id, element)` is called with the `data-pick` of the entry that was chosen;
 * `className` adds a class to the menu (its width, for instance).
 * Returns the menu element, or null when this click closed it.
 */
export function openMenu(anchor, html, { onPick, label = "", className = "" } = {}) {
  const wasOpen = open?.anchor === anchor;
  closeMenu();
  if (wasOpen) {
    return null;
  }
  const pop = document.createElement("div");
  pop.className = className ? `pop ${className}` : "pop";
  pop.setAttribute("role", "menu");
  if (label) {
    pop.setAttribute("aria-label", label);
  }
  pop.innerHTML = html;
  document.body.append(pop);

  const place = () => {
    const rect = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const rtl = document.documentElement.dir === "rtl";
    pop.style.top = `${rect.bottom + 8}px`;
    pop.style.maxHeight = `${Math.max(160, innerHeight - rect.bottom - 16)}px`;
    const left = rtl ? rect.left : rect.right - width;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`;
  };
  place();
  anchor.setAttribute("aria-expanded", "true");

  const items = () => [...pop.querySelectorAll("[data-pick]")];
  const outside = event => {
    if (!pop.contains(event.target) && !anchor.contains(event.target)) {
      closeMenu();
    }
  };
  const keys = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ focus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };
  const choose = event => {
    const item = event.target.closest("[data-pick]");
    if (!item) {
      return;
    }
    closeMenu();
    onPick?.(item.dataset.pick, item, event);
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keys);
  addEventListener("resize", place);
  pop.addEventListener("click", choose);
  open = {
    anchor,
    pop,
    stop() {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keys);
      removeEventListener("resize", place);
    }
  };
  items()[0]?.focus({ preventScroll: true });
  return pop;
}
