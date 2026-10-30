// The rules of an editor of the guides, one line each: what is left to do before it can be saved (builds and combos).
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";

/** `view.checks()` gives `{ ok, text }` lines. */
export function checksHtml(view) {
  return `<ul class="bed-checks">${view
    .checks()
    .map(
      check =>
        `<li class="${check.ok ? "ok" : "todo"}">${icon(check.ok ? "check" : "warn", "i--sm")}<span>${escapeHtml(check.text)}</span></li>`
    )
    .join("")}</ul>`;
}
