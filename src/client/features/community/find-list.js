// The list of announcements.
import { STAFF, controlLabel, hourLabel, levelLabel, ruleLabel } from "./community-shared.js";
import { ago, format } from "./labels.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, setFigure } from "./stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";

// ---- the list ---------------------------------------------------------------------------------
export const isMine = (view, post) =>
  view.ctx.myTeams().some(team => team.id === post.team.id && STAFF.includes(team.myRole));

export const postCard = (
  view,
  post,
  index
) => `<article class="ann fd-card hue-${teamHue(post.team)} rise d-${Math.min(index, 8)}">
      <span class="fd-card__mark">${teamEmblem(post.team, 72)}</span>
      <div class="fd-card__main">
        <h2>${esc(post.team.name)}<small>${esc(post.team.tag ?? "")}</small></h2>
        <p class="fd-card__facts"><span class="pill pill--blue">${esc(levelLabel(post.team.level))}</span>${post.team.region ? `<span>${esc(post.team.region)}</span>` : ""}<span class="faint">${esc(ago(post.createdAt))}</span></p>
        ${post.note ? `<blockquote>“${esc(post.note)}”</blockquote>` : ""}
        <div class="fd-card__tags"><span class="pill pill--grey">BO${post.format}</span><span class="pill pill--grey">${esc(ruleLabel(post.heroRule))}</span><span class="pill pill--grey">${esc(controlLabel(post.control))}</span></div>
      </div>
      <div class="fd-card__slot"><span class="cm-date">${new Date(post.startsAt).getDate()}<small>${esc(format(post.startsAt, { weekday: "short" }))}</small></span><span><b>${esc(hourLabel(post.startsAt))}–${esc(hourLabel(post.endsAt))}</b>${post.team.timezone ? `<small>${esc(post.team.timezone)}</small>` : ""}</span></div>
      <div class="fd-card__actions">
        ${view.isMine(post) ? `<button type="button" class="btn btn--ghost btn--sm" data-community="close-post" data-id="${esc(post.id)}">${t("Close the announcement")}</button>` : `<button type="button" class="btn btn--primary btn--sm" data-community="request-post" data-id="${esc(post.id)}">${t("Request a scrim")}</button>`}
        <a class="btn btn--ghost btn--sm" href="/teams/${encodeURIComponent(post.team.id)}">${t("View team")}</a>
      </div>
    </article>`;

export async function loadPosts(view) {
  const root = view.ctx.root();
  const data = new FormData(root.querySelector("#find-filters"));
  const query = new URLSearchParams();
  for (const name of FILTERS) {
    const value = String(data.get(name) ?? "");
    if (value) {
      query.set(name, value);
    }
  }
  const day = String(data.get("date") ?? "");
  if (day) {
    const start = new Date(`${day}T00:00`).getTime();
    if (Number.isFinite(start)) {
      query.set("from", String(start));
      query.set("to", String(start + 24 * 3600_000));
    }
  }
  const result = await view.api(`/api/scrim-posts?${query}`);
  view.posts = result.items;
  const active = [...query.keys()].length > 0;
  if (!active) {
    setFigure(root, "fig-open", number(result.total));
    setFigure(
      root,
      "fig-regions",
      new Set(view.posts.map(post => post.team.region).filter(Boolean)).size
    );
  }
  root.querySelector("#posts-count").innerHTML = t("{count} open", {
    count: `<b>${result.total}</b>`
  });
  for (const button of root.querySelectorAll('[data-community="reset-filters"]')) {
    button.hidden = !active;
  }
  root.querySelector("#post-list").innerHTML = view.posts.length
    ? view.posts.map(view.postCard).join("")
    : lineHtml(
        "search",
        t("No announcement matches"),
        t("Adjust the filters or post your own announcement."),
        `<button type="button" class="btn btn--sm" data-community="open-post-form">${icon("plus", "i--sm")}${t("Post “Looking for scrim”")}</button>`
      );
}

/** The filters of the list and the name of each in the query of the announcements API. */
const FILTERS = ["level", "region", "format", "rule", "control", "minHours"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { isMine, postCard, loadPosts };
