import { api } from "./api-client.js";
import { applyDirection, applyTheme } from "./display-preferences.js";
import { boot, takeBootstrap } from "./stylesheet-loading.js";
import { state } from "./app-state.js";

// What the person wants in their menu. The community is always shown; the optional parts the person
// switched off are only hidden (their addresses keep working). A visitor's choice lives in this
// browser, an account's on the server.
const readLocal = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const readLocalModules = () => {
  const stored = readLocal("hok.modules", null);
  return Array.isArray(stored) ? stored : null;
};

/**
 * A visitor's choices stay in this browser (an account's are on the server, the copy here only
 * avoids a flash on the next visit).
 */
export function saveLocal() {
  try {
    localStorage.setItem("hok.modules", JSON.stringify(state.modules ?? []));
    localStorage.setItem("hok.settings", JSON.stringify(state.settings));
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

/**
 * The settings that act on the whole page: reduced animations, the theme, the text direction, and
 * the starting choices of the new-series form. A theme or a direction nobody chose is left as the
 * page came (the visitor's cookies).
 */
export function applySettings() {
  document.documentElement.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  if (state.settings.theme) {
    applyTheme(state.settings.theme);
  }
  if (state.settings.direction) {
    applyDirection(state.settings.direction);
  }
  state.gameMode = state.settings.gameMode;
  state.draftMode = state.settings.draftMode;
}

export function applyModules() {
  const on = module => !state.modules || state.modules.includes(module);
  document.querySelectorAll("#main-nav [data-module], .tabbar [data-module]").forEach(link => {
    // a part that only works with an account (data-signed-in) is not offered to a visitor
    link.hidden = !on(link.dataset.module) || ("signedIn" in link.dataset && !state.auth.user);
  });
}

export async function loadPreferences() {
  const owner = state.auth.user?.id ?? "";
  if (state.prefsFor === owner) {
    return;
  }
  state.prefsFor = owner;
  if (owner) {
    try {
      // the server wrote them into the page it sent (platform/http/bootstrap.js): no request to wait for
      const written = takeBootstrap("prefs");
      const preferences =
        written && boot.b?.me?.user?.id === owner ? written : await api("/api/me/preferences");
      state.modules = preferences.modules;
      state.onboarded = preferences.onboarded;
      Object.assign(state.settings, preferences.settings);
    } catch {
      state.modules = null; // if the server cannot answer, show everything and do not interrupt
      state.onboarded = true;
    }
  } else {
    state.modules = readLocalModules();
    state.onboarded = true;
    Object.assign(state.settings, readLocal("hok.settings", {}));
  }
  applyModules();
  applySettings();
}

/**
 * One setting changed from the shell (the theme, the direction): shown at once, then kept on the
 * account, or in this browser for a visitor.
 */
export async function changeSetting(change) {
  Object.assign(state.settings, change);
  applySettings();
  if (!state.auth.user) {
    saveLocal();
    return;
  }
  try {
    await api("/api/me/preferences", { method: "PUT", body: { settings: change } });
  } catch {
    /* the choice still holds for this visit */
  }
}
