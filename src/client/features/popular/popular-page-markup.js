// popular page, markup: face, portrait, metList, versus, and 10 more.
import { LANE_ICON_URLS, laneLabel } from "../../domain/lanes.js";
import { percentage, t } from "../../app/browser-i18n.js";
import { responsive } from "../../../shared/media.js";
import { slotImage } from "../../lib/dom.js";
import { day, ruleLabel } from "./popular-page-parts.js";

// ---- markup -----------------------------------------------------------------------------------

/** The picture of a hero at the size it is drawn (a big one for the stage, not the small one of the lists). */
export const face = (hero, size) =>
  hero?.image
    ? `<img ${responsive(hero.image, size, `${size}px`)} alt="" loading="lazy" decoding="async">`
    : `<span class="image-fallback"></span>`;

export const portrait = (view, id, size) => {
  const hero = view.heroOf(id);
  return `<span class="pt s-${size}" title="${view.esc(view.nameOf(id))}">${hero ? slotImage(hero) : `<span class="image-fallback"></span>`}</span>`;
};

/** The opponents faced most often, with how many times each. */
export const metList = (view, list) =>
  list.length
    ? list
        .map(
          entry =>
            `<span class="pop-met" title="${view.esc(view.nameOf(entry.heroId))} ×${entry.count}">${view.portrait(entry.heroId, 32)}<em>×${entry.count}</em></span>`
        )
        .join("")
    : `<span class="muted">—</span>`;

export const versus = (view, entry) => `<div class="pop-vs">
      <div class="pop-vs__line" title="${t("Opponents most often faced in the games it won")}"><b class="pop-vs__label pop-vs__label--won">${t("Won against")}</b>${view.metList(entry.whenWon)}</div>
    </div>`;

/** The win rate, big, with its bar, the record, and how much it was played compared with the most played of the list. */
export const stats = (entry, most) => `<div class="pop-stats">
      <b class="pop-rate" title="${t("Reliable win rate (95 % certainty): {rate}", { rate: percentage(entry.confidence ?? 0, 0) })}">${entry.winRate === null ? "—" : percentage(entry.winRate, 0)}</b>
      <span class="bar" aria-hidden="true"><i data-p="${Math.round((entry.winRate ?? 0) * 100)}"></i></span>
      <span class="bar pop-plays" aria-hidden="true"><i data-p="${Math.round((entry.games / Math.max(1, most)) * 100)}"></i></span>
      <small>${entry.wins}-${entry.losses} · ${t("{count, plural, one {# game} other {# games}}", { count: entry.games })}</small>
      ${entry.games < SMALL_SAMPLE ? `<span class="pill pill--grey">${t("Small sample")}</span>` : ""}
    </div>`;

/** The variants of a group of drafts that look alike: the main version, then each one with the heroes that were swapped. */
export const variantsList = (view, entry) => {
  if (!entry.variants || entry.variants.length < 2) {
    return "";
  }
  const line = variant => {
    const heroesOf = variant.heroes
      .map(id => {
        const swapped = variant.swaps.some(swap => swap.in === id);
        return `<span class="pop-variant__hero${swapped ? " is-swap" : ""}">${view.portrait(id, 32)}</span>`;
      })
      .join("");
    const swaps = variant.leader
      ? `<b class="pill pill--grey">${t("Main version")}</b>`
      : variant.swaps
          .map(
            swap =>
              `<span class="pop-swap">${swap.in ? view.portrait(swap.in, 28) : ""}<em>${t("instead of")}</em>${view.portrait(swap.out, 28)}</span>`
          )
          .join("");
    return `<li class="pop-variant"><div class="pop-variant__heroes">${heroesOf}<span class="visually-hidden">${view.esc(variant.heroes.map(view.nameOf).join(", "))}</span></div><div class="pop-variant__swaps">${swaps}</div><small>${variant.wins}-${variant.losses} · ${t("{count, plural, one {# game} other {# games}}", { count: variant.games })} · ${variant.winRate === null ? "—" : percentage(variant.winRate, 0)}</small></li>`;
  };
  return `<details class="pop-variants"><summary>${t("{count, plural, one {# variant} other {# variants}}", { count: entry.variants.length })}</summary><ol>${entry.variants.map(line).join("")}</ol></details>`;
};

export const draftRow = (view, most) => (entry, index) => `<li class="pop-row">
      <span class="pop-rank">${index + 1}</span>
      <div class="pop-main">
        <div class="pop-heroes">${entry.heroes.map(id => view.portrait(id, 64)).join("")}<span class="visually-hidden">${view.esc(entry.heroes.map(view.nameOf).join(", "))}</span></div>
        ${view.versus(entry)}
        ${view.variantsList(entry)}
      </div>
      ${stats(entry, most)}
    </li>`;

/** A hero of a lane: a big portrait, its name, its figures, who it met. */
export const heroRow = (view, most) => (entry, index) => {
  const hero = view.heroOf(entry.heroId);
  return `<li class="pop-row pop-row--hero">
      <span class="pop-rank">${index + 1}</span>
      <a class="pop-hero" href="/heroes/${encodeURIComponent(entry.heroId)}">${hero?.image ? `<img class="pop-hero__art" ${responsive(hero.image, 112, "112px")} alt="" loading="lazy" decoding="async">` : `<span class="pop-hero__art image-fallback"></span>`}<b>${view.esc(view.nameOf(entry.heroId))}</b></a>
      ${stats(entry, most)}
      ${view.versus(entry)}
    </li>`;
};

export const list = (view, entries, row, ordered) => {
  const most = Math.max(1, ...entries.map(entry => entry.games));
  return entries.length
    ? `<ol class="pop-list${ordered}">${entries.map(row(most)).join("")}</ol>`
    : `<p class="muted pop-none">${view.data.minGames > 1 ? t("No line reaches {count} games in this period: lower the minimum.", { count: view.data.minGames }) : t("Nothing to rank in this period.")}</p>`;
};

export const sideCard = (
  view,
  side,
  table
) => `<section class="card rise pop-side pop-side--${side}">
      <div class="card__head"><h2>${side === "blue" ? t("Blue side") : t("Red side")}</h2><span class="pill pill--grey">${t("{count, plural, one {# draft} other {# drafts}}", { count: table.different })}</span></div>
      ${view.list(view.rank === "rate" ? table.byWinRate : table.byPlays, view.draftRow, "")}
    </section>`;

export function draftsBody(view) {
  return `<div class="pop-sides">${view.sideCard("blue", view.data.sides.blue)}${view.sideCard("red", view.data.sides.red)}</div>`;
}

/** The lane that is open, and its table for the side that is chosen. */
export const laneEntry = view =>
  view.data.lanes.find(item => item.lane === view.lane) ?? view.data.lanes[0];

export function heroesBody(view) {
  const entry = view.laneEntry();
  const table = entry[view.scope];
  const tabs = `<div class="lane-tabs pop-lanes" role="group" aria-label="${t("Lane")}">${view.data.lanes
    .map(
      item =>
        `<button type="button" class="lane-tab${item.lane === view.lane ? " active" : ""}" data-lane="${view.esc(item.lane)}" aria-pressed="${item.lane === view.lane}"><img src="${LANE_ICON_URLS[item.lane]}" alt="" width="30" height="30"><span>${view.esc(laneLabel(item.lane))}</span><small>${item[view.scope].eligible}</small></button>`
    )
    .join("")}</div>`;
  const sides = [
    ["all", t("Both sides")],
    ["blue", t("Blue side")],
    ["red", t("Red side")]
  ];
  return `${tabs}
      <section class="card rise pop-side">
        <div class="card__head"><h2>${view.esc(laneLabel(view.lane))}</h2><div class="seg" role="group" aria-label="${t("Side")}">${sides.map(([value, label]) => `<button type="button" class="${view.scope === value ? "on" : ""}" data-scope="${value}" aria-pressed="${view.scope === value}">${label}</button>`).join("")}</div></div>
        ${view.list(view.rank === "rate" ? table.byWinRate : table.byPlays, view.heroRow, " pop-list--heroes")}
        ${view.data.unplaced ? `<p class="muted pop-note">${t("Picks without a lane entered are left out: {count}.", { count: view.data.unplaced })}</p>` : ""}
      </section>`;
}

export function controls(view) {
  const { from, to } = view.data && !view.problem ? view.data.period : view.chosenPeriod();
  const first = view.data?.period.first ?? "";
  const presets = [
    ...PRESETS.map(months => [
      String(months),
      t("{months, plural, one {# month} other {# months}}", { months })
    ]),
    ["all", t("Since the first game")],
    ["custom", t("Custom")]
  ];
  return `<section class="card rise pop-controls">
        <div class="pop-controls__row">
          <div class="seg" role="group" aria-label="${t("Period")}">${presets.map(([value, label]) => `<button type="button" class="${view.ask.preset === value ? "on" : ""}" data-preset="${value}" aria-pressed="${view.ask.preset === value}">${label}</button>`).join("")}</div>
          ${
            view.ask.preset === "custom"
              ? `<div class="pop-custom"><label class="label">${t("From")}<span class="field"><input id="pop-from" type="date" value="${view.esc(view.ask.from)}"${first ? ` min="${view.esc(first)}"` : ""}></span></label><label class="label">${t("To")}<span class="field"><input id="pop-to" type="date" value="${view.esc(view.ask.to)}"></span></label><button type="button" class="btn btn--primary" data-apply>${t("Apply")}</button></div>`
              : ""
          }
        </div>
        <div class="pop-controls__row">
          <label class="label">${t("Hero rule")}<span class="field"><select id="pop-rule"><option value="">${t("All rules")}</option>${(view.data?.rules ?? ["classic", "free-for-all", "global-ban-pick"]).map(rule => `<option value="${rule}"${view.ask.rule === rule ? " selected" : ""}>${view.esc(ruleLabel(rule))}</option>`).join("")}</select></span></label>
          <label class="label">${t("Minimum games")}<span class="field"><select id="pop-min">${MIN_GAMES.map(count => `<option value="${count}"${view.ask.minGames === count ? " selected" : ""}>${count}</option>`).join("")}</select></span></label>
          <div class="label">${t("Rank by")}<div class="seg" role="group" aria-label="${t("Rank by")}"><button type="button" class="${view.rank === "plays" ? "on" : ""}" data-rank="plays" aria-pressed="${view.rank === "plays"}">${t("Most played")}</button><button type="button" class="${view.rank === "rate" ? "on" : ""}" data-rank="rate" aria-pressed="${view.rank === "rate"}" title="${t("Ranked by the lowest win rate the games allow us to believe: one win in one game does not beat a hero that proved itself over many games.")}">${t("Win rate")}</button></div></div>
        </div>
        <p class="muted pop-note">${from && to ? `${view.esc(day(from))} → ${view.esc(day(to))}` : ""}${view.data ? ` · ${t("{count, plural, one {# game} other {# games}}", { count: view.data.totalGames })}` : ""}${first ? ` · ${t("Tournament games only, never scrims. The first one is from {date}.", { date: view.esc(day(first)) })}` : ` · ${t("Tournament games only, never scrims.")}`}</p>
        ${view.problem ? `<p class="form-error" role="alert">${view.esc(view.problem)}</p>` : ""}
      </section>`;
}

// The popularity pages: the drafts and the heroes that win most and that are played most in the
// tournament games (never the scrims), over a period of at least three months that cannot start
// before the first game that was entered. Two tabs: the drafts of each side, and the heroes of each
// lane. Everything is computed by the server (see server/features/tournaments/popular.js); this
// module draws it and asks again when the period or a filter changes. A stage opens each page (the
// cover of the hero that leads, the figures of the period, the best drafts or heroes in big portraits).

const PRESETS = [3, 6, 12];

const MIN_GAMES = [1, 2, 3, 5, 10];

/** Below this many games a rate says little: the line is marked. */
const SMALL_SAMPLE = 3;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  portrait,
  metList,
  versus,
  variantsList,
  draftRow,
  heroRow,
  list,
  sideCard,
  draftsBody,
  laneEntry,
  heroesBody,
  controls
};
