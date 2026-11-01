// popular page, what the shared score added: the pick, ban and presence rates of a hero, the phase each
// hero of a draft is picked in (with the enemy it answers), and the best duos of the period.
import { LANE_ICON_URLS, laneLabel } from "../../domain/lanes.js";
import { percentage, t } from "../../app/browser-i18n.js";

const PHASE_LABELS = {
  first: () => t("First pick"),
  early: () => t("Early pick"),
  late: () => t("Late pick"),
  last: () => t("Last pick")
};

/** How often a hero was picked in this lane, banned, and there at all (picked or banned). */
export const rates = entry =>
  entry.presence === undefined
    ? ""
    : `<p class="pop-rates"><span>${t("Pick {rate}", { rate: percentage(entry.pickRate ?? 0, 0) })}</span><span>${t("Ban {rate}", { rate: percentage(entry.banRate ?? 0, 0) })}</span><b>${t("Presence {rate}", { rate: percentage(entry.presence, 0) })}</b></p>`;

/** Under a draft: when each of its heroes is picked, and the enemy it answers when it is a counter-pick. */
export const phases = (view, entry) => {
  const known = entry.heroes.filter(id => entry.phases?.[id]?.phase);
  if (!known.length) {
    return "";
  }
  const item = id => {
    const { phase, counterTo } = entry.phases[id];
    const counter = counterTo
      ? `<span class="pop-phase__vs" title="${view.esc(t("Answers {name}", { name: view.nameOf(counterTo) }))}"><em>${t("vs")}</em>${view.portrait(counterTo, 24)}</span>`
      : "";
    return `<li class="pop-phase">${view.portrait(id, 28)}<small>${PHASE_LABELS[phase]()}</small>${counter}</li>`;
  };
  return `<ol class="pop-phases" aria-label="${t("Pick phases")}">${known.map(item).join("")}</ol>`;
};

/** The best duos: over all the lanes, or for one pair of lanes chosen above the list. */
export function duosCard(view) {
  const duos = view.data.duos;
  if (!duos) {
    return "";
  }
  const pairs = Object.keys(duos.byLanes);
  const chosen = pairs.includes(view.duoLanes) ? view.duoLanes : "";
  const entries = chosen ? duos.byLanes[chosen] : duos.all;
  const pairLabel = pair =>
    pair
      .split("+")
      .map(
        lane =>
          `<img src="${LANE_ICON_URLS[lane]}" alt="" width="22" height="22">${view.esc(laneLabel(lane))}`
      )
      .join(" + ");
  const row = (duo, index) => `<li class="pop-duo">
      <span class="pop-rank">${index + 1}</span>
      <div class="pop-duo__heroes">${duo.heroes.map(id => view.portrait(id, 48)).join("")}<span class="visually-hidden">${view.esc(duo.heroes.map(view.nameOf).join(", "))}</span></div>
      <b class="pop-rate">${duo.winRate === null ? "—" : percentage(duo.winRate, 0)}</b>
      <small>${duo.wins}-${duo.losses} · ${t("{count, plural, one {# game} other {# games}}", { count: duo.games })}</small>
    </li>`;
  return `<section class="card rise pop-duos">
      <div class="card__head"><h2>${t("Best duos")}</h2>
        <label class="label">${t("Lanes")}<span class="field"><select id="pop-duo-lanes"><option value="">${t("All lanes")}</option>${pairs.map(pair => `<option value="${view.esc(pair)}"${pair === chosen ? " selected" : ""}>${view.esc(pair.split("+").map(laneLabel).join(" + "))}</option>`).join("")}</select></span></label>
      </div>
      ${chosen ? `<p class="pop-duo__lanes">${pairLabel(chosen)}</p>` : ""}
      ${entries.length ? `<ol class="pop-list pop-list--duos">${entries.map(row).join("")}</ol>` : `<p class="muted pop-none">${t("Nothing to rank in this period.")}</p>`}
    </section>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { phases, duosCard };
