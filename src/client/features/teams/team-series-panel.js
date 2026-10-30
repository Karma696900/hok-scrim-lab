// Series tab: the series shared with the team, its record and the series that can be added.
import { escapeHtml as esc } from "../../lib/dom.js";
import { format } from "../community/labels.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "../community/stage.js";
import { recordOf } from "./team-list.js";
import { seriesRow } from "../scrims/rows.js";
import { t } from "../../app/browser-i18n.js";
import { LEADERS } from "./team-shared.js";

// ---- Series -----------------------------------------------------------------------------------
export function seriesPanel(team, data) {
  const leader = LEADERS.includes(team.myRole);
  const shared = data.series?.items ?? [];
  const sharedIds = new Set(shared.map(series => series.id));
  const candidates = (data.mySeries?.items ?? []).filter(
    item => item.role === "owner" && !sharedIds.has(item.id)
  );
  const summaries = shared.map(series => ({
    teamA: series.teamA.name,
    teamB: series.teamB.name,
    status: series.status,
    score: getSeriesScore(series)
  }));
  const record = recordOf(team, summaries);
  const live = shared.filter(series => series.status === "active").length;
  const figures = [
    [data.series?.total ?? 0, t("Total")],
    [live, t("In progress")],
    [record.won, t("Won")],
    [record.lost, t("Lost")]
  ];
  const list = shared.length
    ? shared
        .map(
          series =>
            `<div class="tp-shared">${seriesRow(series)}${leader ? `<button type="button" class="btn btn--ghost btn--sm" data-team="unshare-series" data-id="${esc(series.id)}">${icon("x", "i--sm")}${t("Remove from the team")}</button>` : ""}</div>`
        )
        .join("")
    : lineHtml(
        "swords",
        t("No series shared with the team yet."),
        t("The creator of a series puts it on the team to let the members read it."),
        "",
        "cm-line"
      );
  const share = leader
    ? `<section class="card tp-share"><div class="card__head"><h2>${t("Share a series")}</h2></div>${
        candidates.length
          ? `<div class="list">${candidates
              .map(
                item =>
                  `<div class="row"><span class="row__body"><b>${esc(item.teamA)} – ${esc(item.teamB)}</b><small>BO${item.bestOf} · ${esc(format(item.updatedAt, { day: "numeric", month: "short" }))}</small></span><button type="button" class="btn btn--sm" data-team="share-series" data-id="${esc(item.id)}">${icon("plus", "i--sm")}${t("Share")}</button></div>`
              )
              .join("")}</div>`
          : lineHtml(
              "plus",
              t("No other series to share."),
              t("Create a series, then put it on the team."),
              `<a class="btn btn--sm" href="/scrims">${t("Scrims & Drafts")}</a>`,
              "cm-line"
            )
      }</section>`
    : "";
  return `<div class="cm-layout cm-layout--side tp-serieslayout${leader ? "" : " is-plain"}">
      <div class="cm-main">
        <ul class="tp-record">${figures.map(([value, label]) => `<li><b>${value}</b><span>${label}</span></li>`).join("")}</ul>
        <div class="stack-y">${list}</div>
      </div>
      ${share ? `<aside class="cm-side">${share}</aside>` : ""}
    </div>`;
}
