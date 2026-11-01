import { LANGUAGES, directionOf, isLanguage } from "../../shared/i18n.js";
import { changeLanguage } from "../app/language-address.js";
import { skeleton } from "../lib/skeleton.js";
import { icon } from "../../shared/icons.js";
import { api } from "../app/api-client.js";
import { applyTheme, currentTheme, markDirection } from "../app/display-preferences.js";
import { escapeHtml } from "../lib/dom.js";
import { currentLanguage, t } from "../app/browser-i18n.js";
import { changeSetting } from "../app/menu-preferences.js";
import { ago } from "../features/community/labels.js";
import {
  notificationIcon,
  notificationLink,
  notificationText
} from "../features/community/notifications.js";
import { loadPalette, openPalette } from "./open-palette.js";
import { menuItems, openMenu } from "./popover.js";

function languageMenu(button) {
  const current = currentLanguage();
  openMenu(
    button,
    menuItems(
      LANGUAGES.map(language => ({
        id: language.code,
        lang: language.code,
        label: language.name,
        icon: language.code === current ? "check" : undefined,
        hint: language.rtl ? "RTL" : ""
      }))
    ),
    {
      className: "pop--languages",
      label: t("Language"),
      onPick: code => {
        if (!isLanguage(code) || code === current) {
          return;
        }
        changeLanguage(code);
      }
    }
  );
}

/** The latest notifications under the bell, with real data: nothing is shown that is not stored. */
async function notificationsMenu(button) {
  const pop = openMenu(
    button,
    `<div class="pop__head"><div class="grow"><b>${t("Notifications")}</b></div></div>${skeleton("list", 3)}`,
    { className: "pop--notifications", label: t("Notifications") }
  );
  if (!pop) {
    return;
  }
  let items = [];
  try {
    ({ items } = await api("/api/notifications"));
  } catch {
    /* an empty list below */
  }
  if (!pop.isConnected) {
    return;
  }
  const unread = items.filter(item => !item.read).length;
  const latest = items.slice(0, 4);
  pop.innerHTML = `<div class="pop__head"><div class="grow"><b>${t("Notifications")}</b><small>${
    unread ? t("{count} unread", { count: unread }) : t("Everything is read")
  }</small></div>${unread ? `<button type="button" class="link" data-pick="read">${t("Mark all as read")}</button>` : ""}</div>${
    latest.length
      ? latest
          .map(
            item =>
              `<a class="pop__item pop__item--note" role="menuitem" href="${notificationLink(item)}" data-pick="open">${icon(notificationIcon(item.kind))}<span class="grow">${notificationText(item)}<small>${escapeHtml(ago(item.at))}</small></span>${item.read ? "" : '<i class="live-dot"></i>'}</a>`
          )
          .join("")
      : `<p class="muted pop__empty">${t("No notification yet.")}</p>`
  }<div class="pop__sep" role="separator"></div><a class="pop__item" role="menuitem" href="/inbox" data-pick="open">${icon("mail")}<span>${t("Open the inbox")}</span></a>`;
  pop.addEventListener("click", async event => {
    if (!event.target.closest('[data-pick="read"]')) {
      return;
    }
    event.stopPropagation();
    try {
      await api("/api/notifications/read", { method: "POST", body: {} });
      window.dispatchEvent(new Event("hok:community"));
    } catch {
      /* the list stays as it was */
    }
    pop.remove();
    button.setAttribute("aria-expanded", "false");
  });
}

const toggleTheme = () => changeSetting({ theme: currentTheme() === "light" ? "dark" : "light" });

export function installTopbar() {
  applyTheme(currentTheme());
  markDirection();

  document.querySelector("#language-button").addEventListener("click", event => {
    languageMenu(event.currentTarget);
  });
  document.querySelector("#topbar-notifications").addEventListener("click", event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    notificationsMenu(event.currentTarget);
  });
  document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  document.querySelector("#theme-switch").addEventListener("click", toggleTheme);
  for (const button of document.querySelectorAll("[data-direction]")) {
    button.addEventListener("click", () =>
      changeSetting({
        direction:
          button.dataset.direction === directionOf(currentLanguage())
            ? "auto"
            : button.dataset.direction
      })
    );
  }

  // The search field opens the palette: a click, the keyboard, or Ctrl K from anywhere. Its code is fetched when the page is
  // idle (or when the pointer comes near the field), not with the first paint.
  if ("requestIdleCallback" in window) {
    requestIdleCallback(loadPalette, { timeout: 8000 });
  } else {
    setTimeout(loadPalette, 4000);
  }
  const search = document.querySelector("#topbar-search");
  const field = document.querySelector("#topbar-search-input");
  field.addEventListener("focus", () => {
    field.blur();
    openPalette();
  });
  // the whole box, its icon too (on the narrowest phones the box is no more than its icon)
  search.addEventListener("pointerenter", loadPalette, { once: true });
  search.addEventListener("click", () => openPalette());
  search.addEventListener("submit", event => {
    event.preventDefault();
    openPalette();
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
    }
  });
}
