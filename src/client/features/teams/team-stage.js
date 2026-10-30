// The top of the page of a team: the cover under the colour of the team, its name, the figures and the actions.
import { LANES, levelLabel } from "../community/community-shared.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, stageHero, stageHtml } from "../community/stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";
import { languageNames } from "./team-shared.js";

export const notFound = message =>
  lineHtml(
    "shieldcheck",
    t("Team not found"),
    esc(message),
    `<a class="btn btn--sm" href="/teams">${t("Teams")}</a>`
  );

// ---- the stage --------------------------------------------------------------------------------
export function stage(team, staff, planned, signedIn) {
  const lanes = lanesOf(team.members);
  const find = team.myRole
    ? `<a class="btn${staff ? "" : " btn--primary"} btn--lg" href="/find">${icon("search")}${t("Find a scrim")}</a>`
    : signedIn
      ? `<a class="btn btn--primary btn--lg" href="/find?to=${encodeURIComponent(team.id)}">${icon("search")}${t("Request a scrim")}</a>`
      : "";
  const facts = [
    team.region,
    levelLabel(team.level),
    languageNames(team.languages).join(", "),
    team.timezone
  ]
    .filter(Boolean)
    .join(" · ");
  const hero = stageHero(3 + teamHue(team) * 5);
  return {
    hero,
    html: stageHtml({
      cls: `team-hero hue-${teamHue(team)}`,
      hero,
      lead: `<div class="crumb"><a class="link" href="/teams">${t("Teams")}</a>${icon("right")}<span>${esc(team.name)}</span></div>`,
      badge: teamEmblem(team, 132),
      title: `${esc(team.name)} <small>${esc(team.tag)}</small>`,
      text: esc(facts),
      actions: `${staff ? `<button type="button" class="btn btn--primary btn--lg" data-team="focus-invite">${icon("plus")}${t("Invite a player")}</button>` : ""}${find}${staff ? `<button type="button" class="btn btn--lg" data-team="open-form">${icon("pencil")}${t("Edit the team")}</button>` : ""}<button type="button" class="btn btn--lg btn--icon" data-team="more" aria-label="${t("Actions")}" aria-haspopup="menu" aria-expanded="false">${icon("more")}</button>`,
      figures: [
        [`${team.members.length}<small>/${team.maxMembers}</small>`, t("Members")],
        [`${lanes.length}<small>/5</small>`, t("Lanes covered")],
        [number(planned), team.myRole ? t("Planned events") : t("Open windows")]
      ]
    })
  };
}

const lanesOf = members => LANES.filter(lane => members.some(member => member.lane === lane));
