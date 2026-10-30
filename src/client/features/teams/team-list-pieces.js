// team list, pieces: teamCard, mineCard, invitationRow, chips, and 4 more.
import {
  LEVELS,
  REGIONS,
  controlLabel,
  levelLabel,
  ruleLabel,
  slotText
} from "../community/community-shared.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { lineHtml } from "../community/stage.js";
import { roleLabel } from "../community/labels.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";
import { teamStepsHtml } from "./form.js";

// ---- the pieces -------------------------------------------------------------------------------
/** A team of the list: a banner in the colour of the team, its mark, what it is, the lanes of its roster. */
export const teamCard = (team, index, myRole) => {
  const place = Math.min(
    100,
    Math.round(((team.memberCount ?? 0) / Math.max(1, team.maxMembers)) * 100)
  );
  const facts = [team.region, team.languages.map(code => code.toUpperCase()).join(" · ")]
    .filter(Boolean)
    .join(" · ");
  return `<a class="tcard tm-card rise d-${Math.min(index, 8)} hue-${teamHue(team)}" href="/teams/${encodeURIComponent(team.id)}">
      <span class="tm-card__banner keep-dark"><span class="pill pill--blue">${esc(levelLabel(team.level))}</span>${myRole ? `<span class="role-badge">${esc(roleLabel(myRole))}</span>` : ""}</span><span class="tm-card__mark">${teamEmblem(team, 80)}</span>
      <span class="tm-card__body"><h2>${esc(team.name)}<small>${esc(team.tag)}</small></h2>${facts ? `<span class="tm-card__facts">${esc(facts)}</span>` : ""}
        ${team.lanes?.length ? `<span class="tm-card__lanes">${laneLogos(team.lanes, 24)}</span>` : ""}
        <span class="tm-card__fill"><span class="bar"><i data-p="${place}"></i></span><small>${t("{count, plural, one {# member} other {# members}}", { count: team.memberCount ?? 0 })}</small></span>
      </span>
    </a>`;
};

/** A team of the person, large: the mark, the role, the next event and the series shared with it (filled in later). */
export const mineCard =
  team => `<a class="tm-mine hue-${teamHue(team)}" href="/teams/${encodeURIComponent(team.id)}" data-mine="${esc(team.id)}">
      <span class="tm-mine__head">${teamEmblem(team, 84)}<span><b>${esc(team.name)}<small>${esc(team.tag)}</small></b><span class="muted">${esc([levelLabel(team.level), team.region, t("{count, plural, one {# member} other {# members}}", { count: team.memberCount ?? 0 })].filter(Boolean).join(" · "))}</span></span><span class="pill pill--blue">${esc(roleLabel(team.myRole))}</span>${icon("arrow", "tm-mine__go")}</span>
      <span class="tm-mine__row tm-mine__next"><span class="skeleton skeleton--line"></span></span>
      <span class="tm-mine__row tm-mine__series"><span class="skeleton skeleton--line skeleton--short"></span></span>
    </a>`;

export const invitationRow = invitation => `<div class="invrow">
      ${teamEmblem(invitation.team, 52)}
      <div class="grow"><b>${esc(invitation.team.name)}</b><small>${esc(roleLabel(invitation.role))}${invitation.lane ? ` · ${esc(laneLabel(invitation.lane))}` : ""} · ${esc(invitation.invitedBy.name)} #${esc(invitation.invitedBy.tag)}</small></div>
      <button type="button" class="btn btn--sm" data-team="decline" data-id="${esc(invitation.id)}">${t("Decline")}</button>
      <button type="button" class="btn btn--primary btn--sm" data-team="accept" data-id="${esc(invitation.id)}">${t("Accept")}</button>
    </div>`;

export const chips = (name, values, label) =>
  [["", t("Any")], ...values.map(value => [value, label(value)])]
    .map(
      ([value, text], index) =>
        `<label class="cm-chip"><input type="radio" name="${name}" value="${esc(value)}"${index === 0 ? " checked" : ""}><span>${esc(text)}</span></label>`
    )
    .join("");

export const filtersHtml =
  view => `<form class="cm-filters" id="team-filters" role="search" novalidate>
      <button type="button" class="btn cm-filters__toggle" data-team="filters-toggle" aria-expanded="false" aria-controls="team-filters-body">${icon("filter", "i--sm")}<span>${t("Filters")}</span></button>
      <div class="cm-filters__body" id="team-filters-body">
        <label class="field">${icon("search", "i--sm")}<input id="team-filter-q" name="q" type="search" placeholder="${t("Search teams")}" aria-label="${t("Search teams")}" autocomplete="off"></label>
        ${
          view.signedIn()
            ? `<div class="cm-group"><h2>${t("Show")}</h2><div class="cm-scope">
          <button type="button" class="on" data-team="list-tab" data-tab="all" aria-pressed="true"><span>${t("All teams")}</span><em class="count" id="count-all">–</em></button>
          <button type="button" data-team="list-tab" data-tab="mine" aria-pressed="false"><span>${t("Your teams")}</span><em class="count" id="count-mine">${view.mine.length}</em></button>
        </div></div>`
            : ""
        }
        <fieldset class="cm-group"><legend>${t("Level")}</legend><div class="cm-chips">${chips("level", LEVELS, levelLabel)}</div></fieldset>
        <fieldset class="cm-group"><legend>${t("Region")}</legend><div class="cm-chips">${chips("region", REGIONS, value => value)}</div></fieldset>
        <button type="button" class="btn btn--ghost btn--sm" data-team="reset-team-filters" hidden>${icon("refresh", "i--sm")}${t("Reset filters")}</button>
      </div>
    </form>`;

export const stepsBand = () =>
  `<section class="tm-how" aria-labelledby="tm-how-title"><h2 id="tm-how-title">${t("How a team works")}</h2>${teamStepsHtml()}</section>`;

/** The latest announcements of teams that look for a scrim. */
export const postsBand = posts =>
  `<section class="card tm-posts" aria-labelledby="tm-posts-title"><div class="card__head"><h2 id="tm-posts-title">${t("Looking for a scrim")}</h2><a class="btn btn--sm" href="/find">${t("Find a scrim")}${icon("arrow", "i--sm")}</a></div>${
    posts.length
      ? `<div class="tm-posts__list">${posts
          .map(
            post =>
              `<a class="tm-post hue-${teamHue(post.team)}" href="/find">${teamEmblem(post.team, 52)}<span><b>${esc(post.team.name)}</b><small>BO${post.format} · ${esc(ruleLabel(post.heroRule))} · ${esc(controlLabel(post.control))}</small><small>${slotText(post.startsAt, post.endsAt)}</small></span></a>`
          )
          .join("")}</div>`
      : lineHtml(
          "search",
          t("No announcement matches"),
          t("Adjust the filters or post your own announcement."),
          `<a class="btn btn--sm" href="/find">${t("Find a scrim")}</a>`,
          "cm-line"
        )
  }</section>`;

export const emptyList = (view, filtered) => {
  const [title, hint] = filtered
    ? [t("No team found"), t("Adjust the active filters.")]
    : view.scope === "mine"
      ? [t("You are not in a team yet."), ""]
      : [t("No team found"), t("Be the first to create one.")];
  const action =
    !filtered && view.signedIn()
      ? `<button type="button" class="btn btn--primary btn--sm" data-team="open-form">${icon("plus", "i--sm")}${t("Create a team")}</button>`
      : "";
  return lineHtml("users", title, hint, action);
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { filtersHtml, emptyList };
