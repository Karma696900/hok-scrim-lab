// The tabs of the page of a hero and the address that names the open one.
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";

// ---- the tabs -----------------------------------------------------------------------------------

/** The tabs, in order: key, the id of its panel. */
export const HERO_TABS = [
  ["overview", "hero-overview"],
  ["skills", "hero-skills"],
  ["combos", "hero-combos"],
  ["builds", "hero-builds"],
  ["competitive", "hero-competitive"],
  ["patches", "hero-patches"],
  ["artwork", "hero-artwork"]
];

const TAB_KEYS = HERO_TABS.map(([key]) => key);

export const tabLabel = key =>
  ({
    overview: t("Overview"),
    skills: t("Skills"),
    combos: t("Combos"),
    builds: t("Builds"),
    competitive: t("Competitive"),
    patches: t("Patch history"),
    artwork: t("Artwork")
  })[key];

export const tabFromHash = () => {
  const wanted = decodeURIComponent(location.hash.slice(1));
  return TAB_KEYS.includes(wanted) ? wanted : "overview";
};

/** The tab that is open: it stays while the person walks from one hero to the next. */
export let activeTab = "overview";

/** A sheet that opens starts on the tab the address names. */
export function resetActiveTab() {
  activeTab = tabFromHash();
}

export const syncHash = () => {
  if (state.view !== "hero") {
    return;
  }
  const wanted = activeTab === "overview" ? "" : `#${activeTab}`;
  if (location.hash !== wanted) {
    history.replaceState(null, "", `${location.pathname}${location.search}${wanted}`);
  }
};

/**
 * Opens a tab: the others are hidden, the bar and the address follow. `scroll` brings the start of
 * the panel just under the bar when the person is further down the page.
 */
export function showHeroTab(tab, { scroll = false, focus = false } = {}) {
  activeTab = TAB_KEYS.includes(tab) ? tab : "overview";
  for (const button of document.querySelectorAll("#view .hero-tabs [role='tab']")) {
    const on = button.dataset.tab === activeTab;
    button.classList.toggle("on", on);
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
    if (on) {
      if (focus) {
        button.focus({ preventScroll: true });
      }
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  for (const panel of document.querySelectorAll("#view .hs-panel")) {
    panel.hidden = panel.dataset.panel !== activeTab;
  }
  syncHash();
  const scene = document.querySelector("#hero-top");
  if (scroll && scene) {
    const topbar = document.querySelector(".topbar")?.offsetHeight ?? 0;
    // the bar is stuck under the top bar: the new tab starts right under it, not somewhere in the middle
    if (scene.getBoundingClientRect().bottom <= topbar) {
      window.scrollTo({ top: scene.offsetTop + scene.offsetHeight - topbar, behavior: "instant" });
    }
  }
}
