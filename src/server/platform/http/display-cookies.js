import {
  DEFAULT_THEME,
  DIRECTION_COOKIE,
  THEME_COLORS,
  THEME_COOKIE,
  isDirection,
  isTheme
} from "../../../shared/display-options.js";
import { directionOf, readCookie } from "../../../shared/i18n.js";

/**
 * The theme and the text direction of a request: the visitor's cookies, else dark and the direction
 * of the language.
 */
export function requestDisplay(request, language) {
  const saved = name => readCookie(request.headers.cookie, name);
  const theme = isTheme(saved(THEME_COOKIE)) ? saved(THEME_COOKIE) : DEFAULT_THEME;
  const forced = saved(DIRECTION_COOKIE);
  return {
    theme,
    themeColor: THEME_COLORS[theme],
    direction: isDirection(forced) ? forced : directionOf(language)
  };
}
