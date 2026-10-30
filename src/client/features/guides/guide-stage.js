// The stage of the guide page: what is written, and how far it is.
import { fillSceneArt, sceneArtSlot } from "../../domain/scene-art.js";
import { number, t } from "../../app/browser-i18n.js";
import { VARIANTS } from "./guide-shared.js";

// ---- the stage: what is written, and how far it is --------------------------------------------------

export function stage(view) {
  const all = view.heroes();
  const covered = all.filter(hero => view.buildsOf(hero.id) > 0).length;
  const builds = all.reduce((sum, hero) => sum + view.buildsOf(hero.id), 0);
  const combos = [...view.comboCounts.values()].reduce((sum, count) => sum + count, 0);
  const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const figure = (value, label, bar = null) =>
    `<div class="ws-figure"><b>${value}</b><span>${label}</span>${bar === null ? "" : `<div class="bar" aria-hidden="true"><i data-p="${bar}"></i></div>`}</div>`;
  return `<header class="page-head ws-stage keep-dark card--feature${view.rise()}">${sceneArtSlot("ws-stage__art", view.stageHero())}
      <div class="ws-stage__main"><h1>${t("Hero guides")}</h1><p>${t("Write the recommended builds and the combos shown on the page of each hero. Each build is checked against the game catalog.")}</p></div>
      <div class="ws-figures">${figure(`${number(covered)} / ${number(all.length)}`, t("Heroes with at least one build"), percent(covered, all.length))}${figure(`${number(builds)} / ${number(all.length * VARIANTS.length)}`, t("Builds written"), percent(builds, all.length * VARIANTS.length))}${figure(number(combos), t("Combos written"))}</div></header>`;
}

export function paintStage(view) {
  const holder = view.root.querySelector("#bed-stage");
  if (!holder) {
    return;
  }
  holder.innerHTML = view.stage();
  fillSceneArt(holder.querySelector(".ws-stage__art"), view.stageHero());
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { stage, paintStage };
