// Writing the guide page into the document.
import { fillSceneArt } from "../../domain/scene-art.js";
import { skeleton } from "../../lib/skeleton.js";
import { t } from "../../app/browser-i18n.js";

/** Draws the combos again (not the rest of the page) and puts the focus on the first selector found. */
export function paintCombos(view, focus = []) {
  const holder = view.root.querySelector("#cb-root");
  if (!holder) {
    return;
  }
  holder.innerHTML = view.comboEditor.html();
  for (const selector of focus) {
    const target = holder.querySelector(selector);
    if (target) {
      target.focus();
      return;
    }
  }
}

export function paintSide(view) {
  const side = view.root.querySelector("#bed-side");
  const scroll = side.querySelector("#bed-list")?.scrollTop ?? 0;
  side.innerHTML = view.listCard();
  side.querySelector("#bed-list").scrollTop = scroll;
  view.paintStage();
}

/** Another hero is open: the marks move in the list, which is not drawn again (120 buttons). */
export function markOpenHero(view) {
  for (const button of view.root.querySelectorAll("#bed-list .bed-hero")) {
    const on = button.dataset.bedHero === view.heroId;
    button.classList.toggle("active", on);
    button.setAttribute("aria-current", String(on));
  }
  view.paintStage();
}

export const paintMain = view => {
  const scroll = view.root.querySelector("#lab-grid")?.scrollTop ?? 0;
  view.root.querySelector("#bed-main").innerHTML = view.mainHtml();
  const grid = view.root.querySelector("#lab-grid");
  if (grid) {
    grid.scrollTop = scroll;
  }
};

/**
 * The page, in one drawing. `frame`: before the data of the page (the stage, the list of heroes as the roster gives
 * it, a skeleton in place of what is open), which the server draws too for a person who is signed in.
 */
export function paint(view, frame = false, opening = false) {
  const markup = `<div id="bed-stage">${view.stage()}</div>
      <div class="bed">
        <aside id="bed-side">${view.listCard()}</aside>
        <div class="bed-main stack-y" id="bed-main">${frame ? skeleton("page") : opening ? view.LOADING : view.mainHtml()}</div>
      </div>`;
  if (frame) {
    view.root.paintFrame(markup);
  } else {
    view.root.innerHTML = markup;
  }
  fillSceneArt(view.root.querySelector("#bed-stage .ws-stage__art"), view.stageHero());
  view.entered = true;
}

// ---- events -----------------------------------------------------------------------------------

/** The rules and the save button follow what is typed, without redrawing the field being typed in. */
export function refreshChecks(view) {
  view.root.querySelector("#bed-checks").innerHTML = view.checksHtml();
  view.root.querySelector("[data-bed-save]").disabled = !view.canSave();
  view.root.querySelector("#bed-dirty").textContent = view.dirty ? t("Changes not saved yet") : "";
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { paintCombos, paintSide, markOpenHero, paintMain, paint, refreshChecks };
