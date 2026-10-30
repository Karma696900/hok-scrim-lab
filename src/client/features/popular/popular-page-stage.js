// popular page, stage: leadHero, podium, figures, aside, and 1 more.
import { LANE_ICON_URLS, laneLabel } from "../../domain/lanes.js";
import { PICK_LANES } from "../../../shared/draft-model.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { skeleton } from "../../lib/skeleton.js";
import { slotImage } from "../../lib/dom.js";
import { face } from "./popular-page-markup.js";

// ---- the stage ----------------------------------------------------------------------------------

/** The hero that leads the page: the most played of the lane that is open, the first of the best draft, or the hero of the day. */
export function leadHero(view) {
  let id = null;
  if (view.data && view.data.totalGames > 0) {
    id =
      view.tab === "heroes"
        ? view.laneEntry()[view.scope].byPlays[0]?.heroId
        : (view.data.sides.blue.byPlays[0] ?? view.data.sides.red.byPlays[0])?.heroes[0];
  }
  return (id && view.heroOf(id)) || sceneHero(3);
}

/** The best of the page in big portraits: the three most played heroes of the lane, or the best draft of each side. */
export function podium(view) {
  if (!view.data || view.data.totalGames === 0 || view.problem) {
    return "";
  }
  if (view.tab === "heroes") {
    const top = view.laneEntry()[view.scope].byPlays.slice(0, 3);
    return `<ol class="pop-podium">${top
      .map(
        (entry, index) =>
          `<li><span class="pop-podium__face">${face(view.heroOf(entry.heroId), 132)}</span><b>${view.esc(view.nameOf(entry.heroId))}</b><small>${t("{count, plural, one {# game} other {# games}}", { count: entry.games })}</small><span class="pop-podium__rank">${index + 1}</span></li>`
      )
      .join("")}</ol>`;
  }
  const side = (name, table) =>
    table.byPlays[0]
      ? `<li class="pop-podium__draft pop-podium__draft--${name}"><span>${name === "blue" ? t("Blue side") : t("Red side")}</span><div>${table.byPlays[0].heroes.map(id => view.portrait(id, 56)).join("")}</div></li>`
      : "";
  return `<ul class="pop-podium pop-podium--drafts">${side("blue", view.data.sides.blue)}${side("red", view.data.sides.red)}</ul>`;
}

export function figures(view) {
  if (!view.data || view.problem || view.data.totalGames === 0) {
    return "";
  }
  const second =
    view.tab === "drafts"
      ? [view.data.sides.blue.different + view.data.sides.red.different, t("Drafts")]
      : [view.laneEntry().picks, t("Picks")];
  return `<div class="pop-figures"><div><b>${number(view.data.totalGames)}</b><span>${t("Games")}</span></div><div><b>${number(second[0])}</b><span>${second[1]}</span></div></div>`;
}

/** What the page holds when no game was played in the period: how it counts, and the heroes of each lane. */
export function aside(view) {
  const steps = [
    [t("Tournament games"), t("Every game entered by the staff counts, never a scrim.")],
    [t("Sides and lanes"), t("Drafts are ranked for each side, heroes for each lane.")],
    [t("Three months at least"), t("A shorter period says too little, so it is refused.")]
  ];
  const lanes = PICK_LANES.map(name => {
    const heroes = view.state.heroes.filter(
      hero => hero.availableGlobal !== false && hero.lanes?.includes(name)
    );
    return `<li><span class="pop-lane__name"><img src="${LANE_ICON_URLS[name]}" alt="" width="26" height="26">${view.esc(laneLabel(name))}<small>${number(heroes.length)}</small></span><span class="pop-lane__heroes">${heroes
      .slice(0, 16)
      .map(
        hero =>
          `<a class="pt s-48" href="/heroes/${encodeURIComponent(hero.id)}" title="${view.esc(hero.displayName || hero.name)}">${slotImage(hero)}</a>`
      )
      .join("")}</span></li>`;
  }).join("");
  return `<div class="pop-aside"><ol class="pop-steps">${steps.map(([title, text]) => `<li><b>${title}</b><span>${text}</span></li>`).join("")}</ol><ul class="pop-lanelist">${lanes}</ul></div>`;
}

export function paint(view) {
  const heading = view.tab === "drafts" ? t("Popular drafts") : t("Popular heroes");
  const lead =
    view.tab === "drafts"
      ? t(
          "The five-hero drafts that win most and that are played most in tournaments, for each side."
        )
      : t("The heroes that win most and that are played most in tournaments, for each lane.");
  const idle = !view.loading && view.data && !view.problem && view.data.totalGames === 0;
  const body = view.loading
    ? skeleton("grid", 4)
    : !view.data || view.problem
      ? ""
      : idle
        ? `<div class="empty card pop-empty">${icon("trophy", "i--sm")}<span><b>${t("No tournament game in this period.")}</b> ${t("Widen the period, or ask an administrator to enter the games that were played.")}</span></div>${view.aside()}`
        : view.tab === "drafts"
          ? view.draftsBody()
          : view.heroesBody();
  const hero = view.leadHero();
  view.root.innerHTML = `<header class="page-head pp-stage keep-dark rise">${sceneArtSlot("pp-stage__art", hero)}
        <div class="pp-stage__title">
          <h1>${heading}</h1>
          <p>${lead}</p>
          ${view.figures()}
        </div>
        ${view.podium()}
        <nav class="pp-tabs popular-tabs" aria-label="${t("Popular")}"><a class="${view.tab === "drafts" ? "on" : ""}" href="/popular"${view.tab === "drafts" ? ' aria-current="page"' : ""}>${icon("users")}${t("Drafts")}</a><a class="${view.tab === "heroes" ? "on" : ""}" href="/popular/heroes"${view.tab === "heroes" ? ' aria-current="page"' : ""}>${icon("crown")}${t("Heroes")}</a></nav>
      </header>
      ${view.controls()}
      ${body}`;
  fillSceneArt(view.root.querySelector(".pp-stage__art"), hero);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { leadHero, podium, figures, aside, paint };
