// scenario editor, small helpers: show.
import { sideLabel } from "./training-shared.js";
import { number, t } from "../../app/browser-i18n.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as scenarioEditorPartsParts } from "./scenario-editor-parts.js";
import { onView as scenarioEditorPartsDrawn } from "./scenario-editor-cards.js";
import { onView as scenarioEditorPartsActions } from "./scenario-editor-actions.js";
import { draftOf } from "./scenario-editor-parts.js";

export function show(view, existing, maps) {
  const page = { existing, maps, view };
  bindTo(page, scenarioEditorPartsParts, scenarioEditorPartsDrawn, scenarioEditorPartsActions);
  page.root = page.view.kit.root();
  page.draft = draftOf(page);

  page.tool = { type: "hero", side: "blue", heroId: "", label: "" };
  page.selected = null;

  page.root.onclick = page.onClick;

  page.root.onchange = page.onChange;

  page.root.oninput = page.onInput;

  page.root.onpointerdown = page.onPointerdown;

  page.root.onkeydown = page.onKeydown;

  page.root.onsubmit = page.onSubmit;

  page.root.innerHTML = `${page.view.kit.chrome({
    zone: "scenarios",
    title: page.existing ? t("Edit the situation") : t("New situation"),
    text: t(
      "Choose a tool, then click the map. Drag a pin to move it; arrow keys nudge the selected pin."
    ),
    back: page.existing
      ? { href: `/training/scenarios/${page.existing.id}`, label: t("Back") }
      : { href: "/training/scenarios", label: t("Situations") },
    slim: true,
    entries: false,
    figures: [
      [number(page.draft.pins.length), t("Pins"), "sc-fig-pins"],
      [number(page.heroPins("blue").length), sideLabel("blue"), "sc-fig-blue"],
      [number(page.heroPins("red").length), sideLabel("red"), "sc-fig-red"]
    ]
  })}<div class="trn-scene trn-scene--edit" id="sc-layout"></div>`;
  page.view.kit.paintChrome();
  page.paint();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
