// The navigation: which entry (and which group) is the current one, the groups that open under the
// top bar, and the drawer they become on a phone (the Menu tab, the backdrop, a navigation and Escape
// all close it).

/** The entry of the menu that a page belongs to (a hero sheet is under Heroes, and so on). */
const MENU_ENTRY = {
  hero: "heroes",
  team: "teams",
  account: "settings",
  profile: "settings",
  "casino-roll": "casino"
};

export function highlightNavigation(view) {
  const entry = MENU_ENTRY[view] ?? view;
  for (const link of document.querySelectorAll("#main-nav .nav-link, .tabbar .tab[data-view]")) {
    const active = link.dataset.view === entry;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
  for (const group of document.querySelectorAll("#main-nav .nav-group")) {
    group.classList.toggle("active", Boolean(group.querySelector(".nav-link.active")));
  }
  closeGroups();
}

const sidebar = () => document.querySelector("#sidebar");

/** Closes the open group of the top bar, if any. */
function closeGroups(except = null) {
  for (const group of document.querySelectorAll("#main-nav .nav-group.open")) {
    if (group !== except) {
      group.classList.remove("open");
      group.querySelector(".nav-group__btn").setAttribute("aria-expanded", "false");
    }
  }
}

export const setMenu = open => {
  sidebar().classList.toggle("open", open);
  document.querySelector("#sidebar-backdrop").hidden = !open;
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", String(open));
};

export function installMenu() {
  document
    .querySelector("#menu-toggle")
    .addEventListener("click", () => setMenu(!sidebar().classList.contains("open")));

  document.querySelector("#sidebar-backdrop").addEventListener("click", () => setMenu(false));

  // a group opens on a click (or Enter, or Space); a click elsewhere closes it
  document.addEventListener("click", event => {
    const button = event.target.closest(".nav-group__btn");
    const group = button?.closest(".nav-group");
    closeGroups(group);
    if (group) {
      const open = group.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    }
    if (event.target.closest("#main-nav .nav-link")) {
      setMenu(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") {
      return;
    }
    const open = document.querySelector("#main-nav .nav-group.open");
    if (open) {
      open.querySelector(".nav-group__btn").focus();
      closeGroups();
    }
    if (sidebar().classList.contains("open")) {
      setMenu(false);
    }
  });
}
