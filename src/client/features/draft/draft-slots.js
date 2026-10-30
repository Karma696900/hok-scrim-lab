// The slots of the bans and picks: the hero in a slot and its cover.
import { t } from "../../app/browser-i18n.js";
import { wide } from "../../../shared/media.js";
import { setClass } from "./draft-patch.js";

/** The wide cover of a picked hero fills its card (the portrait stays where the cover does not reach). */
export function showCover(view, element, heroId) {
  view.getCover(heroId).then(cover => {
    const art = element.querySelector(".slot-art");
    if (!cover || element.dataset.hero !== heroId || !art || art.querySelector(".pk-cover")) {
      return;
    }
    art.insertAdjacentHTML(
      "afterbegin",
      `<img class="pk-cover" ${wide(cover, [640, 960], "340px")} alt="" width="640" height="360" decoding="async">`
    );
    // the portrait stays until the cover is there
    const image = art.querySelector(".pk-cover");
    const show = () => element.classList.add("has-cover");
    if (image.complete) {
      show();
    } else {
      image.addEventListener("load", show, { once: true });
    }
  });
}

export function setSlot(view, element, heroId, description, animate) {
  const next = heroId || "";
  if (element.dataset.hero === next) {
    return;
  }
  const wasEmpty = !element.dataset.hero;
  element.dataset.hero = next;
  const hero = heroId ? view.getHero(heroId) : null;
  element.querySelector(".slot-art").innerHTML = hero ? view.imageMarkup(hero) : "";
  setClass(element, "filled", Boolean(hero));
  setClass(element, "empty", !hero);
  setClass(element, "has-cover", false);
  const name = hero ? hero.displayName || hero.name : t("Empty");
  element.title = hero ? `${description} · ${name}` : description;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `${description}: ${name}`);
  if (hero && element.classList.contains("pick")) {
    view.showCover(element, heroId);
  }
  if (animate && wasEmpty && hero) {
    element.classList.add("just-filled");
    element.addEventListener("animationend", () => element.classList.remove("just-filled"), {
      once: true
    });
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { showCover, setSlot };
