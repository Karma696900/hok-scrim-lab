// How a page is shown besides its language: the colour theme and the text direction. Both live in
// cookies, so the server can write them on <html> and the first paint already has the right ones.

export const THEME_COOKIE = "hok_theme";
export const DIRECTION_COOKIE = "hok_dir";

export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";
/** The colour of the browser bar on a phone, one per theme (the canvas of each). */
export const THEME_COLORS = { dark: "#0a111a", light: "#edf1f8" };

/** "auto" follows the language (right to left for Arabic); the other two force it. */
export const DIRECTIONS = ["auto", "ltr", "rtl"];

export const isTheme = value => THEMES.includes(value);
export const isDirection = value => value === "ltr" || value === "rtl";
