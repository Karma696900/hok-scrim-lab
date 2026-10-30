// Roster tab: one tall card per player and, for the staff, the invitations.
import { LANES, ROLES, labelName, options } from "../community/community-shared.js";
import { LANE_ICON_URLS, laneLabel, laneLogos, laneName } from "../../domain/lanes.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { roleLabel } from "../community/labels.js";
import { t } from "../../app/browser-i18n.js";
import { formError } from "./team-shared.js";

// ---- Roster -----------------------------------------------------------------------------------
/** The lane of a member: the five logos for the staff to choose from, or only the one it is. */
export function laneCell(member, editable) {
  if (!editable) {
    return member.lane
      ? `<span class="tp-pcard__lane">${laneLogos([member.lane], 28)}<span>${esc(laneLabel(member.lane))}</span></span>`
      : `<span class="faint tp-pcard__lane">—</span>`;
  }
  return `<span class="lane-edit" role="group" aria-label="${t("Lane")}">${LANES.map(
    lane =>
      `<button type="button" class="lane${member.lane === lane ? "" : " off"}" data-team="lane" data-user="${esc(member.userId)}" data-lane="${esc(lane)}" data-role="${esc(member.role)}" aria-pressed="${member.lane === lane}" title="${esc(laneName(lane))}"><img src="${LANE_ICON_URLS[lane]}" alt="${esc(laneName(lane))}" width="28" height="28" decoding="async"></button>`
  ).join("")}</span>`;
}

export function memberCard(team, staff, member, myId) {
  const mineRow = member.userId === myId;
  const canEdit =
    staff && member.role !== "owner" && (team.myRole === "owner" || member.role !== "manager");
  const roleCell = canEdit
    ? `<label class="field"><select data-team="role" data-user="${esc(member.userId)}" aria-label="${t("Role")}">${options(team.myRole === "owner" ? ROLES : ROLES.filter(role => role !== "manager"), member.role, roleLabel)}</select></label>`
    : rolePill(member.role);
  const label = mineRow ? t("Leave the team") : t("Remove");
  const remove =
    canEdit || (mineRow && member.role !== "owner")
      ? `<button type="button" class="btn btn--ghost btn--icon btn--sm tp-pcard__remove" data-team="remove" data-user="${esc(member.userId)}" aria-label="${label}" title="${label}">${icon("logout", "i--sm")}</button>`
      : "";
  const labels = (member.labels ?? [])
    .map(name => `<span class="pill pill--blue">${esc(labelName(name))}</span>`)
    .join("");
  return `<article class="pcard tp-pcard${mineRow ? " is-me" : ""}" data-user="${esc(member.userId)}">
      <a class="tp-pcard__face" href="/players/${encodeURIComponent(member.tag)}" tabindex="-1" aria-hidden="true">${avatarMarkup(member, 96)}</a>
      <div class="tp-pcard__body">
        <b><a class="member-link" href="/players/${encodeURIComponent(member.tag)}">${esc(member.name)}</a></b>
        <small>#${esc(member.tag)}</small>
        ${labels ? `<span class="tp-pcard__labels">${labels}</span>` : ""}
        ${roleCell}
        ${laneCell(member, canEdit && ["player", "sub"].includes(member.role))}
      </div>
      ${remove}
    </article>`;
}

export const countRoles = (members, roles) =>
  members.filter(member => roles.includes(member.role)).length;

export function rosterPanel(team, staff, myId) {
  const members = team.members;
  const kpis = [
    ["crown", countRoles(members, ["owner", "captain"]), t("Owner and captains")],
    ["users", countRoles(members, ["player", "sub"]), t("Players and substitutes")],
    [
      "book",
      countRoles(members, ["manager", "coach", "analyst"]),
      t("Staff (manager, coach, analyst)")
    ]
  ];
  const side = staff
    ? `<aside class="cm-side tp-staff">
          <section class="card" id="team-invite">
            <div class="card__head"><h2>${t("Invite a player")}</h2></div>
            <form id="invite-form" class="tp-form" novalidate>
              <label class="label">${t("Player tag")}<span class="field"><input id="invite-tag" name="tag" maxlength="9" required placeholder="K7M2QX" autocomplete="off"></span><small>${t("The tag is on their profile. They must accept before joining.")}</small></label>
              <div class="tm-form__pair">
                <label class="label">${t("Role")}<span class="field"><select id="invite-role" name="role">${options(team.myRole === "owner" ? ROLES : ROLES.filter(role => role !== "manager"), "player", roleLabel)}</select></span></label>
                <label class="label">${t("Lane")}<span class="field"><select id="invite-lane" name="lane"><option value="">—</option>${options(LANES, "", laneLabel)}</select></span></label>
              </div>
              ${formError("invite-error")}
              <button class="btn btn--primary" type="submit">${icon("send")}${t("Invite")}</button>
            </form>
          </section>
          <section class="card tp-capacity"><div class="card__head"><h2>${t("Member limit")}</h2><b>${members.length + team.invitations.length} / ${team.maxMembers}</b></div><div class="bar"><i data-p="${Math.min(100, Math.round(((members.length + team.invitations.length) / Math.max(1, team.maxMembers)) * 100))}"></i></div><p class="muted">${t("From 7 to 20, pending invitations included")}</p></section>
          <section class="card" id="team-pending">
            <div class="card__head"><h2>${t("Pending invitations")}</h2><span class="count">${team.invitations.length}</span></div>
            ${
              team.invitations.length
                ? `<div class="list">${team.invitations.map(invitation => `<div class="row"><span class="row__body"><b>${esc(invitation.name)}</b><small>#${esc(invitation.tag)} · ${esc(roleLabel(invitation.role))}</small></span><button type="button" class="btn btn--ghost btn--sm" data-team="cancel-invitation" data-id="${esc(invitation.id)}">${t("Cancel")}</button></div>`).join("")}</div>`
                : `<p class="muted">${t("Nobody is waiting for an answer.")}</p>`
            }
          </section>
        </aside>`
    : "";
  return `<div class="cm-layout cm-layout--side tp-rosterlayout${staff ? "" : " is-plain"}">
      <div class="cm-main">
        <div class="cm-bar"><h2 class="tp-h">${t("Roster")} <span class="faint">· ${t("{count} of {max} members", { count: members.length, max: team.maxMembers })}</span></h2>${staff ? `<span class="muted">${t("Click a logo to set the lane of a player.")}</span>` : ""}</div>
        <div class="roster-table tp-roster">${members.map(member => memberCard(team, staff, member, myId)).join("")}</div>
        <div class="tp-kpis">${kpis.map(([name, count, label]) => `<div class="stat"><span class="ico">${icon(name)}</span><span><b>${count}</b><small>${label}</small></span></div>`).join("")}</div>
      </div>
      ${side}
    </div>`;
}

const ROLE_TONE = {
  owner: "cap",
  captain: "cap",
  manager: "mgr",
  coach: "coach",
  analyst: "coach",
  sub: "sub"
};

const rolePill = role =>
  `<span class="role-pill ${ROLE_TONE[role] ?? ""}">${esc(roleLabel(role))}</span>`;
