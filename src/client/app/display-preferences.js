import {
  DIRECTION_COOKIE,
  THEME_COLORS,
  THEME_COOKIE,
  isDirection,
  isTheme
} from "../../shared/display-options.js";
import { directionOf } from "../../shared/i18n.js";
import { icon } from "../../shared/icons.js";
import { t } from "./browser-i18n.js";

// How the page looks besides its language: the colour theme and the text direction. The server
// writes both on <html> from two cookies, so the first paint already has them; this module keeps
// the cookies, the page and the switches of the shell in step.

const root = document.documentElement;
const YEAR = 60 * 60 * 24 * 365;

const writeCookie = (name, value) => {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = value
    ? `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`
    : `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
};

export const currentTheme = () => (root.dataset.theme === "light" ? "light" : "dark");

/** "ltr" or "rtl": what the page is showing now. */
export const currentDirection = () => (root.dir === "rtl" ? "rtl" : "ltr");

/** Shows the theme: <html>, the browser bar colour, and the switches of the shell. */
export function applyTheme(theme) {
  const next = isTheme(theme) ? theme : "dark";
  const light = next === "light";
  if (root.dataset.theme !== next) {
    root.dataset.theme = next; // not rewritten when it is the one the server wrote (a rewrite restyles the whole page)
  }
  writeCookie(THEME_COOKIE, next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next]);

  const button = document.querySelector("#theme-toggle");
  if (button) {
    const label = light ? t("Switch to the dark theme") : t("Switch to the light theme");
    button.innerHTML = icon(light ? "moon" : "sun");
    button.setAttribute("aria-label", label);
  }
  document.querySelector("#theme-switch")?.classList.toggle("on", light);
  const label = document.querySelector("#theme-label");
  if (label) {
    label.textContent = light ? t("Dark mode") : t("Light mode");
  }
}

/** Shows on the LTR / RTL switch of the shell which direction the page has. */
export function markDirection() {
  for (const button of document.querySelectorAll("[data-direction]")) {
    button.setAttribute("aria-pressed", String(button.dataset.direction === currentDirection()));
  }
}

/** "auto" follows the language; "ltr" and "rtl" force the direction. */
export function applyDirection(choice, language = root.lang) {
  const direction = isDirection(choice) ? choice : directionOf(language);
  if (root.dir !== direction) {
    root.dir = direction;
  }
  writeCookie(DIRECTION_COOKIE, isDirection(choice) ? choice : "");
  markDirection();
}
