// player, pieces page: heroCard, laneOf, heroesBlock, aboutBlock, and 5 more.
import { avatarMarkup } from "../auth/auth-avatar.js";
import { classLabel, laneLabel, laneLogos, laneName } from "../../domain/lanes.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { heroGoalRow } from "../../domain/hero-combos.js";
import { icon } from "../../../shared/icons.js";
import { labelName, levelLabel } from "./community-shared.js";
import { lineHtml } from "./stage.js";
import { responsive } from "../../../shared/media.js";
import { roleLabel } from "./labels.js";
import { sceneHero } from "../../domain/scene-art.js";
import { seriesRow } from "../scrims/rows.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";
import { heroName, languageName } from "./player-parts.js";

// ---- the pieces of the page -------------------------------------------------------------------
/** A hero as a tall portrait: the lanes at the top, the name and the class on a dark fade at the bottom. */
export const heroCard = found =>
  `<a class="pl-hero keep-dark" href="/heroes/${encodeURIComponent(found.id)}">${
    found.image
      ? `<img class="pl-hero__img" ${responsive(found.image, 240, "(min-width: 900px) 240px, 45vw")} alt="" loading="lazy" decoding="async">`
      : `<span class="image-fallback pl-hero__fallback"></span>`
  }<span class="pl-hero__lanes">${laneLogos(found.lanes, 22, { decorative: true })}</span><span class="pl-hero__name"><b>${esc(heroName(found))}</b><small>${esc(found.roles?.[0] ? classLabel(found.roles[0]) : t("Global"))}</small></span></a>`;

export const laneOf = player =>
  player.profile.lane || player.teams.find(team => team.lane)?.lane || "";

export function heroesBlock(view, player) {
  const p = player.profile;
  const mains = p.mainHeroes.map(view.hero).filter(Boolean);
  const lane = laneOf(player);
  if (mains.length) {
    return `<section class="card pl-heroes" aria-labelledby="pl-heroes-title"><div class="card__head"><h2 id="pl-heroes-title">${t("Main heroes")}</h2><span class="count">${mains.length}</span></div><div class="pl-heroes__grid">${mains.map(heroCard).join("")}</div></section>`;
  }
  // no main hero chosen: the heroes of the lane of the player, or a line
  const suggestions = lane
    ? view.state.heroes
        .filter(
          item => item.availableGlobal !== false && !item.isFlowborn && item.lanes?.includes(lane)
        )
        .toSorted((left, right) => heroName(left).localeCompare(heroName(right)))
        .slice(0, 6)
    : [];
  const fallback = suggestions.length
    ? []
    : [
        ...new Map(
          [0, 1, 2, 3, 4, 5]
            .map(offset => sceneHero(offset))
            .filter(Boolean)
            .map(found => [found.id, found])
        ).values()
      ];
  const action = player.isMe
    ? `<button type="button" class="btn btn--sm" data-community="edit-profile">${icon("pencil", "i--sm")}${t("Edit my profile")}</button>`
    : "";
  return `<section class="card pl-heroes" aria-labelledby="pl-heroes-title"><div class="card__head"><h2 id="pl-heroes-title">${suggestions.length ? t("Heroes of {lane}", { lane: esc(laneName(lane)) }) : fallback.length ? t("More heroes") : t("Main heroes")}</h2></div>${lineHtml("target", t("No main hero chosen."), "", action, "cm-line")}${suggestions.length || fallback.length ? `<div class="pl-heroes__grid pl-heroes__grid--small">${[...suggestions, ...fallback].map(heroCard).join("")}</div>` : ""}</section>`;
}

/** About: what the person wrote, then the facts as lines (the lane, the time zone, the languages, the teams). */
export function aboutBlock(player) {
  const p = player.profile;
  const lane = laneOf(player);
  const facts = [
    [
      t("Lane"),
      lane
        ? `${laneLogos([lane], 20, { decorative: true })}<span>${esc(laneName(lane))}</span>`
        : ""
    ],
    [t("Time zone"), p.timezone ? esc(p.timezone) : ""],
    [t("Languages"), p.languages.map(code => esc(languageName(code))).join(", ")],
    [t("Teams"), player.teams.length ? String(player.teams.length) : ""]
  ].filter(([, value]) => value);
  return `<section class="card pl-about" aria-labelledby="pl-about-title"><div class="card__head"><h2 id="pl-about-title">${t("About")}</h2></div>${p.bio ? `<p>${esc(p.bio)}</p>` : `<p class="muted">${t("No description yet.")}</p>`}${facts.length ? `<dl class="pl-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>` : ""}</section>`;
}

/** The teams: one block each, with what the page of the team says about it. */
export const teamsBlock = (player, infos) =>
  `<section class="card" aria-labelledby="pl-teams-title"><div class="card__head"><h2 id="pl-teams-title">${t("Teams")}</h2><span class="count">${player.teams.length}</span></div>${
    player.teams.length
      ? `<div class="pl-teams">${player.teams
          .map(team => {
            const info = infos.get(team.id);
            const facts = info
              ? [
                  levelLabel(info.level),
                  info.region,
                  t("{count, plural, one {# member} other {# members}}", {
                    count: info.members.length
                  })
                ].filter(Boolean)
              : [];
            return `<a class="pl-team hue-${teamHue(team)}" href="/teams/${encodeURIComponent(team.id)}">${teamEmblem(team, 72)}<span class="row__body"><b>${esc(team.name)}<small>${esc(team.tag)}</small></b><small>${esc(roleLabel(team.role))}${team.lane ? ` · ${esc(laneLabel(team.lane))}` : ""}</small>${facts.length ? `<small>${esc(facts.join(" · "))}</small>` : ""}</span>${team.lane ? laneLogos([team.lane], 28) : ""}</a>`;
          })
          .join("")}</div>`
      : lineHtml(
          "users",
          t("Not in a team yet."),
          "",
          player.isMe ? `<a class="btn btn--sm" href="/teams">${t("Teams")}</a>` : "",
          "cm-line"
        )
  }</section>`;

export const matesBlock = mates =>
  mates.length
    ? `<section class="card" aria-labelledby="pl-mates-title"><div class="card__head"><h2 id="pl-mates-title">${t("Team-mates")}</h2><span class="count">${mates.length}</span></div><div class="pl-mates">${mates.map(mate => `<a class="pl-mate" href="/players/${encodeURIComponent(mate.tag)}">${avatarMarkup(mate, 52)}<b>${esc(mate.name)}</b><small>${esc(roleLabel(mate.role))}</small></a>`).join("")}</div></section>`
    : "";

/** What the person is asked to train by their teams, and their last series (their own page only). */
export function personalBlocks(view, assigned, isMe) {
  const goals = assigned.teams.length
    ? `<section class="card" aria-labelledby="pl-goals-title"><div class="card__head"><h2 id="pl-goals-title">${t("Heroes to master")}</h2></div>${assigned.teams
        .map(
          entry =>
            `<h3 class="subheading">${esc(entry.team.name)} <span class="pill pill--grey">${esc(entry.team.tag)}</span></h3><ul class="stack-y goal-list">${entry.heroGoals.map(goal => heroGoalRow(goal, { hero: view.hero(goal.heroId), progress: goal.progress })).join("")}</ul>`
        )
        .join("")}</section>`
    : "";
  const recent = isMe ? view.state.series.slice(0, 3) : [];
  const series = recent.length
    ? `<section class="card" aria-labelledby="pl-series-title"><div class="card__head"><h2 id="pl-series-title">${t("Scrims & Drafts")}</h2><a class="btn btn--sm btn--ghost" href="/scrims">${t("Series")}${icon("arrow", "i--sm")}</a></div><div class="list">${recent.map(seriesRow).join("")}</div></section>`
    : "";
  return goals || series ? `<div class="pl-row">${goals}${series}</div>` : "";
}

export const labelsCard = (view, player) =>
  view.state.auth.user?.isAdmin
    ? `<section class="card"><div class="card__head"><h2>${t("Labels")}</h2><span class="pill pill--grey">${t("Admin")}</span></div><form id="labels-form"><div class="chip-checks">${LABELS.map(label => `<label class="chip-check"><input type="checkbox" name="labels" value="${label}"${player.labels.includes(label) ? " checked" : ""}><span>${esc(labelName(label))}</span></label>`).join("")}</div><button class="btn btn--sm" type="submit">${t("Save the labels")}</button></form></section>`
    : "";

export const inviteCard = (player, staff) =>
  !player.isMe && staff.length
    ? `<section class="card" id="pl-invite"><div class="card__head"><h2>${t("Invite to team")}</h2></div><form id="invite-player" class="hstack wrap"><label class="field grow"><select name="teamId" aria-label="${t("Team")}">${staff.map(team => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join("")}</select></label><button class="btn btn--primary" type="submit">${icon("send")}${t("Invite")}</button></form><p class="form-error" id="invite-error" role="alert"></p></section>`
    : "";

const LABELS = ["verified", "moderator", "organiser", "contributor"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroesBlock, personalBlocks, labelsCard };
