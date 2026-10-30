// What is said when a piece is looked at.
import { escapeHtml } from "../../lib/escape.js";
import { heroFacts } from "../../../shared/condition-model.js";
import { pieceTip } from "./build-lab-view.js";

// ---- what is said when a piece is looked at --------------------------------------------------------

export const tip = view => view.root.querySelector("#lb-tip");

export function hideTip(view) {
  const box = view.tip();
  if (box) {
    box.hidden = true;
    box.replaceChildren();
  }
}

/** What a piece gives, beside it: stats, passives and actives, whether they apply to the hero of the build. */
export function showTip(view, element) {
  const reference = element.dataset.add ?? element.dataset.piece;
  const shown = reference && view.workbench.lookup(reference);
  const box = view.tip();
  if (!shown || !box) {
    return;
  }
  box.innerHTML = pieceTip(shown.kind, shown.piece, view.catalog, escapeHtml, {
    facts: heroFacts(view.hero(), view.sheet?.profile ?? null, view.level)
  });
  box.hidden = false;
  const at = element.getBoundingClientRect();
  const size = box.getBoundingClientRect();
  // beside the piece; for a piece of the sheet, on the left of the whole sheet so that it covers no other tile
  const edge = element.closest(".bl-side")?.getBoundingClientRect();
  const room = window.innerWidth;
  const beside = edge
    ? edge.left - 12 - size.width
    : at.right + 12 + size.width <= room - 8
      ? at.right + 12
      : at.left - 12 - size.width;
  box.style.setProperty("--tip-x", `${Math.max(8, Math.round(beside))}px`);
  box.style.setProperty(
    "--tip-y",
    `${Math.max(8, Math.round(Math.min(at.top, window.innerHeight - size.height - 8)))}px`
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { tip, hideTip, showTip };
