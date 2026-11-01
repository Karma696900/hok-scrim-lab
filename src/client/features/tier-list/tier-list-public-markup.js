// public tier list, markup: the stage (heading, lane tabs, date, link to the maker), one board per
// lane (a row per tier, each hero a link to its page with its name in text), and how it is ranked.
import { LANE_ICON_URLS, laneLogos, laneName } from "../../domain/lanes.js";
import { currentLanguage, percentage, t } from "../../app/browser-i18n.js";
import { tierPortrait, tierRow } from "../../domain/tier-labels.js";
import { icon } from "../../../shared/icons.js";

export const SLUGS = {
  clash: "Clash Lane",
  jungle: "Jungle",
  mid: "Mid Lane",
  farm: "Farm Lane",
  roam: "Roamer"
};

const day = value =>
  new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "long" }).format(
    new Date(`${value}T00:00:00`)
  );

/** A hero of a tier: its portrait and name, linking to its page, with where the tier comes from. */
export function heroEntry(view, entry) {
  const hero = view.heroOf(entry.heroId);
  const name = view.esc(view.nameOf(entry.heroId));
  const meta =
    entry.source === "tournaments"
      ? `${t("{count, plural, one {# game} other {# games}}", { count: entry.games })} · ${percentage(entry.winRate ?? 0, 0)}`
      : t("Editors");
  return `<a class="tlp-hero" href="/heroes/${view.esc(entry.heroId)}" data-source="${view.esc(entry.source)}">${tierPortrait(hero)}<span class="tlp-hero__name">${name}</span><small>${meta}</small></a>`;
}

/** The board of one lane: its six tiers, then the heroes not ranked yet. */
export function laneBoard(view, lane) {
  const rows = lane.tiers
    .map(tier =>
      tierRow({
        tier: tier.label,
        label: `<div class="tier-name">${view.esc(tier.label)}</div><span class="tier-count">${tier.heroes.length}</span>`,
        heroes: tier.heroes.length
          ? tier.heroes.map(entry => view.heroEntry(entry)).join("")
          : `<span class="muted">—</span>`
      })
    )
    .join("");
  const unranked = lane.unranked.length
    ? `<p class="tlp-unranked"><b>${t("Not ranked yet")}</b> ${lane.unranked.map(id => `<a href="/heroes/${view.esc(id)}">${view.esc(view.nameOf(id))}</a>`).join(", ")}</p>`
    : "";
  return `<section class="tlp-lane card" data-lane="${view.esc(lane.slug)}" aria-labelledby="tlp-${view.esc(lane.slug)}">
      <h2 id="tlp-${view.esc(lane.slug)}">${laneLogos([lane.lane], 30, { decorative: true })}${view.esc(t("{lane} tier list", { lane: laneName(lane.lane) }))}</h2>
      <div class="tlp-board">${rows}</div>
      ${unranked}
    </section>`;
}

/** The tabs: every lane, then each lane on its own address. */
export function tabs(view) {
  const tab = (href, label, image, on) =>
    `<a class="lane-tab${on ? " active" : ""}" href="${href}"${on ? ' aria-current="page"' : ""}>${image}<span>${label}</span></a>`;
  return `<nav class="lane-tabs tlp-tabs" aria-label="${t("Lane")}">${tab("/tier-list", t("All lanes"), icon("crown"), !view.slug)}${Object.entries(
    SLUGS
  )
    .map(([slug, lane]) =>
      tab(
        `/tier-list/${slug}`,
        view.esc(laneName(lane)),
        `<img src="${LANE_ICON_URLS[lane]}" alt="" width="30" height="30">`,
        view.slug === slug
      )
    )
    .join("")}</nav>`;
}

/** How the list is made, in plain words (the same rules as the server, public-tier-list.js). */
export const method = view =>
  `<section class="tlp-method card"><h2>${t("How the heroes are ranked")}</h2>
      <p>${t("Tournament games first: in each lane, the heroes played at least {count} times in the last three months are ranked by a score (their win rate pulled toward 50 %, recent games weighing more). The best is SS, the worst D, and the tiers between share the gap equally.", { count: view.data?.minGames ?? 10 })}</p>
      <p>${t("The heroes played too little take the tier the editors gave them. The others wait under “Not ranked yet”. The list updates by itself with every tournament series that is entered.")}</p>
      <p><a class="btn" href="/tier-lists">${icon("trophy", "i--sm")}${t("Make your own tier list")}</a> <a class="btn btn--ghost" href="/popular/heroes">${icon("trend", "i--sm")}${t("Popular heroes")}</a></p>
    </section>`;

export function paint(view) {
  if (!view.root) {
    return;
  }
  const lane = SLUGS[view.slug] ?? null;
  const heading = lane
    ? t("Honor of Kings {lane} tier list", { lane: laneName(lane) })
    : t("Honor of Kings tier list");
  const data = view.data;
  const lanes = (data?.lanes ?? []).filter(item => !lane || item.lane === lane);
  const updated = data?.updatedAt
    ? `<p class="tlp-updated">${t("Updated on {date}", { date: day(data.updatedAt) })} · ${t("{count, plural, one {# tournament game} other {# tournament games}}", { count: data.totalGames ?? 0 })}</p>`
    : "";
  const body = view.problem
    ? `<p class="form-error" role="alert">${view.esc(view.problem)}</p>`
    : !data
      ? `<div class="tlp-loading skeleton" aria-busy="true"></div>`
      : lanes.map(item => view.laneBoard(item)).join("");
  view.root.innerHTML = `<header class="page-head tlp-stage">
        <h1>${view.esc(heading)}</h1>
        <p>${t("The best Honor of Kings Global heroes of each lane, from SS to D: the tournament games of the last three months first, the editors' ratings for the heroes played too little.")}</p>
        ${updated}
        ${view.tabs()}
      </header>
      ${body}
      ${view.method()}`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroEntry, laneBoard, tabs, method, paint };
