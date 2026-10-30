import { escapeHtml } from "../../lib/dom.js";

// The avatar shown next to a player's name: their photo, or the mark of the site on a blue disc.

/** The avatar of a person, `size` pixels wide (one of the sizes of components/sizes.css). */
export function avatarMarkup(user, size = 36) {
  if (user.picture) {
    return `<span class="pt s-${size}"><img src="${escapeHtml(user.picture)}" alt="" width="${size}" height="${size}" decoding="async" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="pt avatar s-${size}"><img src="/logo.svg" alt="" width="${size}" height="${size}"></span>`;
}
